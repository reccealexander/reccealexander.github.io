/**
 * What a stalk is made of, shared by the meadow's wildflowers and the
 * superbloom's poppies.
 *
 * Both families used to be a vertical stick with a disc on the end, and at the
 * size the hero reads them at that is exactly what they looked like. A plant is
 * not that: it leans, it puts a branch or two off the main stalk, it carries a
 * leaf on those branches, and it very often holds a second head — open, or
 * still a bud — at a different height from the first. Those four things are
 * what this file adds, and it adds them once because a poppy and a cornflower
 * disagree about their flowers and not about their stems.
 *
 * ## The one rule everything here obeys
 *
 * The field bends on a single number, `k` — the ambient gust and the cursor's
 * spring summed — and the bend is drawn as an arc sampled along the stalk
 * rather than as a rotation applied at its tip. That is what makes it
 * impossible for a head to slide off the stem it grew on, and the moment a
 * plant has parts hanging off it at other heights it has to stay impossible for
 * those too.
 *
 * So there is exactly one way to place a vertex in this file: say how far up
 * the stalk it sits (`t`, 0 at the root and 1 at the main head) and how far off
 * the stalk's own axis it hangs (`off`, in metres). `onStalk` does the rest —
 * it finds the axis at that height, and it rotates the offset by the angle the
 * stalk has already turned through by the time it gets there. A branch base
 * given `off = 0` is *on* the axis by construction and cannot leave it; a leaf
 * hanging off that branch is placed relative to the branch, which is placed
 * relative to the axis, so the whole chain moves as one thing. Nothing anywhere
 * gets to compute its own world position.
 *
 * The plant's own lean is folded into the same place: it is a static offset of
 * the axis, growing as t², which is the same shape the wind's arc has. That
 * means a leaning plant and a bending plant are the same expression evaluated
 * twice, and a plant leaning hard still bends correctly on the cursor.
 */
export const STALK_GLSL = /* glsl */ `
vec3 rotX(vec3 p, float a) {
  float s = sin(a), c = cos(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

vec3 rotY(vec3 p, float a) {
  float s = sin(a), c = cos(a);
  return vec3(c * p.x + s * p.z, p.y, c * p.z - s * p.x);
}

/**
 * Where the stalk's own axis has got to, t of the way up, before the wind.
 * A plant that grew at an angle carries that angle as a bow rather than as a
 * tilt of the whole thing: a tilted plant's root leaves the ground.
 */
vec3 stalkAxis(float t, float h, float az, float bow) {
  return vec3(sin(az), 0.0, cos(az)) * (h * bow * t * t);
}

/** ...and the angle it is leaning through by then, which is that bow's slope. */
vec3 stalkLean(vec3 p, float t, float az, float bow) {
  return rotY(rotX(rotY(p, -az), 2.0 * bow * t), az);
}

/**
 * A point t of the way up a stalk of height h, hanging \`off\` metres off its
 * axis, with the field's bend k through it. Everything on the plant goes
 * through here — see the note at the top of stalk.ts for why.
 */
vec3 onStalk(float t, vec3 off, float h, float k, float az, float bow) {
  vec3 spine = vec3(0.0, h * (t - k * k * t * t * t / 6.0), h * (k * t * t * 0.5));
  return spine + rotX(stalkAxis(t, h, az, bow) + off, k * t);
}

/**
 * A side branch, as an arc that leaves the stalk almost sideways and turns back
 * up. \`s\` is 0 at the stalk and 1 at the tip; the pair it returns is how far
 * up the stalk that point is and how far out from it. Branch, leaf and whatever
 * the branch is carrying all read this, so they cannot disagree about where the
 * branch is.
 */
vec2 branchAt(float s, float t0, float t1, float len) {
  return vec2(mix(t0, t1, s * s), len * sin(s * 1.35) / sin(1.35));
}

/** The width of a thing that is pointed at both ends. */
float spanOf(float v, float bias) {
  return sin(3.14159265 * pow(clamp(v, 0.0, 1.0), bias));
}
`;

/**
 * The builder the two families share.
 *
 * Each part is a grid of vertices whose `position` means whatever the vertex
 * shader wants it to; the convention across both files is (row, column, index),
 * where index is which branch or which lobe this one belongs to. Keeping the
 * strips here rather than in each renderer is what stops the two drifting into
 * subtly different leaves.
 */
export interface PartSink {
  push(x: number, y: number, z: number, u: number, v: number, p: number): number;
  index: number[];
}

/** A strip of quads: `rows` values of v, `cols` columns across. */
function strip(
  sink: PartSink,
  rows: readonly number[],
  cols: readonly number[],
  slot: number,
  part: number,
) {
  let first = -1;
  for (const v of rows) {
    for (const c of cols) {
      const id = sink.push(v, c, slot, Math.abs(c), v, part);
      if (first < 0) first = id;
    }
  }
  const w = cols.length;
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const a = first + r * w + c;
      sink.index.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  }
}

/**
 * A branch, as a channelled ribbon rather than a flat one.
 *
 * A flat ribbon a few millimetres wide vanishes the moment you look along it,
 * and a branch that disappears from half the bearings in the field is a head
 * floating beside a stem. Three columns — two edges and a ridge lifted off
 * them — is the cheapest section that keeps a silhouette from everywhere, and
 * it costs the same triangles a two-column ribbon would have.
 */
export function branchPart(sink: PartSink, slot: number, part: number, segments = 2) {
  const rows: number[] = [];
  for (let i = 0; i <= segments; i++) rows.push(i / segments);
  strip(sink, rows, [-1, 0, 1], slot, part);
}

/**
 * A leaf: a channelled blade, pointed at both ends, drooping over its length.
 *
 * Three columns for the same reason the branch has three — a leaf held
 * perfectly flat is a decal, and one seen edge-on is nothing at all.
 */
export function leafPart(sink: PartSink, slot: number, part: number, rows: readonly number[]) {
  strip(sink, rows, [-1, 0, 1], slot, part);
}

/**
 * The thing a branch carries: a bud, or a second head, depending on one number.
 *
 * These are the same geometry because they are the same object at two moments —
 * a head is a bud whose lobes have swung out. Building them as one is what lets
 * a stand carry both without a second draw call, and it is also the honest
 * shape: the tight green spindle and the small open flower share an outline.
 */
export function budPart(sink: PartSink, part: number, lobes: number, rows: readonly number[]) {
  for (let l = 0; l < lobes; l++) strip(sink, rows, [-1, 1], l, part);
}
