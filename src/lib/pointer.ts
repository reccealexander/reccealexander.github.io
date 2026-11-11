/**
 * The cursor, as a place in the field rather than a place on the screen.
 *
 * The DOM site solved this in two dimensions — the pointer and the grass were
 * both in canvas pixels — but here the grass is out in the world, so the
 * pointer has to be put there too: a ray through the cursor, met with a plane
 * at about the height of the canopy. Everything downstream reasons in metres.
 *
 * Velocity is sampled once per frame rather than per event, because several
 * pointermove events can land between two frames and the field wants their
 * sum, not the last one.
 */

const VEL_SMOOTH = 0.35;

export const pointer = {
  active: false,
  /** Normalised device coords, -1..1. */
  ndcX: 0,
  ndcY: 0,
  /** Where the cursor is standing, in world metres on the canopy plane. */
  worldX: 0,
  worldZ: 0,
  /** Smoothed world velocity, m/s, and its magnitude. */
  velX: 0,
  velZ: 0,
  speed: 0,
};

let rawX = 0;
let rawY = 0;
let prevWorldX = 0;
let prevWorldZ = 0;
let primed = false;

export function initPointer(): () => void {
  const move = (e: PointerEvent) => {
    rawX = (e.clientX / window.innerWidth) * 2 - 1;
    rawY = -((e.clientY / window.innerHeight) * 2 - 1);
    pointer.active = true;
  };
  const leave = () => {
    pointer.active = false;
    primed = false;
  };

  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerleave", leave);
  window.addEventListener("blur", leave);
  return () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerleave", leave);
    window.removeEventListener("blur", leave);
  };
}

/** Called once per frame by the rig, after it has placed the camera. */
export function stepPointer(
  dt: number,
  project: (ndcX: number, ndcY: number) => { x: number; z: number } | null,
) {
  pointer.ndcX = rawX;
  pointer.ndcY = rawY;

  const hit = pointer.active ? project(rawX, rawY) : null;
  if (!hit) {
    primed = false;
    pointer.velX += -pointer.velX * VEL_SMOOTH;
    pointer.velZ += -pointer.velZ * VEL_SMOOTH;
    pointer.speed = Math.hypot(pointer.velX, pointer.velZ);
    return;
  }

  pointer.worldX = hit.x;
  pointer.worldZ = hit.z;

  if (!primed) {
    prevWorldX = hit.x;
    prevWorldZ = hit.z;
    primed = true;
  }

  const step = dt > 0 ? dt : 0.016;
  const vx = (hit.x - prevWorldX) / step;
  const vz = (hit.z - prevWorldZ) / step;
  pointer.velX += (vx - pointer.velX) * VEL_SMOOTH;
  pointer.velZ += (vz - pointer.velZ) * VEL_SMOOTH;
  pointer.speed = Math.hypot(pointer.velX, pointer.velZ);
  prevWorldX = hit.x;
  prevWorldZ = hit.z;
}
