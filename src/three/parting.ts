import { FLOWER, sampleCamera, type CameraSample } from "@/lib/journey";
import { smoothstep } from "@/lib/math";
import { Vector3 } from "three";

/**
 * Keeping the camera's own sight line clear, without leaving a hole in the
 * field where it used to be.
 *
 * From the moment the camera comes off the bloom until the end of the soil act
 * the lens is between eight centimetres and about a metre off the ground, and
 * the subject — the stem, and the ant going down it — is a third of a metre
 * away. Two things ruin that shot: a blade rooted right against the lens, which
 * is not depth but half a frame of one flat green; and a blade rooted between
 * the lens and the plant, which hides the subject without ever coming near
 * enough to be culled for the first reason.
 *
 * There are two ways to answer that, and this file is both of them.
 *
 * `sightCeiling` is the old one and it is permanent: a height nothing may grow
 * past, applied when the field is planted. Anything that cannot move once it is
 * in the buffer — a poppy head, a fern — still has to use it, because the only
 * way for a rigid thing to be out of the shot is never to have grown into it.
 *
 * `partingAt` is the other, and it is what the grass uses. It marks the blades
 * standing in the corridor rather than cutting them: how far each one has to
 * lay over to be under the sight line, and which way. Nothing is decided at
 * plant time except *how much* — the parting itself is a uniform, so the same
 * blade stands at full height for the acts spent looking at the plant and goes
 * over as the camera comes down through it. That is both the honest version of
 * the effect and the fix for what the permanent carve cost: a corridor cut out
 * of the field at plant time is a bald corridor in every frame, including the
 * ones where the camera is pointed straight at the flower beside it.
 */

type Eye = { ex: number; ey: number; ez: number; tx: number; ty: number; tz: number };

/**
 * Where the camera stands once it is down among the plants, and what it is
 * looking at from there.
 *
 * Sampled off the camera path rather than written down, so moving a keyframe
 * moves the clearance with it. The target comes along with the position because
 * the line that has to stay clear is the line between them, and both ends of it
 * move.
 */
function eyes(from: number, to: number, steps = 32): Eye[] {
  const pts: Eye[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = sampleCamera(from + (i / steps) * (to - from));
    pts.push({
      ex: s.pos.x,
      ey: s.pos.y,
      ez: s.pos.z,
      tx: s.target.x,
      ty: s.target.y,
      tz: s.target.z,
    });
  }
  return pts;
}

/**
 * Everything from the camera leaving the bloom to it climbing back out. Both
 * rules are read off the same stretch, because the shot that needs the sight
 * line is the same shot whether the thing in the way can lay over or not.
 */
const GROUND_EYE = eyes(3.05, 5.15);

/** Metres of ground in front of the lens that nothing may stand up in. */
const EYE_CLEAR = 0.16;
/**
 * ...and the width of the corridor kept clear along its sight line.
 *
 * Widened from 0.10 when the four leaves started carrying the labels. The lens
 * is now aimed at a *blade*, not at the stem, and a caption is printed across
 * the whole of that blade — 19 cm of it — so a corridor ten centimetres wide
 * protected the middle of the leaf and left both ends of every label exposed.
 * Do not nudge this to taste. It is read by `sightCeiling`, which gates a
 * `continue` inside a planting loop that is also drawing from the seeded
 * random — so changing it changes how many draws happen, and every clump after
 * the first skip lands somewhere else. The field re-rolls. A value that looks
 * worse is usually a different field rather than a worse rule, and the only
 * honest way to compare two values is to look at all four leaves under each.
 * 0.17 is the one that was checked that way.
 * A grass blade crossing there does not hide the caption, because the caption
 * is DOM drawn over the canvas: it puts the caption on the grass.
 *
 * This is the number that replaced widening `FLOWER.clearing`, which was doing
 * the same job by carving a permanent bare ring the whole field could see.
 */
const SIGHT_CLEAR = 0.17;
/** How far under the sight line the tallest thing in the corridor has to stop. */
const SIGHT_MARGIN = 0.02;

/**
 * How far past each of those the parting feathers out.
 *
 * A corridor with a hard edge is a mown stripe: the blade at 10.0cm is flat and
 * the one at 10.1cm is standing, and the join between them reads as a cut even
 * when the ground under it is covered. Relaxing the ceiling over the next
 * handspan turns the edge into a gradient — the blades at the middle go right
 * over, the ones at the edge only lean — which is what grass someone has walked
 * through actually looks like.
 */
const EYE_FEATHER = 0.26;
const SIGHT_FEATHER = 0.2;
/** How fast the ceiling lifts across the feather. Past this it is no ceiling. */
const FEATHER_LIFT = 0.7;

/**
 * How far from the plant any of that can possibly reach. Every camera in the
 * range and everything it is looking at is within arm's length of the stem, so
 * this one comparison takes all but a few dozen of the field's clumps out
 * before the loops below are entered at all.
 */
function reach(set: Eye[], pad: number): number {
  let far = 0;
  for (const e of set) {
    far = Math.max(
      far,
      Math.hypot(e.ex - FLOWER.x, e.ez - FLOWER.z),
      Math.hypot(e.tx - FLOWER.x, e.tz - FLOWER.z),
    );
  }
  return far + pad;
}

const RIGID_REACH = reach(GROUND_EYE, Math.max(EYE_CLEAR, SIGHT_CLEAR));
const PART_REACH = reach(GROUND_EYE, Math.max(EYE_FEATHER, SIGHT_FEATHER));

/**
 * The highest a rigid plant standing at (x, z) may reach without getting into
 * one of those shots — a world Y, or Infinity where the camera never looks.
 *
 * This used to be a boolean, and a boolean is what put a bald patch in the
 * bloom act: it is not true that nothing may grow in the corridor, only that
 * nothing may grow *across* it, and those are different rules the moment the
 * lens is a hand's width off the floor and pointed almost level.
 */
export function sightCeiling(x: number, z: number): number {
  if (Math.hypot(x - FLOWER.x, z - FLOWER.z) > RIGID_REACH) return Infinity;

  let ceiling = Infinity;

  for (const e of GROUND_EYE) {
    const dx = x - e.ex;
    const dz = z - e.ez;
    // Right under the lens: nothing may come up past it, whatever it is aimed
    // at. A blade level with the glass fills the frame from anywhere.
    if (dx * dx + dz * dz < EYE_CLEAR * EYE_CLEAR) {
      ceiling = Math.min(ceiling, e.ey - SIGHT_MARGIN);
    }

    // Distance to the segment from the lens to whatever it is looking at, and
    // how high that line has climbed by the time it gets there.
    const sx = e.tx - e.ex;
    const sz = e.tz - e.ez;
    const len = sx * sx + sz * sz;
    if (len < 1e-6) continue;
    let t = (dx * sx + dz * sz) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = dx - sx * t;
    const cz = dz - sz * t;
    if (cx * cx + cz * cz < SIGHT_CLEAR * SIGHT_CLEAR) {
      ceiling = Math.min(ceiling, e.ey + (e.ty - e.ey) * t - SIGHT_MARGIN);
    }
  }

  return ceiling;
}

export type Parting = {
  /** World Y the grass here has to be under once the parting is fully open. */
  ceiling: number;
  /** Which way it lays over to get there — a unit vector on the ground. */
  dirX: number;
  dirZ: number;
};

/**
 * What the ground at (x, z) is asked to do, or null where the camera never
 * comes near enough to ask anything.
 *
 * The direction is away from whatever is doing the asking — out of the lens's
 * way, or sideways off the sight line — summed over every camera that binds
 * here and weighted by how hard each one binds. That is the whole reason this
 * reads as parting rather than as wilting: a blade that lays over toward the
 * corridor is still in the corridor, and a field where every blade goes the
 * same way is a field someone has combed.
 */
export function partingAt(x: number, z: number): Parting | null {
  if (Math.hypot(x - FLOWER.x, z - FLOWER.z) > PART_REACH) return null;

  let ceiling = Infinity;
  let ax = 0;
  let az = 0;

  for (const e of GROUND_EYE) {
    const dx = x - e.ex;
    const dz = z - e.ez;

    const d = Math.hypot(dx, dz);
    if (d < EYE_FEATHER) {
      const f = smoothstep(EYE_CLEAR, EYE_FEATHER, d);
      ceiling = Math.min(ceiling, e.ey - SIGHT_MARGIN + f * FEATHER_LIFT);
      const w = 1 - f;
      if (d > 1e-4) {
        ax += (dx / d) * w;
        az += (dz / d) * w;
      }
    }

    const sx = e.tx - e.ex;
    const sz = e.tz - e.ez;
    const len = sx * sx + sz * sz;
    if (len < 1e-6) continue;
    let t = (dx * sx + dz * sz) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = dx - sx * t;
    const cz = dz - sz * t;
    const off = Math.hypot(cx, cz);
    if (off < SIGHT_FEATHER) {
      const f = smoothstep(SIGHT_CLEAR, SIGHT_FEATHER, off);
      ceiling = Math.min(ceiling, e.ey + (e.ty - e.ey) * t - SIGHT_MARGIN + f * FEATHER_LIFT);
      const w = 1 - f;
      if (off > 1e-4) {
        ax += (cx / off) * w;
        az += (cz / off) * w;
      } else {
        // Standing exactly on the sight line, where "away" has no sign. Either
        // shoulder will do; taking the segment's left normal keeps a whole row
        // of them agreeing with each other instead of scattering.
        const inv = 1 / Math.sqrt(len);
        ax += -sz * inv * w;
        az += sx * inv * w;
      }
    }
  }

  if (!Number.isFinite(ceiling)) return null;

  const mag = Math.hypot(ax, az);
  if (mag < 1e-5) return { ceiling, dirX: 1, dirZ: 0 };
  return { ceiling, dirX: ax / mag, dirZ: az / mag };
}

/**
 * Past horizontal, so a blade the lens is about to pass through its own root
 * goes over far enough to be in the floor rather than lying on it.
 *
 * The alternative is a blade laid flat five centimetres in front of the glass,
 * which is the same half-frame of one flat green the whole clearance exists to
 * prevent — only horizontal.
 */
const MAX_LAY = 1.75;

/**
 * How far a blade has to lay over to get its whole length under `ceiling`, in
 * radians about its own root.
 *
 * The shader lays it over as a rigid rotation, so this is solved against the
 * shape the shader actually builds rather than against the tip alone: a blade
 * bent through an arc is highest somewhere up its length, not at its end, and
 * rotating it about the root swaps some of its bend into height and some of its
 * height into reach. Writing a station of it as R·cos(θ + φ) — R how far that
 * station is from the root, φ where it sits round from vertical in the plane it
 * is going over in — makes the angle that puts it under a ceiling a closed form
 * rather than a search.
 */
export function layAngle(
  height: number,
  bend: number,
  curve: number,
  facing: number,
  dirX: number,
  dirZ: number,
  headroom: number,
): number {
  if (headroom >= height * 1.02) return 0;
  const room = Math.max(0.004, headroom);
  const sf = Math.sin(facing);
  const cf = Math.cos(facing);

  let need = 0;
  // The wind is worth about a quarter of a radian of bend either way and the
  // cursor spring rather more, and a corridor that is clear only on a still
  // frame is not clear. Solving the two extremes as well as the rest state
  // costs three passes over a handful of stations.
  for (const k of [bend - 0.3, bend, bend + 0.3]) {
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const y = height * (t - (k * k * t * t * t) / 6);
      const lx = curve * height * t * t;
      const lz = height * k * t * t * 0.5;
      // ...into the world, and then onto the axis it is going over about.
      const along = (cf * lx + sf * lz) * dirX + (-sf * lx + cf * lz) * dirZ;
      const r = Math.hypot(y, along);
      if (r <= room) continue;
      const phi = Math.atan2(along, y);
      const want = Math.acos(Math.min(1, Math.max(-1, room / r))) - phi;
      if (want > need) need = want;
    }
  }

  return Math.min(MAX_LAY, Math.max(0, need));
}

/**
 * How far open the parting is at a chapter.
 *
 * Read off how low the lens has got rather than off chapter numbers written
 * down here, because that is what the effect actually is: the grass goes over
 * as the camera comes down into it and stands back up as it climbs out, and
 * both of those are the same fact about the same move. It also means the two
 * ends of the shot are found rather than maintained — nothing here has to be
 * re-timed when a keyframe in lib/journey.ts moves.
 *
 * The band is set around the canopy. Above it the camera is looking down at the
 * field from outside and the field is what it is looking at; below it the lens
 * is inside the canopy and everything between it and the plant is in the way.
 */
const CANOPY = 0.62;
const CANOPY_IN = 0.4;

const _sample: CameraSample = { pos: new Vector3(), target: new Vector3(), fov: 42 };

export function partedAt(chapter: number): number {
  return 1 - smoothstep(CANOPY_IN, CANOPY, sampleCamera(chapter, _sample).pos.y);
}

/**
 * The vertex-stage half of it: a rigid rotation of the whole blade about its
 * own root, in the plane it was told to go over in.
 *
 * Rigid, because the alternative is a blade that gets shorter — and grass does
 * not retract into the ground when something walks through it, it lies down.
 * Length is the one thing that has to survive the rotation or the field visibly
 * shrinks and regrows every time the camera passes.
 *
 * Takes the blade in world orientation but still about its own root, so it goes
 * after the facing turn and before the root offset.
 */
export const PART_GLSL = /* glsl */ `
vec3 layOver(vec3 p, float angle, float bearing) {
  if (angle <= 0.0) return p;
  vec2 d = vec2(cos(bearing), sin(bearing));
  float along = dot(p.xz, d);
  vec2 across = p.xz - d * along;
  float c = cos(angle);
  float s = sin(angle);
  vec2 laid = across + d * (p.y * s + along * c);
  return vec3(laid.x, p.y * c - along * s, laid.y);
}
`;
