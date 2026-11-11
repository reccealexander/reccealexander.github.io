/**
 * The tree, as numbers — and the summary of it the water reads back.
 *
 * This used to live inside three/Branches.tsx, which was fine while the canopy
 * was only ever drawn. It is not any more: the pond reflects it, and a
 * reflection worked out from a second, independently seeded set of boughs is a
 * tree in the water that is not the tree in the frame. So the strands are grown
 * once here, the wood and the leaves are both built from them, and the water's
 * mirror is a summary of the same leaves — nine hundred bytes of uniform rather
 * than a render target.
 *
 * Where the canopy is allowed to be is `CANOPY` in three/pond.ts; the notes on
 * the ceiling plane it hugs are there too, and the whole reflection turns on
 * that plane being a plane.
 */

import { Color, Vector3 } from "three";
import { makeRandom } from "@/lib/math";
import { CANOPY } from "./pond";

/** GLSL has no integer-to-float promotion, so every constant is emitted long. */
const f = (n: number) => n.toFixed(5);

/** How many nodes a strand is drawn with. */
export const NODES = 9;

export type CanopyNode = { p: Vector3; r: number; w: number };

export interface Canopy {
  /** Every strand, boughs and twigs alike — what the wood mesh is drawn from. */
  strands: CanopyNode[][];
  /** The boughs alone: the only wood thick enough to leave a mark in water. */
  boughs: CanopyNode[][];
}

/** A strand of wood: nodes along it, each with a radius and a wind weight. */
function strandNodes(
  x0: number,
  z0: number,
  bearing: number,
  run: number,
  dip0: number,
  dipEnd: number,
  slope: number,
  rootR: number,
  tipR: number,
  wobble: (t: number) => number,
  /** How far the bearing swings from root to tip, in radians. */
  bend = 0,
  /** How hard it wanders about that swing on the way. */
  kink = 0,
): CanopyNode[] {
  const nodes: CanopyNode[] = [];
  /*
   * Walked rather than projected.
   *
   * Every node used to be placed at `root + bearing * t * run`, which is a
   * straight line in plan however much the dip moved it up and down — so the
   * boughs read as spokes, and the only thing saving them was that the leaves
   * hid most of their length. Nothing that grew is straight for two metres.
   *
   * So the bearing is integrated along the strand instead: a steady swing over
   * the whole run, which is the branch reaching, plus a slow wander on top of
   * it, which is the branch having reached around things over several years.
   * Because it accumulates, a small per-step angle becomes a real curve by the
   * tip. Anything forking off a strand has to read the direction the strand is
   * travelling at the node it forks from — see the twig call site, which is
   * where getting that wrong showed.
   */
  const stepLen = run / (NODES - 1);
  let hx = x0;
  let hzRaw = z0;
  let aim = bearing;
  for (let i = 0; i < NODES; i++) {
    const t = i / (NODES - 1);
    if (i > 0) {
      aim += bend / (NODES - 1) + Math.sin(t * 5.3 + bearing * 3.1) * kink;
      hx += Math.sin(aim) * stepLen;
      hzRaw -= Math.cos(aim) * stepLen;
    }
    const hz = Math.max(CANOPY.minZ, hzRaw);
    // The dip is superlinear so the bough leaves the top edge slowly and then
    // falls away — which is what a bough loaded with leaves at its far end
    // does, and is also the shape that keeps the near half of it out of frame.
    const dip = dip0 + (dipEnd - dip0) * Math.pow(t, 1.6) + wobble(t);
    const y = CANOPY.ceilY + slope * hz - dip;
    nodes.push({
      p: new Vector3(hx, y, hz),
      r: rootR + (tipR - rootR) * Math.pow(t, 0.7),
      w: t * t,
    });
  }
  return nodes;
}

/**
 * The whole system, as strands.
 *
 * Eight boughs, dealt across the width of the frame and across its depth
 * rather than rolled for both: the near ones are the ones that dip into the
 * picture and the far ones only skim its edge, and a set rolled freely comes
 * out with them all at one distance about as often as not.
 */
function growCanopy(): Canopy {
  const rnd = makeRandom(90211);
  const strands: CanopyNode[][] = [];
  const boughs: CanopyNode[][] = [];
  const BOUGHS = 8;

  for (let i = 0; i < BOUGHS; i++) {
    const u = (i + 0.5) / BOUGHS;
    // Roots spread across the frame, alternating sides so no two neighbours
    // reach the same way and the middle of the hero is never walled off.
    const side = i % 2 === 0 ? 1 : -1;
    const x0 = (u * 2 - 1) * 3.1 + (rnd() - 0.5) * 0.7;
    const z0 = CANOPY.maxZ - Math.pow(rnd(), 0.8) * 1.9;
    // Away from the camera and off to one side. Nothing runs straight at the
    // lens: a bough foreshortened to a disc is a knot, not a branch.
    const bearing = side * (0.45 + rnd() * 0.75);
    const run = 1.9 + rnd() * 1.7;
    const slope = CANOPY.ceilSlope * (0.72 + rnd() * 0.62);
    const dip0 = -0.10 + rnd() * 0.1;
    // How far into the frame the far end of a bough is allowed to fall. Held
    // to a fifth of the picture: a canopy is a lid on the hero, and a lid that
    // comes down a third of the way is a scene about a tree.
    const dipEnd = 0.16 + rnd() * 0.34;
    const wob = rnd() * 6.283;
    const wobble = (t: number) => Math.sin(t * 4.1 + wob) * 0.035;
    const bough = strandNodes(
      x0, z0, bearing, run, dip0, dipEnd, slope, 0.019, 0.005, wobble,
      // Up to about thirty-five degrees of sweep over the whole run, either way,
      // and a slow wander of a couple of degrees a node on top of it.
      (rnd() - 0.5) * 1.2,
      (rnd() - 0.5) * 0.09,
    );
    strands.push(bough);
    boughs.push(bough);

    // Twigs, off the outer half. They are what stops the canopy reading as a
    // handful of poles: the silhouette of a branch end is a fork, and a fork
    // needs something to fork from.
    const twigs = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < twigs; k++) {
      const at = 0.34 + rnd() * 0.55;
      const j = Math.min(NODES - 2, Math.floor(at * (NODES - 1)));
      const from = bough[j].p;
      const off = (rnd() < 0.5 ? -1 : 1) * (0.55 + rnd() * 0.8);
      /*
       * The bearing the bough is actually travelling on WHERE THE TWIG LEAVES
       * IT, not the one it set out with.
       *
       * This is what made some twigs read as pasted across the tree rather than
       * grown out of it. It never mattered while boughs were straight — the two
       * were the same number — but a bough now swings up to thirty-five degrees
       * over its run, so a twig forking near the tip was leaving at an angle to
       * a heading its parent had abandoned a metre and a half earlier. Half of
       * them looked hinged the wrong way; the ones that forked backwards past
       * the parent looked like a separate branch laid over the top.
       *
       * Taken from the segment the twig actually attaches to, so the fork is
       * always relative to the wood it is leaving.
       */
      const seg = bough[j + 1].p;
      const localBearing = Math.atan2(seg.x - from.x, -(seg.z - from.z));
      strands.push(
        strandNodes(
          from.x,
          from.z,
          localBearing + off,
          0.45 + rnd() * 0.75,
          CANOPY.ceilY + slope * from.z - from.y,
          CANOPY.ceilY + slope * from.z - from.y + 0.14 + rnd() * 0.3,
          slope,
          bough[j].r * 0.62,
          0.0022,
          () => 0,
          // Twigs bend harder than the boughs they leave: they are younger,
          // thinner, and the last thing a branch end does is curl.
          (rnd() - 0.5) * 1.9,
          (rnd() - 0.5) * 0.16,
        ),
      );
    }
  }
  return { strands, boughs };
}

let grown: Canopy | null = null;

/**
 * The tree. Grown on first ask and then never again, because two components
 * want it and a seeded generator run twice is only the same tree until someone
 * reorders a call.
 */
export function canopy(): Canopy {
  return (grown ??= growCanopy());
}

export interface LeafCloud {
  count: number;
  /** x, y, z, yaw. */
  pose: Float32Array;
  /** scale, tilt, wind weight, tone. */
  form: Float32Array;
  tint: Float32Array;
}

const clouds = new Map<number, LeafCloud>();

/** Where the leaves hang, which is the other half of what the water reflects. */
export function leafCloud(count: number): LeafCloud {
  const held = clouds.get(count);
  if (held) return held;

  const { strands } = canopy();
  const rnd = makeRandom(41903);
  const pose = new Float32Array(count * 4);
  const form = new Float32Array(count * 4);
  const tint = new Float32Array(count * 3);
  const stops = CANOPY.leaf.map((h) => new Color(h));

  for (let i = 0; i < count; i++) {
    // Leaves belong to the outer halves of strands. A branch carrying them
    // evenly from the trunk out is a bottle brush; what reads as foliage is
    // a bare arm with the weight of it hung on the last third.
    const s = strands[Math.floor(rnd() * strands.length)];
    const t = 0.3 + Math.pow(rnd(), 0.65) * 0.7;
    const j = Math.min(s.length - 2, Math.floor(t * (s.length - 1)));
    const g = t * (s.length - 1) - j;
    const a = s[j].p;
    const b = s[j + 1].p;
    /*
     * The petiole goes ON the twig, and this is the whole of what was wrong.
     *
     * The leaf's own origin is the base of its stalk and the blade grows out
     * along +z from there (see leafGeometry), so this position IS the point of
     * attachment — and it was being jittered by up to thirteen centimetres in x
     * and z and nine down, against a leaf eleven centimetres long. Better than
     * half of them were therefore nearer to nothing than to the wood they were
     * supposed to be growing from, which is exactly the "not even attached".
     *
     * A centimetre and a half now, which is the thickness of the twig rather
     * than a scatter, and it is only there so that leaves sharing a node are
     * not perfectly collinear.
     */
    pose[i * 4] = a.x + (b.x - a.x) * g + (rnd() - 0.5) * 0.015;
    // Hung under the twig rather than balanced on it, which is the whole
    // difference between a canopy and a hedge seen from above — but by a
    // stalk's width, not by most of a leaf.
    pose[i * 4 + 1] = a.y + (b.y - a.y) * g - rnd() * 0.012;
    pose[i * 4 + 2] = a.z + (b.z - a.z) * g + (rnd() - 0.5) * 0.015;

    /*
     * ...and it faces away from the twig rather than wherever the dice said.
     *
     * A fully random yaw is what produced the weird angles: a leaf whose blade
     * happens to point back along its own branch lies inside the wood, and one
     * pointing straight down the twig is a leaf seen end-on, which reads as a
     * splinter. Real foliage leaves the stem at an angle and alternates sides,
     * so this takes the twig's local bearing and swings off it — never less
     * than a third of a right angle, never more than two thirds of a turn — and
     * alternates which side by index.
     */
    const side = i % 2 === 0 ? 1 : -1;
    const bearing = Math.atan2(b.x - a.x, b.z - a.z);
    pose[i * 4 + 3] = bearing + side * (0.55 + rnd() * 1.5);

    form[i * 4] = 0.62 + rnd() * 0.62;
    // Mostly hanging, with a few cocked over: a canopy read from above whose
    // leaves all lie in one plane is a printed sheet. Skewed downward rather
    // than centred, because these are seen from underneath and a leaf that
    // tips up shows its stalk and disappears.
    form[i * 4 + 1] = -0.12 - rnd() * 0.85 + (rnd() < 0.18 ? 0.9 : 0);
    form[i * 4 + 2] = s[j].w;
    form[i * 4 + 3] = 0.68 + rnd() * 0.44;
    const c = stops[Math.floor(rnd() * stops.length)];
    tint[i * 3] = c.r;
    tint[i * 3 + 1] = c.g;
    tint[i * 3 + 2] = c.b;
  }

  const cloud: LeafCloud = { count, pose, form, tint };
  clouds.set(count, cloud);
  return cloud;
}

/**
 * The canopy as the water needs it: a handful of discs and a handful of lines,
 * laid on the ceiling plane.
 *
 * A reflection is a ray query, and the thing being queried here is several
 * hundred instanced leaves — which a fragment shader cannot walk and a render
 * target would cost a second pass over the frame. But the canopy is not a
 * general object: it is a *lid*, everything in it hugging one known plane, so
 * what a mirrored ray needs to know is only how much of that plane is filled
 * where it comes out. That collapses to a coverage function of two numbers,
 * and a coverage function is cheap.
 *
 * Fourteen discs is the number where the school of them stops reading as
 * bubbles and starts reading as a canopy. They are k-means over the real leaf
 * positions rather than one disc per bough: leaves are dealt to strands
 * uniformly, so the clumps that actually form are nothing like one-per-branch,
 * and a summary that assumes otherwise puts foliage in the water where the
 * frame has none.
 */
export const MIRROR_MASSES = 14;
export const MIRROR_BOUGHS = 8;

export interface CanopyMirror {
  /** Per disc: x, z, radius, how solid it is. */
  masses: Float32Array;
  /** Per bough: x, z at the root, then x, z at the tip. */
  boughs: Float32Array;
  /** One colour each, because a reflection this compressed has no room for
      more — a leaf is under a pixel across by the time it is in the water. */
  leaf: Color;
  bark: Color;
}

const mirrors = new Map<number, CanopyMirror>();

export function canopyMirror(count: number): CanopyMirror {
  const held = mirrors.get(count);
  if (held) return held;

  const { pose, tint, form } = leafCloud(count);

  // Seeded from leaves spread evenly along x rather than rolled, so the first
  // pass already has one centre per part of the canopy and Lloyd's only has to
  // settle them. Rolled starts leave two centres inside one clump and a bare
  // stretch of frame with none.
  const order = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => pose[a * 4] - pose[b * 4],
  );
  const cx = new Float64Array(MIRROR_MASSES);
  const cz = new Float64Array(MIRROR_MASSES);
  for (let k = 0; k < MIRROR_MASSES; k++) {
    const i = order[Math.floor(((k + 0.5) / MIRROR_MASSES) * count)];
    cx[k] = pose[i * 4];
    cz[k] = pose[i * 4 + 2];
  }

  const owner = new Int32Array(count);
  const sx = new Float64Array(MIRROR_MASSES);
  const sz = new Float64Array(MIRROR_MASSES);
  const n = new Float64Array(MIRROR_MASSES);
  for (let pass = 0; pass < 14; pass++) {
    sx.fill(0);
    sz.fill(0);
    n.fill(0);
    for (let i = 0; i < count; i++) {
      const x = pose[i * 4];
      const z = pose[i * 4 + 2];
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < MIRROR_MASSES; k++) {
        const d = (x - cx[k]) ** 2 + (z - cz[k]) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      owner[i] = best;
      sx[best] += x;
      sz[best] += z;
      n[best] += 1;
    }
    for (let k = 0; k < MIRROR_MASSES; k++) {
      if (n[k] === 0) continue;
      cx[k] = sx[k] / n[k];
      cz[k] = sz[k] / n[k];
    }
  }

  // Radius is the spread of the leaves that belong to each centre, not a fixed
  // number: a clump on the end of one twig is a hand's width and the drift
  // where three boughs cross is a metre, and drawing both at one size is the
  // bubbles again.
  const spread = new Float64Array(MIRROR_MASSES);
  for (let i = 0; i < count; i++) {
    const k = owner[i];
    spread[k] += (pose[i * 4] - cx[k]) ** 2 + (pose[i * 4 + 2] - cz[k]) ** 2;
  }

  const masses = new Float32Array(MIRROR_MASSES * 4);
  const dense = count / MIRROR_MASSES;
  for (let k = 0; k < MIRROR_MASSES; k++) {
    const rms = n[k] > 0 ? Math.sqrt(spread[k] / n[k]) : 0;
    masses[k * 4] = cx[k];
    masses[k * 4 + 1] = cz[k];
    masses[k * 4 + 2] = Math.min(0.88, Math.max(0.26, rms * 1.4));
    // How solid the disc is, from how many leaves went into it against how many
    // an even deal would have given it. A thin clump reflects as a haze of
    // colour and a heavy one nearly blocks the sky, which is what the eye reads
    // as depth in a canopy.
    masses[k * 4 + 3] = Math.min(1, 0.34 + (0.66 * n[k]) / dense);
  }

  const boughs = new Float32Array(MIRROR_BOUGHS * 4);
  const wood = canopy().boughs;
  for (let k = 0; k < MIRROR_BOUGHS; k++) {
    const s = wood[k % wood.length];
    // From a third of the way out rather than from the root: the near end of a
    // bough is over the bank and behind the camera's own reflection, and the
    // outer half is the only part that ever lands in water.
    const a = s[Math.floor(NODES / 3)].p;
    const b = s[NODES - 1].p;
    boughs[k * 4] = a.x;
    boughs[k * 4 + 1] = a.z;
    boughs[k * 4 + 2] = b.x;
    boughs[k * 4 + 3] = b.z;
  }

  // The leaf colour the water gives back is the school's mean, carrying the
  // same length gradient and per-leaf tone the vertex shader lays on it — the
  // reflection has to be the colour of the thing above it, and the thing above
  // it is not the palette entry, it is the palette entry after Branches has
  // finished with it.
  const leaf = new Color(0, 0, 0);
  let shade = 0;
  for (let i = 0; i < count; i++) {
    const k = form[i * 4 + 3];
    leaf.r += tint[i * 3] * k;
    leaf.g += tint[i * 3 + 1] * k;
    leaf.b += tint[i * 3 + 2] * k;
    shade += k;
  }
  // 0.78 + 0.34 v averaged over the blade is 0.95, which is what LEAF_VERT
  // applies — and then a third again on top of it, which is not physics.
  //
  // The tree in the frame is read as a *silhouette*: it is dark foliage against
  // a darker pond, and what makes it legible is its edge. Its reflection has no
  // edge to be read by — it is torn into streaks by the ripple and laid over
  // water of nearly its own value — so at the true colour it is a texture in
  // the water rather than a tree in it. Everything in this scene is painted at
  // the value the frame can see it at rather than the value it has (the ripple
  // gain, the koi's markings, the sun road); this is the same decision, and it
  // is the difference between a reflection that is present in a histogram and
  // one a reader notices.
  // ...and then, since the morning, a long way under it rather than over.
  //
  // That boost was set against water so dark that the reflection had to be
  // pushed above its true colour to be seen at all. The water is now a bright
  // morning and the sign of the whole problem has flipped: what the surface
  // gives back where there is no canopy is a pale sky, so a tree read at even
  // its honest brightness is barely a mark on it, and read at four thirds it is
  // nothing.
  //
  // Under the boughs the water has to go *down*. That is what a pond actually
  // does — the shaded water under a tree is the darkest part of a bright
  // morning — and it is the only thing giving this frame any depth now that
  // everything else in it is light. It is also load-bearing for the type: the
  // hero's copy sits over the middle of the water with no scrim, the canopy's
  // footprint is what it sits on, and at the pale end of this the tagline
  // measured 3.2:1.
  // ...and back up again, because the reference photograph settles the question
  // the last two passes were guessing at.
  //
  // A maple over still water gives back a reflection at very nearly the
  // brightness of the tree itself: in the reference the scarlet masses in the
  // water are the most saturated thing in the frame, brighter than the teal they
  // lie on, and they read as *the tree, in the water* rather than as a shadow of
  // it. The pass before this drove them to half strength — which did make the
  // hero's copy more legible, and was the wrong picture. The copy question was
  // asked separately and answered "leave it".
  //
  // A shade under one, not over: a reflection is still dimmer than its source,
  // and the surface is not a mirror.
  leaf.multiplyScalar(0.92 / Math.max(shade, 1e-6));

  // The wood, likewise, from the lit half of the bark ramp rather than the
  // middle of it. A bough's reflection is a dark line and a dark line on dark
  // water is not a line, so what is given back is the top of the branch — which
  // is the side actually facing the water anyway.
  // The wood likewise comes off the shaded half of the ramp rather than the lit
  // one, for the reason directly above: against pale water a bough's reflection
  // is legible as a dark line and invisible as a light one.
  const bark = new Color(CANOPY.bark[0]).lerp(new Color(CANOPY.bark[1]), 0.62);

  const mirror: CanopyMirror = { masses, boughs, leaf, bark };
  mirrors.set(count, mirror);
  return mirror;
}

/**
 * What is overhead, mirrored — evaluated in the water's own fragment shader.
 *
 * The ray goes up from the surface and is asked where it leaves the ceiling
 * plane; everything after that is a lookup in two dimensions. Two things fall
 * out of doing it this way rather than with a second camera. It costs one
 * intersection and twenty-two circles and lines, so there is no extra pass over
 * the scene and no target to size; and because the ray is bent by the wave
 * normal before it is traced, the reflection is broken by the ripple in the
 * way a reflection actually is, rather than being a flat image slid about.
 *
 * Nothing here needs the leaves' geometry. At the compression a reflection has
 * from a camera three metres up, a leaf is a fraction of a pixel: what survives
 * is the shape of the masses, torn at the edges, and the dark lines the boughs
 * draw through them.
 */
export const MIRROR_GLSL = /* glsl */ `
uniform vec4 uCanopyMass[${MIRROR_MASSES}];
uniform vec4 uCanopyBough[${MIRROR_BOUGHS}];
uniform vec3 uCanopyLeaf;
uniform vec3 uCanopyBark;

/**
 * The mirror image seen along R from a point on the water, and how much of it
 * is tree rather than air.
 *
 * The point it comes out at is on the ceiling plane in x and z — the plane is
 * y = ceilY + ceilSlope·z, which is the hero's own top-of-frame ray written as
 * a line, so a ray that misses it upward has left the picture and is looking at
 * nothing but haze.
 */
vec3 skyMirror(vec3 world, vec3 R, vec3 sky, out float cover) {
  cover = 0.0;
  float denom = R.y - ${f(CANOPY.ceilSlope)} * R.z;
  if (denom < 0.04) return sky;
  float t = (${f(CANOPY.ceilY)} + ${f(CANOPY.ceilSlope)} * world.z - world.y) / denom;
  if (t <= 0.0) return sky;
  vec2 over = world.xz + R.xz * t;
  // Everything nearer than maxZ is over the bank, and everything past minZ is
  // open sky. Cutting here is most of what keeps this cheap: outside the tree's
  // own footprint the answer is one compare.
  if (over.y > ${f(CANOPY.maxZ + 0.45)} || over.y < ${f(CANOPY.minZ - 1.35)}) return sky;

  float leaves = 0.0;
  for (int i = 0; i < ${MIRROR_MASSES}; i++) {
    vec4 m = uCanopyMass[i];
    float d = length(over - m.xy) / m.z;
    // Feathered a long way out rather than cut near the disc's rim. The
    // reference's reflected masses are visibly *larger and softer* than the
    // foliage casting them — a crown that is a crisp shape against the sky
    // arrives in the water as a bloom with no edge at all, because every point
    // of it is being delivered by a different tilted facet. A tight falloff is
    // what made this read as discs with texture on them.
    leaves = max(leaves, m.w * (1.0 - smoothstep(0.05, 1.25, d)));
  }
  // Foliage is holes, and it is holes at two scales: the gaps between one
  // clump and the next, and the gaps between the leaves inside a clump. Both
  // are needed. With only the coarse one the discs come back as soft brown
  // masses, which in water is not a canopy, it is a slick — a reflection has to
  // be broken finer than the thing it is a reflection of, because the surface
  // it lies on is broken too.
  //
  // Both floors raised a long way. Multiplied out, the pair used to take the
  // average patch of canopy down to two fifths of itself and the worst of it to
  // a tenth — which is a canopy so full of holes that what is left is a haze
  // with the shape of one. The tearing is what makes it read as reflected
  // rather than painted on, so it stays; it just no longer costs most of the
  // reflection to get it.
  leaves *= 0.45 + 0.55 * smoothstep(0.24, 0.62, fbm3(over * 3.3 + 5.0));
  leaves *= 0.66 + 0.34 * smoothstep(0.32, 0.74, fbm3(over * 12.0 - 2.0));
  // ...and then taken back over the top, because the two tears above multiply
  // out to about six tenths and six tenths of a scarlet mixed against sky is a
  // pink smear. In the reference the reflected crowns are the most saturated
  // thing in the picture -- more saturated than the maples themselves, since
  // the water is dark behind them and the sky is not. Clamped, so the tearing
  // still bites everywhere it was biting; it simply no longer costs the colour.
  leaves = clamp(leaves * 1.75, 0.0, 1.0);

  float wood = 0.0;
  for (int i = 0; i < ${MIRROR_BOUGHS}; i++) {
    vec4 b = uCanopyBough[i];
    vec2 ab = b.zw - b.xy;
    vec2 ap = over - b.xy;
    float h = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    // Wider than the bough itself, because a reflection is not a measurement:
    // by the time a two-centimetre branch has been thrown three metres and torn
    // by the ripple it is under a pixel, and under a pixel is gone. What the
    // eye is being given is the *line* the bough draws, at the width a line has
    // to be to be a line.
    wood = max(wood, 1.0 - smoothstep(0.018, 0.062, length(ap - ab * h)));
  }

  cover = max(leaves, wood);
  vec3 col = mix(sky, uCanopyLeaf, leaves);
  col = mix(col, uCanopyBark, wood);
  // The reflected leg is a metre or two of air in its own right, and it fogs
  // like any other metre of it. Without this the tree in the water is sharper
  // than the tree in the frame, which reads as a decal rather than a mirror.
  //
  // At two fifths of the scene's density, though, and that is the difference
  // between a reflection and no reflection. Read at full strength this was the
  // whole reason the tree could not be seen in the water: the ray length is
  // to the canopy lid, which for the water the boughs are actually over runs to
  // several metres, and an exp(-(d*rho)^2) over several metres of it takes
  // nine tenths of the colour back to haze. Which meant the coverage term came
  // out strong -- the mask was full of branch shapes -- while what it was
  // covering the water with was, by the last line, the haze again. Shot as a
  // debug channel the two disagreed completely: the coverage map showed a tree
  // and the frame showed flat water.
  //
  // Two fifths keeps what this term is for — the reflection stays softer than
  // the boughs themselves, so it still reads as seen-in-water rather than
  // pasted on — without spending the entire image to get it.
  float haze = fogDensity * t * 0.25;
  return mix(col, sky, 1.0 - exp(-haze * haze));
}
`;
