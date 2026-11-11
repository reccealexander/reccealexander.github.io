import { Vector3 } from "three";
import { hermite, type Key } from "./math";
import { FLOWER, leafSurfacePoint } from "./flowerLayout";

/**
 * The journey, in metres.
 *
 * One shot: the field, then one flower out of it — the bloom carrying the eight
 * things I work on, the stem carrying the two projects and the four positions
 * on the way down it, the soil carrying the questions — and then back out to
 * the field it came from.
 *
 * The camera never leaves human scale. It just gets very close to a small
 * thing, which is what the DOM site's flower canvas is doing too.
 *
 * Camera keys are chapter-stamped (see lib/scroll.ts): 0 hero, 1 the approach,
 * 2 the bloom, 3 down the stem, 4 the soil, 5 back out.
 */

export { FLOWER } from "./flowerLayout";

type Frame = {
  at: number;
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
};

/** A point on the slow orbit the bloom is read from. */
function overBloom(deg: number, radius: number, height: number): [number, number, number] {
  const a = (deg * Math.PI) / 180;
  return [
    FLOWER.x + Math.cos(a) * radius,
    FLOWER.height + height,
    FLOWER.z + Math.sin(a) * radius,
  ];
}

/** A point beside the stem, at a given height up it. */
function besideStem(deg: number, radius: number, y: number): [number, number, number] {
  const a = (deg * Math.PI) / 180;
  return [FLOWER.x + Math.cos(a) * radius, y, FLOWER.z + Math.sin(a) * radius];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * How long each act is, in viewport heights.
 *
 * These are the single source of truth for both the document and the camera:
 * the DOM lays its blocks out at these heights, and the chapter a beat is read
 * at is computed from the same numbers. Lengthen a station here and its copy
 * and the camera's dwell on it move together.
 */
export const LAYOUT = {
  heroVh: 100,
  approachVh: 128,
  bloomIntroVh: 120,
  bloomPetalVh: 62,
  /**
   * Everything in the stem act before the first leaf: the title card, then the
   * two projects.
   *
   * It is one number rather than three because `stepChapter` divides by an act
   * total built from exactly this and `stemStepVh` — a third constant added
   * here and not there would leave every leaf's label a screen away from the
   * camera move it is timed to. How the run-up is divided up is in ui/Steps.
   */
  stemIntroVh: 450,
  /**
   * The title card's share of it. The rest is the two projects, halved.
   *
   * Up from 110. The camera does its steepest work of the whole journey in the
   * chapter after it leaves the bloom — off the head, onto the stem, and a
   * third of the way down it — and at 110 the reader was buying that whole move
   * with one screen of scroll. Everything above stays where it is; the extra
   * eighty viewport heights are spent entirely on the top of the stem, which is
   * the part that was going past too fast to look at.
   */
  stemTitleVh: 190,
  stemStepVh: 88,
  /** The soil act: no copy any more, just a beat at the foot of the plant
      while the ant finishes her climb down. */
  soilVh: 120,
  outVh: 200,
} as const;

export const FEATURE_COUNT = 8;
export const STEP_COUNT = 4;

const BLOOM_TOTAL = LAYOUT.bloomIntroVh + FEATURE_COUNT * LAYOUT.bloomPetalVh;
const STEM_TOTAL = LAYOUT.stemIntroVh + STEP_COUNT * LAYOUT.stemStepVh;

/** Chapter at which petal `i` is the one being read. */
export function featureChapter(i: number): number {
  return 2 + (LAYOUT.bloomIntroVh + (i + 0.5) * LAYOUT.bloomPetalVh) / BLOOM_TOTAL;
}

export function stepChapter(i: number): number {
  return 3 + (LAYOUT.stemIntroVh + (i + 0.5) * LAYOUT.stemStepVh) / STEM_TOTAL;
}

/**
 * The chapters the four leaves are read at, and where to aim for each.
 *
 * Both are needed by FRAMES below, which is why the layout block above it —
 * `LAYOUT` and `stepChapter` are consts and a function that read one, and a
 * const cannot be used before it is initialised. Nothing else moved.
 */
export const LEAF_CHAPTER = Array.from({ length: STEP_COUNT }, (_, i) => stepChapter(i));

const _aimL = new Vector3();
const _aimR = new Vector3();

/**
 * The middle of leaf `i`'s blade, in world space — what the lens is pointed at
 * during that leaf's chapter.
 *
 * The midpoint of the two margins rather than the centre line, for the same
 * reason the label is laid out that way: `fold` hangs both margins below the
 * spine, so the centre line is the top edge of what you see and aiming at it
 * frames the leaf low.
 */
/**
 * Where the lens stands to read leaf `i`: a fixed height above the blade it is
 * aimed at, on the given bearing.
 *
 * Derived from the leaf rather than given in metres, so moving a leaf up or
 * down the stem carries its camera with it. The 0.155 is the down-angle the
 * type is read at — about 35° over the horizontal at this radius — and it is
 * the same for all four, which is most of why the four labels come out the
 * same size.
 */
function overLeaf(i: number, deg: number): [number, number, number] {
  return besideStem(deg, 0.22, leafAim(i)[1] + 0.155);
}

/** Half way between leaf `i`'s chapter and the next one's. */
const midChapter = (i: number) => (LEAF_CHAPTER[i] + LEAF_CHAPTER[i + 1]) / 2;

/** ...and the lens and its aim there: the average of the two leaves it is between. */
function betweenLeaves(i: number, deg: number): [number, number, number] {
  return besideStem(deg, 0.22, (leafAim(i)[1] + leafAim(i + 1)[1]) / 2 + 0.155);
}

function midAim(i: number): [number, number, number] {
  const a = leafAim(i);
  const b = leafAim(i + 1);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function leafAim(i: number): [number, number, number] {
  leafSurfacePoint(i, 0.54, -1, _aimL);
  leafSurfacePoint(i, 0.54, 1, _aimR);
  return [
    (_aimL.x + _aimR.x) / 2,
    (_aimL.y + _aimR.y) / 2,
    (_aimL.z + _aimR.z) / 2,
  ];
}

const BLOOM: [number, number, number] = [FLOWER.x, FLOWER.height, FLOWER.z];

const FRAMES: Frame[] = [
  // ---- 0 · the field, from above ---------------------------------------
  //
  // High and tipped hard down. Two things fall out of that: the horizon is
  // above the top of the frame, so the canopy is the whole picture and there
  // is no sky anywhere in this scene; and the plant, which stands an inch
  // under the canopy line in the near grass, is not merely small — it is
  // behind the grass at the bottom of the frame, and cannot be picked out
  // until the camera drops into it.
  { at: 0.0, pos: [0.0, 2.95, 1.75], target: [0.0, 0.02, -1.05], fov: 40 },
  { at: 0.6, pos: [0.04, 2.88, 1.66], target: [0.0, 0.02, -1.15], fov: 40 },

  // ---- 1 · the approach. The camera tips down and drops into the grass at
  // its own feet, and the flower it has been standing over the whole time
  // comes up into frame. -----------------------------------------------
  { at: 1.0, pos: [0.08, 2.66, 1.78], target: [0.12, 0.04, -0.65], fov: 41 },
  { at: 1.35, pos: [0.2, 1.94, 1.66], target: [0.28, 0.14, 0.3], fov: 41 },
  { at: 1.65, pos: [0.32, 1.26, 1.5], target: [FLOWER.x, 0.28, FLOWER.z], fov: 42 },
  { at: 1.86, pos: [0.4, 0.96, 1.33], target: BLOOM, fov: 42 },
  { at: 2.0, pos: overBloom(72, 0.34, 0.6), target: BLOOM, fov: 42 },

  // ---- 2 · the bloom. Eight petals, eight things it does. The camera is
  // nearly still here and only turns — the labels are pinned to the petals,
  // and a moving frame makes eight of them chase their own anchors. -----
  { at: 2.35, pos: overBloom(84, 0.35, 0.61), target: BLOOM, fov: 42 },
  { at: 2.7, pos: overBloom(97, 0.36, 0.605), target: BLOOM, fov: 42 },
  { at: 3.0, pos: overBloom(110, 0.4, 0.53), target: [FLOWER.x, FLOWER.height - 0.02, FLOWER.z], fov: 43 },

  // ---- 3 · down the stem. Out of the bloom, onto the stem, and then the
  // pan down it with the ant going first. Heights are fractions of the
  // stem rather than metres, so shortening the plant does not strand the
  // camera above it. ----------------------------------------------------
  //
  // The act is two shots, not one. Over the two projects the lens comes off
  // the head and drops beside the stem, roughly level with it. Then, past the
  // second project, it climbs back and looks *down* — every key from 3.55 on
  // sits half a stem above what it is aimed at, thirty-odd degrees over the
  // horizontal.
  //
  // That is a legibility decision as much as a framing one. The four leaves
  // carry the labels now, and a label is set on the blade's own surface: seen
  // from beside the plant a leaf is a horizontal sheet nearly edge-on, which
  // projects its width to almost nothing and leaves the type squashed into a
  // band. Seen from above, the same blade is at its widest, which is the whole
  // page the four of them are printed on.
  //
  // Radius, too: these sit at 0.22, inside FLOWER.clearing rather than just
  // outside it. Grass is culled within 25 cm of the stem and nowhere else, so a
  // lens at 29 was looking through the densest ring in the field — tolerable at
  // one fixed bearing, where the scatter happens to leave a gap, and not
  // tolerable at all once the camera started walking round and meeting every
  // clump in the ring in turn. Inside the gap the sightline is clear at every
  // bearing, and the leaves come up larger on top of it.
  //
  // The bearing is the other half of it, and it does most of the work. The lens
  // walks 120° around the plant across this act instead of the 21° it used to,
  // so the descent is an orbit and not a lift.
  //
  // That is a legibility decision before it is a camera one. A label is printed
  // on its blade, so a leaf wants to be square to the lens when its own chapter
  // comes up — square is the widest a blade can project and the least
  // foreshortened along its length, which is to say the largest the type on it
  // can be. But there are only two square headings for any one camera bearing,
  // and there are four leaves: hold the camera still and the four of them
  // collapse onto two directions, which is precisely how the top two ended up
  // sitting on the bottom two. Turning the camera ~28° between one leaf's
  // chapter and the next spreads the four to 50° apart *while* leaving every one
  // of them square at the moment it is read. Both at once, instead of trading
  // one against the other — see LEAF_YAW in lib/flowerLayout, which is derived
  // from these bearings and has to move when they do.
  { at: 3.15, pos: besideStem(155, 0.34, FLOWER.height * 1.14), target: [FLOWER.x, FLOWER.height * 0.95, FLOWER.z], fov: 44 },
  { at: 3.35, pos: besideStem(200, 0.3, FLOWER.height * 1.09), target: [FLOWER.x, FLOWER.height * 0.9, FLOWER.z], fov: 44 },
  { at: 3.45, pos: besideStem(235, 0.27, FLOWER.height * 1.04), target: [FLOWER.x, FLOWER.height * 0.85, FLOWER.z], fov: 44 },
  // Up and over: the reader has just finished the graphene figure, and this is
  // where the plant stops being something you are standing beside.
  { at: 3.55, pos: besideStem(265, 0.25, FLOWER.height * 0.99), target: [FLOWER.x, FLOWER.height * 0.78, FLOWER.z], fov: 44 },

  /*
   * One key per leaf, at that leaf's own chapter, aimed at that leaf — and a
   * half-step between each pair, which is not decoration.
   *
   * The lens turns a quarter circle between one leaf and the next. That is what
   * lets the leaves sit 90° apart and still each be square to the camera when
   * its own label is read (see LEAF_YAW), and it is a lot of angle to cross.
   * These keys are positions, and the curve through them is interpolated in
   * world space, not in polar: given only the endpoints of a 90° arc at 22 cm,
   * the camera cuts the chord — which passes 15 cm from the axis, i.e. straight
   * through the plant. The half-steps hold it out on the arc.
   *
   * Bearings keep counting past 360 rather than wrapping. `besideStem` only
   * takes a cosine and a sine so the position is identical either way, but the
   * unwrapped number is what stops a later key looking like a step backwards.
   */
  { at: LEAF_CHAPTER[0], pos: overLeaf(0, 290), target: leafAim(0), fov: 44 },
  { at: midChapter(0), pos: betweenLeaves(0, 335), target: midAim(0), fov: 44 },
  { at: LEAF_CHAPTER[1], pos: overLeaf(1, 380), target: leafAim(1), fov: 44 },
  { at: midChapter(1), pos: betweenLeaves(1, 425), target: midAim(1), fov: 44 },
  { at: LEAF_CHAPTER[2], pos: overLeaf(2, 470), target: leafAim(2), fov: 44 },
  { at: midChapter(2), pos: betweenLeaves(2, 515), target: midAim(2), fov: 44 },
  { at: LEAF_CHAPTER[3], pos: overLeaf(3, 560), target: leafAim(3), fov: 44 },
  { at: 4.0, pos: besideStem(566, 0.23, leafAim(3)[1] + 0.13), target: [FLOWER.x, FLOWER.height * 0.2, FLOWER.z], fov: 44 },

  // ---- 4 · the soil. The camera stops going down and sits on the ground
  // the whole plant is standing in. -------------------------------------
  //
  // Both of these sit *inside* the plant's clearing. Outside it, at half a
  // metre, a single clump can root a couple of centimetres from the lens and
  // fill the frame edge to edge — chapter 4.95 was three green gradients and
  // nothing else. In here the nearest blade is behind the plant rather than in
  // front of it, so the mound, the roots and the stem's foot are the shot and
  // the field is what frames them.
  // Aimed at the plant's foot rather than at the ground beside it: the act is
  // about what it is standing in, which needs the thing that is standing.
  // Aimed left of the plant so it stands in the right-hand third, clear of
  // the reading column the FAQ lays over this act.
  // Inside the clearing, which these were not.
  //
  // `FLOWER.clearing` is 0.25 m and these sat at 0.32 and 0.36, so the grass
  // this act was looking *through* was the ring immediately outside the gap the
  // plant makes — at fifteen centimetres off the floor, that is a wall. The
  // stem and its foot, which are the subject of the shot, were behind it for
  // most of the act, and so was the ant still walking down them. Pulled in to
  // 0.22 the line of sight is clear the whole way; the target's offset comes in
  // with it, so the plant still stands in the right-hand third and out of the
  // reading column the FAQ lays down the left.
  //
  // The orbit carries on through this act rather than winding back, and the
  // target's offset flips sign with it. That offset exists to stand the plant in
  // the right-hand third, clear of the reading column the FAQ lays down the
  // left — but "right" is a fact about the lens, not about the world. Screen-x
  // of the plant relative to the aim goes as −sin θ, so once the orbit passes
  // 180° an offset of −x puts the plant on the *left*, on top of the questions.
  { at: 4.4, pos: besideStem(572, 0.22, 0.14), target: [FLOWER.x + 0.075, 0.1, FLOWER.z], fov: 43 },
  { at: 5.0, pos: besideStem(588, 0.24, 0.125), target: [FLOWER.x + 0.08, 0.088, FLOWER.z], fov: 42 },

  // ---- 5 · back out, all the way to the opening shot.
  //
  // Out of the soil, up past the plant, and back to exactly the frame the page
  // opened on. It lands at 5.5, not 6: the last act is two screens tall and
  // the bottom of the document is reached halfway through it (see
  // ui/Contact.tsx), so 5.5 is the last scroll position there is. The key at
  // 6.0 repeats it so nothing past the end can drift.
  { at: 5.18, pos: [FLOWER.x + 0.4, 0.62, FLOWER.z + 0.95], target: [FLOWER.x, 0.3, FLOWER.z], fov: 42 },
  { at: 5.36, pos: [0.16, 1.9, 1.7], target: [0.2, 0.12, 0.1], fov: 41 },
  { at: 5.5, pos: [0.0, 2.95, 1.75], target: [0.0, 0.02, -1.05], fov: 40 },
  { at: 6.0, pos: [0.0, 2.95, 1.75], target: [0.0, 0.02, -1.05], fov: 40 },
];

const channel = (pick: (f: Frame) => number): Key[] =>
  FRAMES.map((f) => ({ at: f.at, v: pick(f) }));

const CHANNELS = {
  px: channel((f) => f.pos[0]),
  py: channel((f) => f.pos[1]),
  pz: channel((f) => f.pos[2]),
  tx: channel((f) => f.target[0]),
  ty: channel((f) => f.target[1]),
  tz: channel((f) => f.target[2]),
  fov: channel((f) => f.fov),
};

export type CameraSample = {
  pos: Vector3;
  target: Vector3;
  fov: number;
};

const _pos = new Vector3();
const _target = new Vector3();

/** The camera at chapter `c`. Reuses its vectors — copy before you keep them. */
export function sampleCamera(c: number, out?: CameraSample): CameraSample {
  const o = out ?? { pos: _pos, target: _target, fov: 42 };
  o.pos.set(hermite(CHANNELS.px, c), hermite(CHANNELS.py, c), hermite(CHANNELS.pz, c));
  o.target.set(hermite(CHANNELS.tx, c), hermite(CHANNELS.ty, c), hermite(CHANNELS.tz, c));
  o.fov = hermite(CHANNELS.fov, c);
  return o;
}

/**
 * The framings the journey is actually built out of: the beats where something
 * is being said. Used under `prefers-reduced-motion`, where the camera cuts
 * between these instead of flying continuously between them.
 */
export function beats(): number[] {
  return [
    0.3,
    1.3,
    ...Array.from({ length: FEATURE_COUNT }, (_, i) => featureChapter(i)),
    ...Array.from({ length: STEP_COUNT }, (_, i) => stepChapter(i)),
    4.4,
    4.95,
    5.5,
  ];
}

/** The beat nearest a chapter. */
export function nearestBeat(c: number): number {
  const all = beats();
  let best = all[0];
  let d = Infinity;
  for (const b of all) {
    const gap = Math.abs(c - b);
    if (gap < d) {
      d = gap;
      best = b;
    }
  }
  return best;
}

/**
 * How lit a beat is: peaks as you reach it, dark before and after. The copy in
 * the DOM and the thing it labels in the scene fade on this same curve, which
 * is what makes the two read as one object.
 */
export function stationGlow(c: number, at: number, width = 0.05): number {
  const d = Math.abs(c - at) / width;
  return Math.exp(-d * d);
}
