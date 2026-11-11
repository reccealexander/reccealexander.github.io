import { CatmullRomCurve3, Euler, Matrix4, Vector3 } from "three";
import { leafSurface } from "@/three/geometry";
import { HOVER_LIFT, leafHover } from "./leafHover";

/**
 * The flower, as numbers both the scene and the document can read.
 *
 * The eight labels in the features act are DOM elements pinned to the tips of
 * eight petals that only exist in the scene, so the two need one shared account
 * of where those tips are. This is it: the mesh is built from these, and the
 * labels are placed by running the live camera over the same values — which is
 * what keeps a label on its petal at any window size, instead of at a position
 * someone measured once at 1440 wide.
 */

export const FLOWER = {
  x: 0.3,
  /**
   * Just past the bottom edge of the hero frame — a metre in front of the
   * camera and below it.
   *
   * Hiding an upward-facing bloom from a bird's eye by piling grass on it does
   * not work: you are looking straight down into the canopy, and no plausible
   * amount of grass roofs it over. Putting it below the bottom of the frame
   * does, and it is also the more honest version of the same idea — the flower
   * is in the near grass at your feet the whole time, and the approach is the
   * camera tipping down to find what it has been standing over.
   */
  z: 0.8,
  /**
   * Stem height — deliberately shorter than the grass around it.
   *
   * A plant that stands proud of the canopy is a thing in the background of
   * the hero, and then the approach is just a dolly toward something you have
   * been looking at the whole time. Tucked an inch under the canopy line it is
   * genuinely not there until the camera comes down into the field and parts
   * it, which is the moment the whole first act is built around.
   */
  height: 0.34,
  /**
   * Barely cleared at all, and back to being so.
   *
   * Only enough that a blade cannot grow up through the stem itself. Everything
   * else the plant needs of the field is asked for per frame by three/parting,
   * which lays the blades standing in the lens's way over and lets them back up
   * behind it — so the grass is *there*, growing to the plant's foot, and only
   * ducks while it is actually blocking something.
   *
   * This went to 0.25 and then 0.36 during the work on the leaf labels, each
   * time to stop grass crossing a caption, and each time it bought that by
   * carving a permanent bare ring around the plant: a hole in the field in every
   * frame, including all the ones where nothing needed clearing. The corridor
   * widened instead — see SIGHT_CLEAR — which is the same fix applied only when
   * and where it is needed.
   *
   * The original reasoning stands and is why this cannot creep up again: a hole
   * in a field reads from much further off than a flower does, and the hero
   * depends on the plant being unfindable from 2.95 m up.
   */
  clearing: 0.12,
};

export const PETAL_COUNT = 8;

/** Petal geometry, in metres. */
export const PETAL = {
  length: 0.155,
  width: 0.086,
  /** How far off the horizontal each petal is lifted. */
  tilt: 0.55,
  /**
   * Two whorls of four, as the flower is actually built: the odd petals are an
   * inner whorl standing a little more upright, lying over the outer one. The
   * difference is what lets neighbours overlap the way petals do — one resting
   * on the other — instead of cutting through each other.
   */
  whorl: 0.13,
};

/** Petal `i`'s lift off the horizontal, whorl included. */
export function petalTilt(i: number): number {
  return PETAL.tilt + (i % 2 === 1 ? PETAL.whorl * 0.6 : -PETAL.whorl * 0.4);
}

/** The rosette is turned slightly off-axis so no petal points at the lens. */
const PHASE = -Math.PI / 2 + 0.22;

export function petalAngle(i: number): number {
  return PHASE + (i / PETAL_COUNT) * Math.PI * 2;
}

/** Where petal `i` ends, in world space. */
export function petalTip(i: number, out = new Vector3()): Vector3 {
  const a = petalAngle(i);
  const tilt = petalTilt(i);
  const r = PETAL.length * Math.cos(tilt);
  return out.set(
    FLOWER.x + Math.cos(a) * r,
    FLOWER.height + PETAL.length * Math.sin(tilt),
    FLOWER.z + Math.sin(a) * r,
  );
}

/** Where petal `i`'s label hangs, a little beyond its tip. */
export function petalLabel(i: number, out = new Vector3()): Vector3 {
  const a = petalAngle(i);
  const tilt = petalTilt(i);
  const r = PETAL.length * Math.cos(tilt) * 1.62;
  return out.set(
    FLOWER.x + Math.cos(a) * r,
    FLOWER.height + PETAL.length * Math.sin(tilt) * 1.5,
    FLOWER.z + Math.sin(a) * r,
  );
}

// ---------------------------------------------------------------------------
// The stem, and the four leaves on it
// ---------------------------------------------------------------------------

/**
 * The stem's centre line and its taper.
 *
 * This lives here rather than in three/Flower.tsx because the leaves are now
 * hung off it by two things that must agree to the millimetre: the meshes in
 * the scene, and the labels the document pins to them. three/Ant.tsx keeps a
 * third copy — an ant placed on a straight axis through FLOWER.x/z would float
 * a full stem's width clear of the plant around half height, where it leans
 * furthest out — so nothing here may change without changing that too.
 */
export const STEM = new CatmullRomCurve3([
  new Vector3(FLOWER.x, 0, FLOWER.z),
  new Vector3(FLOWER.x + 0.022, FLOWER.height * 0.3, FLOWER.z - 0.014),
  new Vector3(FLOWER.x - 0.015, FLOWER.height * 0.62, FLOWER.z + 0.012),
  new Vector3(FLOWER.x, FLOWER.height * 0.9, FLOWER.z),
  new Vector3(FLOWER.x, FLOWER.height, FLOWER.z),
]);

export const stemRadius = (t: number) => 0.0105 * (1 - 0.4 * t * t);

export const LEAF_COUNT = 4;

export type LeafPlacement = {
  /** Where along the stem it is joined, 0 at the root and 1 at the head. */
  t: number;
  /** Which side of the plant it is on: +1 or -1. */
  side: number;
  /** Its heading about Y. The blade runs out along this. */
  yaw: number;
  length: number;
  width: number;
  /* The blade's own shape. These live here rather than at the call site in
     three/Flower because leafTip below has to know them: the tip of a leaf is
     a fact about how far it droops and how hard it sweeps, and a copy of those
     numbers kept anywhere else is a leader line pointing at the wrong patch of
     grass. */
  droop: number;
  twist: number;
  sweep: number;
  position: [number, number, number];
  rotation: [number, number, number, "YXZ"];
};

/**
 * Where each leaf joins the stem, as a fraction of it.
 *
 * Boxed in from both ends, and the box is narrow.
 *
 * To read the type on a blade the lens has to be ABOVE it — that is what the
 * whole bird's-eye is for. To not be looking through the bloom it has to be
 * BELOW the head, at 0.34. Those two together cap a leaf at about 0.52 of the
 * stem: any higher and the camera that would look down on it has to sit over
 * the flower and shoot through it, which is exactly why the first leaf's frames
 * were dominated by a huge lit rosette with the leaf small underneath.
 *
 * The floor is the field. Grass here stands 0.42, so anything under about 7 cm
 * is simply inside it — the fourth leaf at 0.24 put its camera 8 cm off the
 * soil and its label ended up drawn over the blades in front of the leaf rather
 * than on the leaf, which no amount of relighting the leaf can fix.
 *
 * So: 0.52 down to 0.22, 3.4 cm apart. That is closer than these blades are
 * long, and it is only survivable because the lens now turns 28° between one
 * leaf's chapter and the next — the leaves are separated in bearing rather than
 * in height. It was 18 fractions apart, about 6 cm —
 * where they used to be crowded into 8 fractions, 2.7 cm. That was always too
 * close: these blades are 17–19 cm long, so at the old spacing each one
 * overlapped the next by seven times the gap between them, and the only thing
 * keeping them apart in the frame was which way they pointed. Orientation
 * cannot carry that on its own. As the lens orbits, whichever leaf happens to
 * lean toward it comes forward and looms, and at the fourth leaf's chapter the
 * third was doing exactly that — sitting in front of the leaf being read, at
 * twice its apparent size.
 *
 * Spreading them is only possible because the camera now aims at each leaf
 * rather than at a fixed height on the stem (see lib/journey): these no longer
 * have to sit where the lens was already looking, so they can sit where they
 * make a plant. The camera's heights in that file are derived from these and
 * move with them.
 */
const LEAF_T = [0.52, 0.42, 0.32, 0.22] as const;

/**
 * Which way each leaf points, in radians about Y.
 *
 * Ninety degrees apart, which is how a great many plants actually grow —
 * decussate, each leaf square to the one below it — and it is the arrangement
 * this had to earn its way back to. An earlier pass had all four within 28° of
 * each other on one side of the stem, which satisfied every occlusion rule and
 * looked like a hand of cards rather than a plant.
 *
 * Work it in the camera's frame. Write s = yaw + θ, θ being the lens's bearing
 * at that leaf's chapter. Then cos s = ±1 means the blade is square to the lens
 * — the widest it can project and the least foreshortened, which is the largest
 * the type printed on it can be — and sin s > 0 means it leans toward the lens,
 * onto the near side of the stem, where it can come between the camera and
 * something behind it. That second one matters more than it sounds: a label is
 * DOM drawn over the canvas, so a leaf in the way does not hide the caption, it
 * takes it.
 *
 * The rule that unlocks 90° spacing is knowing which leaves can actually be in
 * the way. Not every higher one, which is what an earlier version assumed and
 * what forced all four onto a single heading: the lens sits about 15 cm above
 * the leaf it is reading and the leaves are 3.4 cm apart, so a leaf two or
 * three up is at or above eye level and out of a downward shot regardless of
 * where it points. Only the leaf *immediately* above can intrude — and that is
 * one condition, not three.
 *
 * With yaw and θ both rising 90° a step, s alternates 0°, 180°, 0°, 180°: every
 * leaf square at its own chapter, and the labels landing alternately left and
 * right of the stem — which is both the natural-looking result and what the
 * last leaf needs, its chapter being the FAQ's arrival and that section owning
 * the left of the screen.
 *
 * These four are not a guess. Every way of hanging four leaves at 90° and
 * choosing a side for each was enumerated and scored on how much leaf ends up
 * between the lens and the blade being read, weighted by whether that leaf is
 * near enough to the lens's own height to matter. This assignment scores zero;
 * the obvious one — all four square on the same side — does not, because it
 * leaves the topmost leaf pointing straight into the lens by the time the
 * camera has come down to the fourth, five centimetres under it and filling
 * the frame.
 *
 * These are therefore locked to lib/journey's stem bearings. Move those and
 * these move with them.
 */
const LEAF_YAW = [1.222, 2.793, 4.363, 5.934] as const;

/**
 * Which half of the frame each leaf's label hangs in.
 *
 * Three right, one left, rather than a strict alternation — the last one is
 * the reason. Its chapter is also the FAQ's arrival: that section lays a
 * reading column down the left of the screen, and lib/journey aims the camera
 * left of the plant precisely so the plant stands clear of it in the right-hand
 * third. A label hung to the left of the last leaf lands on top of the words
 * "The questions people ask". So it hangs right, with the plant.
 */
const LEAF_SIDE = [-1, 1, -1, 1] as const;

/**
 * Leaf `i`, in world space.
 *
 * Alternating sides so the plant runs between the labels rather than beside
 * them, with enough of an offset on each that no two of the four are parallel.
 *
 * The join is on the *surface* of the stem rather than on the axis through
 * FLOWER.x/z. The stem leans a full width off that axis around half height, and
 * a leaf hung on the axis there begins in mid air beside the plant — which is
 * exactly what four discs floating around a stalk looked like.
 */
export function leafAt(i: number): LeafPlacement {
  const t = LEAF_T[i] ?? 0.6;
  const side = LEAF_SIDE[i] ?? 1;
  const yaw = LEAF_YAW[i] ?? 0.25;
  const node = STEM.getPointAt(t);
  const r = stemRadius(t) * 0.55;
  /*
   * The hover lift is part of the leaf's attitude, not a decoration on top of
   * it.
   *
   * It has to be here, in the one place both halves read, because a label is
   * *printed on* its blade: the mesh takes its rotation from this and so does
   * the basis the type is set in, so a tip animated on the mesh alone would
   * slide the leaf out from under its own words. Being in `leafAt` also means
   * this function is no longer constant in time — anything memoising its result
   * across frames is memoising a pose.
   */
  const lift = leafHover.amount[i] ?? 0;

  return {
    t,
    side,
    yaw,
    /*
     * Sized to be read on, which is a different job from being decoration.
     *
     * These have grown twice. First from 0.104 when they stopped being scenery
     * beside the stem and became the thing you click; then to here, when the
     * label stopped pointing at a blade and was set *on* it. A label is a
     * rectangle of type fitted to the blade's width where the type ends, so
     * every millimetre of leaf is type size — and at the previous 0.128 the
     * four lines were down at the floor the fit allows.
     *
     * Broad, not long-and-thin. At roughly two to one these read as leaves;
     * the four-to-one they were originally cut at read as one more blade of
     * grass among several thousand, which is exactly what they were mistaken
     * for. The grass in this biome is thirteen to one, so the further from that
     * the better.
     */
    length: 0.165 + (i % 2) * 0.025,
    width: 0.092 + (i % 2) * 0.012,
    /* Lower leaves droop a little harder. The lens reads each leaf from above,
       so a leaf *below* the one being read is nearer the camera and leans up
       into the shot; dropping its far half takes it out of that sightline.
       0.22 was too much of it — every blade's tip then swung down over the top
       corner of the leaf beneath, which is exactly where a label's date line is
       anchored, and the second leaf lost its date to the leaf above it. */
    droop: 0.95 + i * 0.14,
    twist: 0.42 + (i % 2) * 0.24,
    sweep: side * 0.18,
    position: [node.x + Math.sin(yaw) * r, node.y, node.z + Math.cos(yaw) * r],
    /*
     * The blade's tip is dropped a little, and which way depends on the side.
     *
     * It used to be a flat negative for all four, which was right while every
     * leaf sat on the same side of the stem and wrong the moment they started
     * alternating: the same tilt that tips a right-hand blade's face up toward
     * a lens above it tips a left-hand blade's face away, and the first leaf
     * came out as a sliver with its caption squashed along it while its
     * neighbour opposite read perfectly.
     *
     * It is also flat across the four rather than growing with the index, which
     * it used to. Under the alternation that growth compounded: the lowest
     * left-hand leaf ended up tipped nearly three times as far as the highest,
     * and since the label is set in the blade's own axes, that arrived as a
     * caption running 35–40° downhill on one leaf while the other three sat
     * level. A label that is the odd one out looks like a mistake even when it
     * is legible.
     */
    rotation: [side * -0.07 + lift * HOVER_LIFT, yaw, side * 0.12, "YXZ"],
  };
}

const _euler = new Euler();
const _reach = new Vector3();
const _local = { x: 0, y: 0, z: 0 };

/**
 * A point on leaf `i`'s actual surface: `u` along it, `v` across it.
 *
 * Straight through three/geometry's `leafSurface` — the same function the mesh
 * is built out of — and then into world space by the leaf's own placement. With
 * three of these the document has the blade's two axes as they appear on
 * screen, which is the basis the four labels are set in.
 *
 * This replaced three separate approximations of the same thing, each wrong in
 * its own way: one that guessed the tip's offset and ignored the blade's sweep,
 * one that found a midpoint by halving the chord to the tip when a leaf droops
 * on a curve, and one that took the centre line for the middle of the leaf.
 *
 * That last is the subtle one, and it is why `v` is a parameter rather than
 * assumed. The centre line at v = 0 is the *top* edge of the silhouette, not
 * the middle of it: `fold` hangs both margins below the spine, so the blade is
 * a shallow trough opening downward and its highest line is its centre. A label
 * centred there hovers above the leaf with the whole leaf underneath it. The
 * middle of what you can actually see is the midpoint of the two margins.
 */
export function leafSurfacePoint(
  i: number,
  u: number,
  v: number,
  out = new Vector3(),
): Vector3 {
  const leaf = leafAt(i);
  leafSurface(
    {
      length: leaf.length,
      width: leaf.width,
      droop: leaf.droop,
      twist: leaf.twist,
      sweep: leaf.sweep,
      // Not passed to leafGeometry by three/Flower either, so these are its
      // defaults. They are named here rather than left implicit because the
      // fold is exactly what this function exists to account for.
      stalk: 0.26,
      fold: 0.34,
      wave: 0.3,
    },
    u,
    v,
    _local,
  );
  _reach.set(_local.x, _local.y, _local.z);
  _euler.set(leaf.rotation[0], leaf.rotation[1], leaf.rotation[2], "YXZ");
  _reach.applyEuler(_euler);
  return out.set(
    leaf.position[0] + _reach.x,
    leaf.position[1] + _reach.y,
    leaf.position[2] + _reach.z,
  );
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * The camera, published once per frame by the rig so the document can use it.
 *
 * The alternative — the labels keeping their own copy of the journey and
 * working out where the camera must be — is two implementations of the same
 * move that quietly disagree the first time a keyframe changes.
 */
export const view = {
  matrix: new Matrix4(),
  ready: false,
};

const _p = new Vector3();

/** World point → viewport pixels. Returns null when it is behind the lens. */
export function worldToScreen(
  world: Vector3,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (!view.ready) return null;
  _p.copy(world).applyMatrix4(view.matrix);
  if (_p.z < -1 || _p.z > 1) return null;
  return {
    x: (_p.x * 0.5 + 0.5) * width,
    y: (-_p.y * 0.5 + 0.5) * height,
  };
}
