import type { Biome } from "@/lib/biomes";
import { sampleCamera } from "@/lib/journey";
import { makeRandom } from "@/lib/math";
import { plantLitter } from "./field";

/**
 * How last autumn is lying, as opposed to where it is.
 *
 * three/field.ts decides where litter can be at all — the same footprint the
 * ferns are planted on, which is a fact the whole scene has to agree about.
 * Everything after that is a fact about one leaf that nothing outside this
 * family reads, so it is drawn here rather than widened into the field's
 * record.
 *
 * Two things were wrong with taking the field's scatter as the final word.
 *
 * The first is that it is *even*. A uniform scatter has the same number of
 * leaves per square metre everywhere, and that is not what a floor under trees
 * looks like from any height: leaves blow into drifts against whatever stops
 * them, so the floor is banks with bare ground showing between rather than a
 * carpet at one density. So most of the fall is re-dealt into drifts seeded off
 * the field's own points — which keeps the footprint exactly, because the seeds
 * are drawn from the scatter itself and inherit its shape — and the rest is
 * left where it fell, as the strays between the banks.
 *
 * The second is that a leaf lying on a drift is not lying on the floor. Inside
 * a bank the leaves are stacked several deep, propped against each other at
 * every angle up to on-edge, and it is that — not the tilt of a single flat
 * card — that makes the frame read as depth rather than as pattern.
 */
export type Fallen = {
  x: number;
  z: number;
  /** Which way it points, then how far it is tipped and rolled off flat. */
  yaw: number;
  pitch: number;
  roll: number;
  /** How far above the soil surface its middle sits, once it is turned. */
  lift: number;
  /** Metres, tip to tip, and how broad it is for that length. */
  size: number;
  slender: number;
  /** Curled across its width, buckled along its length, and wrung about it. */
  cup: number;
  buckle: number;
  twist: number;
  /** Which litter stop it takes, how dark it has gone, how far to skeleton. */
  tone: number;
  shade: number;
  bleach: number;
};

/** One drift in how many leaves — a bank of two dozen is a bank you can see. */
const PER_DRIFT = 24;

/**
 * Where the lens is once it is down on the floor, sampled off the camera path
 * rather than written down, the same way three/field.ts keeps the grass out of
 * its own way.
 *
 * Litter never needed this while it lay flat: a card on the ground is a card on
 * the ground however close it is. A leaf that is curled and propped is not —
 * one of them the size of a hand, standing on edge fifteen centimetres from the
 * lens, is an opaque wall across a third of the frame with the questions being
 * read over it, and the whole soil act was behind one.
 */
const GROUND_EYE: Array<[number, number]> = (() => {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const p = sampleCamera(3.85 + (i / 24) * 1.35).pos;
    pts.push([p.x, p.z]);
  }
  return pts;
})();

/** Metres of floor kept clear of leaves entirely, and how far past that they
 *  stay lying down. */
const EYE_BARE = 0.085;
const EYE_FLAT = 0.34;

function toGroundEye(x: number, z: number): number {
  let best = Infinity;
  for (const [ex, ez] of GROUND_EYE) {
    const d = Math.hypot(x - ex, z - ez);
    if (d < best) best = d;
  }
  return best;
}

export function fallenLeaves(count: number, biome: Biome, seed = 88113): Fallen[] {
  const fall = plantLitter(count, biome);
  if (!fall.length) return [];

  const rnd = makeRandom(seed);
  const out: Fallen[] = [];

  // Drift centres, taken off the scatter itself so they land where litter is
  // allowed to be and nowhere else. Each carries its own reach: a bank against
  // a fern crown is a hand's width across and one in the open is half a metre,
  // and a single radius for all of them is the even scatter again at a coarser
  // grain.
  const seeds = fall.filter((_, i) => i % PER_DRIFT === 0);
  const reach = seeds.map(() => 0.09 + Math.pow(rnd(), 1.5) * 0.34);

  for (const leaf of fall) {
    let x = leaf.x;
    let z = leaf.z;
    // How deep into a bank this leaf is — 0 out on the bare floor, 1 in the
    // middle of a heap. Everything about how it lies is pitched off this.
    let deep = 0;

    if (rnd() < 0.74) {
      const j = (rnd() * seeds.length) | 0;
      const r = reach[j];
      // Fourth root, not square root: a drift is not a disc of even density,
      // it is a heap with a middle.
      const d = Math.pow(rnd(), 0.28) * r;
      const a = rnd() * Math.PI * 2;
      x = seeds[j].x + Math.cos(a) * d;
      z = seeds[j].z + Math.sin(a) * d;
      deep = 1 - d / r;
    }

    // The last hand's width in front of the lens is bare, and the hand's width
    // past that is flat: the floor there is the ground shader's to carry, and
    // it is modelled for exactly this range.
    const eye = toGroundEye(x, z);
    if (eye < EYE_BARE) continue;
    const near = Math.min(1, (eye - EYE_BARE) / EYE_FLAT);

    // Mostly small, with the occasional big one to give the frame a scale.
    // The old range started where this one ends: leaves the size of a hand
    // lying on a forest floor read as paper, and sixteen thousand of them all
    // within a factor of two of each other read as a pattern of paper.
    const size = (0.032 + Math.pow(rnd(), 1.7) * 0.118) * (0.45 + 0.55 * near);

    // Flat on the floor out in the open; propped at every angle in a bank,
    // because in a bank there is something under it. One leaf in twenty is
    // standing more or less on edge wherever it is — those are the ones that
    // put a silhouette against the ground.
    const edge = rnd() < 0.05 && near > 0.5;
    const pitch =
      (rnd() * 2 - 1) *
      (edge ? 0.95 + rnd() * 0.5 : 0.14 + 1.05 * deep * Math.pow(rnd(), 1.6)) *
      near;
    const roll = (rnd() * 2 - 1) * (0.35 + 1.1 * Math.pow(rnd(), 1.3)) * (0.3 + 0.7 * near);

    // Stacked. The middle of a drift is several leaves deep, and the lift is
    // also the only thing stopping sixteen thousand of these fighting the
    // floor and each other for the same depth.
    const stack = (0.0018 + deep * deep * rnd() * 0.028) * (0.25 + 0.75 * near);
    const lift =
      stack + size * (0.5 * Math.abs(Math.sin(pitch)) + 0.3 * Math.abs(Math.sin(roll)));

    // How far gone. Most of the fall is a brown; a tenth of it has rotted to
    // almost nothing, and a twentieth has been under the rest of it long
    // enough that only the veins are left.
    const rot = rnd();
    out.push({
      x,
      z,
      yaw: rnd() * Math.PI * 2,
      pitch,
      roll,
      lift,
      size,
      slender: 0.6 + rnd() * 0.72,
      // A dry leaf curls hard across its width. Almost none of them are flat,
      // and the ones that are are the ones that came down in the wet.
      cup: 0.18 + Math.pow(rnd(), 0.7) * 1.15,
      buckle: (rnd() * 2 - 1) * 0.55,
      twist: (rnd() * 2 - 1) * 0.8,
      tone: rnd() * 0.999,
      shade: rot < 0.1 ? 0.3 + rnd() * 0.22 : 0.62 + rnd() * 0.56,
      bleach: rnd() < 0.055 ? 0.55 + rnd() * 0.45 : 0,
    });
  }

  return out;
}
