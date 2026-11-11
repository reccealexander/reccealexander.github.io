// src/lib/journey.ts
import { Vector3 as Vector32 } from "three";

// src/lib/math.ts
function hermite(keys, x) {
  const n = keys.length;
  if (n === 0) return 0;
  if (x <= keys[0].at) return keys[0].v;
  if (x >= keys[n - 1].at) return keys[n - 1].v;
  let i = 0;
  while (i < n - 2 && x > keys[i + 1].at) i++;
  const h = keys[i + 1].at - keys[i].at;
  const slope = (j) => {
    if (j === 0) return (keys[1].v - keys[0].v) / (keys[1].at - keys[0].at);
    if (j === n - 1)
      return (keys[n - 1].v - keys[n - 2].v) / (keys[n - 1].at - keys[n - 2].at);
    const hPrev = keys[j].at - keys[j - 1].at;
    const hNext = keys[j + 1].at - keys[j].at;
    const dPrev = (keys[j].v - keys[j - 1].v) / hPrev;
    const dNext = (keys[j + 1].v - keys[j].v) / hNext;
    if (dPrev * dNext <= 0) return 0;
    const w1 = 2 * hNext + hPrev;
    const w2 = hNext + 2 * hPrev;
    return (w1 + w2) / (w1 / dPrev + w2 / dNext);
  };
  const m0 = slope(i);
  const m1 = slope(i + 1);
  const t = (x - keys[i].at) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * keys[i].v + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * keys[i + 1].v + (t3 - t2) * h * m1;
}

// src/lib/flowerLayout.ts
import { Matrix4, Vector3 } from "three";
var FLOWER = {
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
   * Barely cleared at all. The grass has to grow right up to the stem or the
   * bare ring around it is itself the thing that gives the plant away from
   * above — a hole in a field reads from much further off than a flower does.
   */
  clearing: 0.12
};
var PHASE = -Math.PI / 2 + 0.22;
var view = {
  matrix: new Matrix4(),
  ready: false
};
var _p = new Vector3();

// src/lib/journey.ts
function overBloom(deg, radius, height) {
  const a = deg * Math.PI / 180;
  return [
    FLOWER.x + Math.cos(a) * radius,
    FLOWER.height + height,
    FLOWER.z + Math.sin(a) * radius
  ];
}
function besideStem(deg, radius, y) {
  const a = deg * Math.PI / 180;
  return [FLOWER.x + Math.cos(a) * radius, y, FLOWER.z + Math.sin(a) * radius];
}
var BLOOM = [FLOWER.x, FLOWER.height, FLOWER.z];
var FRAMES = [
  // ---- 0 · the field, from above ---------------------------------------
  //
  // High and tipped hard down. Two things fall out of that: the horizon is
  // above the top of the frame, so the canopy is the whole picture and there
  // is no sky anywhere in this scene; and the plant, which stands an inch
  // under the canopy line in the near grass, is not merely small — it is
  // behind the grass at the bottom of the frame, and cannot be picked out
  // until the camera drops into it.
  { at: 0, pos: [0, 2.95, 1.75], target: [0, 0.02, -1.05], fov: 40 },
  { at: 0.6, pos: [0.04, 2.88, 1.66], target: [0, 0.02, -1.15], fov: 40 },
  // ---- 1 · the approach. The camera tips down and drops into the grass at
  // its own feet, and the flower it has been standing over the whole time
  // comes up into frame. -----------------------------------------------
  { at: 1, pos: [0.08, 2.66, 1.78], target: [0.12, 0.04, -0.65], fov: 41 },
  { at: 1.35, pos: [0.2, 1.94, 1.66], target: [0.28, 0.14, 0.3], fov: 41 },
  { at: 1.65, pos: [0.32, 1.26, 1.5], target: [FLOWER.x, 0.28, FLOWER.z], fov: 42 },
  { at: 1.86, pos: [0.4, 0.96, 1.33], target: BLOOM, fov: 42 },
  { at: 2, pos: overBloom(72, 0.34, 0.6), target: BLOOM, fov: 42 },
  // ---- 2 · the bloom. Eight petals, eight things it does. The camera is
  // nearly still here and only turns — the labels are pinned to the petals,
  // and a moving frame makes eight of them chase their own anchors. -----
  { at: 2.35, pos: overBloom(84, 0.35, 0.61), target: BLOOM, fov: 42 },
  { at: 2.7, pos: overBloom(97, 0.36, 0.605), target: BLOOM, fov: 42 },
  { at: 3, pos: overBloom(110, 0.4, 0.53), target: [FLOWER.x, FLOWER.height - 0.02, FLOWER.z], fov: 43 },
  // ---- 3 · down the stem. Out of the bloom, onto the stem, and then the
  // pan down it with the ant going first. Heights are fractions of the
  // stem rather than metres, so shortening the plant does not strand the
  // camera above it. ----------------------------------------------------
  { at: 3.15, pos: besideStem(118, 0.34, FLOWER.height * 1.14), target: [FLOWER.x, FLOWER.height * 0.95, FLOWER.z], fov: 44 },
  { at: 3.4, pos: besideStem(126, 0.3, FLOWER.height * 0.83), target: [FLOWER.x, FLOWER.height * 0.72, FLOWER.z], fov: 44 },
  { at: 3.7, pos: besideStem(134, 0.28, FLOWER.height * 0.53), target: [FLOWER.x, FLOWER.height * 0.43, FLOWER.z], fov: 44 },
  { at: 4, pos: besideStem(142, 0.3, FLOWER.height * 0.24), target: [FLOWER.x, FLOWER.height * 0.14, FLOWER.z], fov: 44 },
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
  { at: 4.4, pos: besideStem(152, 0.32, 0.15), target: [FLOWER.x - 0.11, 0.115, FLOWER.z], fov: 43 },
  { at: 5, pos: besideStem(172, 0.36, 0.135), target: [FLOWER.x - 0.12, 0.1, FLOWER.z], fov: 42 },
  // ---- 5 · back out, to the bird's eye again.
  //
  // The move is finished by 5.5, not 6: an act's local progress reaches 1
  // when its last pixel leaves the top of the screen, so the back half of
  // this one plays to a reader already looking at the footer. -----------
  { at: 5.25, pos: [FLOWER.x + 0.4, 0.62, FLOWER.z + 0.95], target: [FLOWER.x, 0.3, FLOWER.z], fov: 42 },
  // Aimed off the plant rather than at it, so the centred closing copy has
  // the middle of the frame and the flower stands to one side of it.
  { at: 5.5, pos: [FLOWER.x + 2.1, 1.7, FLOWER.z + 1.6], target: [FLOWER.x - 1.85, 0.1, FLOWER.z - 0.5], fov: 41 },
  { at: 6, pos: [FLOWER.x + 1.9, 2.9, FLOWER.z + 2.1], target: [FLOWER.x - 1.9, 0.02, FLOWER.z - 1.2], fov: 40 }
];
var channel = (pick) => FRAMES.map((f) => ({ at: f.at, v: pick(f) }));
var CHANNELS = {
  px: channel((f) => f.pos[0]),
  py: channel((f) => f.pos[1]),
  pz: channel((f) => f.pos[2]),
  tx: channel((f) => f.target[0]),
  ty: channel((f) => f.target[1]),
  tz: channel((f) => f.target[2]),
  fov: channel((f) => f.fov)
};
var _pos = new Vector32();
var _target = new Vector32();
function sampleCamera(c, out) {
  const o = out ?? { pos: _pos, target: _target, fov: 42 };
  o.pos.set(hermite(CHANNELS.px, c), hermite(CHANNELS.py, c), hermite(CHANNELS.pz, c));
  o.target.set(hermite(CHANNELS.tx, c), hermite(CHANNELS.ty, c), hermite(CHANNELS.tz, c));
  o.fov = hermite(CHANNELS.fov, c);
  return o;
}
var LAYOUT = {
  heroVh: 100,
  approachVh: 128,
  bloomIntroVh: 120,
  bloomPetalVh: 62,
  stemIntroVh: 110,
  stemStepVh: 88,
  outVh: 200
};
var FEATURE_COUNT = 8;
var STEP_COUNT = 4;
var BLOOM_TOTAL = LAYOUT.bloomIntroVh + FEATURE_COUNT * LAYOUT.bloomPetalVh;
var STEM_TOTAL = LAYOUT.stemIntroVh + STEP_COUNT * LAYOUT.stemStepVh;
function featureChapter(i) {
  return 2 + (LAYOUT.bloomIntroVh + (i + 0.5) * LAYOUT.bloomPetalVh) / BLOOM_TOTAL;
}
function stepChapter(i) {
  return 3 + (LAYOUT.stemIntroVh + (i + 0.5) * LAYOUT.stemStepVh) / STEM_TOTAL;
}
function beats() {
  return [
    0.3,
    1.3,
    ...Array.from({ length: FEATURE_COUNT }, (_, i) => featureChapter(i)),
    ...Array.from({ length: STEP_COUNT }, (_, i) => stepChapter(i)),
    4.4,
    4.95,
    5.45
  ];
}
function nearestBeat(c) {
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
function stationGlow(c, at, width = 0.05) {
  const d = Math.abs(c - at) / width;
  return Math.exp(-d * d);
}
export {
  FEATURE_COUNT,
  FLOWER,
  LAYOUT,
  STEP_COUNT,
  beats,
  featureChapter,
  nearestBeat,
  sampleCamera,
  stationGlow,
  stepChapter
};
