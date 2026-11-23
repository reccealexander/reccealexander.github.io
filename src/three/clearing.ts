import { reducedMotion } from "./quality";

/**
 * The clearing the page opens on.
 *
 * A patch of the field in the middle of the opening shot opens up: the grass
 * and the flowers in it shrink back into the ground from the middle outward,
 * and the ground under them shows as bare dirt — and the name glitches in on
 * it, with room for a description beneath (see ui/Hero.tsx).
 *
 * A rectangle with rounded corners, and the name and the description are set
 * to fill it (ui/Hero.tsx asks where it is on screen, clearingScreen). It is a
 * rectangle *from the opening camera*, which looks down the field at a slant. Two things make that true. Its width grows with
 * depth along the camera's line of sight, so its sides come out vertical on
 * screen rather than as a trapezoid. And the grass standing just in front of
 * its near edge is cut down to a height that cannot reach up over that edge
 * from where the camera is — otherwise the bottom of the patch is eaten by the
 * blades in front of it and comes out ragged and short. (The far and side
 * edges need no help: the grass beyond them rises away from the patch on
 * screen.) It opens once the field has started growing in, and closes again
 * as the page scrolls on into the plant: it belongs to the opening shot, not
 * to the field, and a bare patch beside the stem would be in the later shots.
 *
 * The same shape is worked out here in the shaders (CLEARING_GLSL) and on the
 * CPU (clearingDistance), so the groundhog keeps to exactly the grass the
 * reader can see.
 */
export const CLEARING = {
  /** Its middle on the ground, down the field, and its half-depth. */
  z: -1.2,
  hz: 0.95,
  /** Half-width across the field at its middle — at most; on a narrow screen
      it is held to a share of what is in view. */
  hx: 1.02,
  /** Corner radius, and how wide the soft rim of the dirt is. */
  corner: 0.08,
  rim: 0.06,
};
/** At most this share of the field in view across its middle, so a narrow
    screen still has grass either side of it. */
const SHARE_OF_VIEW = 0.82;
/*
 * The opening camera (lib/journey, chapter 0): where it stands and where it is
 * aimed, in the plane down the middle of the field, and its vertical field of
 * view. Depth along its line of sight is what on-screen size goes as, so that
 * is what the width follows.
 */
const CAM = { y: 2.95, z: 1.75 };
const AIM = { y: 0.02, z: -1.05 };
const TAN = Math.tan((40 / 2) * (Math.PI / 180));
const fwdLen = Math.hypot(AIM.y - CAM.y, AIM.z - CAM.z);
const FWD = { y: (AIM.y - CAM.y) / fwdLen, z: (AIM.z - CAM.z) / fwdLen };
/** The camera's up, square to its line of sight. */
const UP = { y: -FWD.z, z: FWD.y };
/** Depth of a point on the ground at z, along the camera's line of sight:
    DEPTH_A + DEPTH_B·z. */
const DEPTH_A = -CAM.y * FWD.y - CAM.z * FWD.z;
const DEPTH_B = FWD.z;
/** How much of the height a blade in front of the near edge may have, of what
    would just reach the edge — a little short, for its lean and its sway. */
const REACH = 0.85;

/** When it starts opening, after the first frame, and how long it takes. */
const OPEN_AT = 1.0;
const OPEN_FOR = 1.4;

/**
 * The clearing as the shaders take it: `k` sets its half-width, which at z is
 * k·depth(z); `z` and `hz` are its middle and half-depth on the ground.
 */
export const clearing = { open: 0, k: 0, z: CLEARING.z, hz: CLEARING.hz };

const halfWidthK = (aspect: number) =>
  Math.min(CLEARING.hx / (DEPTH_A + DEPTH_B * CLEARING.z), SHARE_OF_VIEW * TAN * aspect);
/** Where on the opening frame a point on the ground at z is, up it (-1..1). */
function frameY(z: number) {
  const vy = -CAM.y;
  const vz = z - CAM.z;
  const depth = vy * FWD.y + vz * FWD.z;
  return (vy * UP.y + vz * UP.z) / (depth * TAN);
}

/** The opened clearing's box on the opening screen, as fractions of it (0..1
    across and down), for a screen `aspect` wide. */
export function clearingScreen(aspect: number) {
  const half = halfWidthK(aspect) / (TAN * aspect) / 2;
  return {
    left: 0.5 - half,
    right: 0.5 + half,
    top: (1 - frameY(CLEARING.z - CLEARING.hz)) / 2,
    bottom: (1 - frameY(CLEARING.z + CLEARING.hz)) / 2,
  };
}

let started = -1;
const listeners = new Set<() => void>();
let announced = false;

/** Called once a frame by the scene; `chapter` is the damped scroll and
    `aspect` the canvas's width over its height. */
export function stepClearing(now: number, chapter: number, aspect: number) {
  clearing.k = halfWidthK(aspect);
  if (started < 0) started = now;
  const t = reducedMotion() ? 1 : Math.min(1, Math.max(0, (now - started - OPEN_AT) / OPEN_FOR));
  const intro = t * t * (3 - 2 * t);
  // Closes as the camera goes down into the grass, and stays closed after.
  const away = Math.min(1, Math.max(0, (chapter - 0.6) / 0.6));
  clearing.open = intro * (1 - away * away * (3 - 2 * away));
  if (!announced && intro > 0.8) {
    announced = true;
    listeners.forEach((l) => l());
  }
}

/**
 * Start the clearing over, closed. Called as the opening screen comes up — on
 * load, and again on coming back to it from another page, when the field is
 * planted afresh and its clearing has to open again before the name can
 * appear on it. (Otherwise the name, told on the first visit that the
 * clearing had opened, would be up at once, on standing grass.)
 */
export function restartClearing() {
  started = -1;
  announced = false;
  clearing.open = 0;
}

/** Run `cb` once the clearing has (nearly) opened — the cue for the name. */
export function onClearingOpen(cb: () => void): () => void {
  if (announced) {
    cb();
    return () => {};
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Signed distance, in metres, from (x, z) to the edge of the clearing at
 * `open` (0..1): negative inside, positive outside. The rounded rectangle
 * grows from its middle as it opens.
 */
export function clearingDistance(x: number, z: number, open = 1): number {
  if (open <= 0.001) return Infinity;
  const bx = clearing.k * (DEPTH_A + DEPTH_B * z) * open;
  const bz = clearing.hz * open;
  const r = CLEARING.corner * open;
  const qx = Math.abs(x) - bx + r;
  const qz = Math.abs(z - clearing.z) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

const f = (n: number) => n.toFixed(4);

/**
 * `clearingAt(xz)`: 1 where the clearing has opened (the dirt), 0 where the
 * field is standing, with a thin soft rim just inside the edge.
 *
 * `clearingCut(xz, height)`: how much of a plant `height` tall standing at xz
 * to take away — all of it in the clearing, and in the strip in front of its
 * near edge, enough that its tip stays below that edge from the camera. So the
 * tips of the strip all stop on the one line, whatever height each plant is.
 */
export const CLEARING_GLSL = /* glsl */ `
uniform float uClearOpen;
uniform float uClearK;
uniform float uClearZ;
uniform float uClearHZ;
float clearingEdge(vec2 p, out float halfW) {
  halfW = uClearK * (${f(DEPTH_A)} + ${f(DEPTH_B)} * p.y) * uClearOpen;
  vec2 b = vec2(halfW, uClearHZ * uClearOpen);
  float r = ${f(CLEARING.corner)} * uClearOpen;
  vec2 q = abs(p - vec2(0.0, uClearZ)) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float clearingAt(vec2 p) {
  if (uClearOpen <= 0.001) return 0.0;
  float halfW;
  float d = clearingEdge(p, halfW);
  return 1.0 - smoothstep(-${f(CLEARING.rim)}, 0.0, d);
}
float clearingCut(vec2 p, float height) {
  if (uClearOpen <= 0.001) return 0.0;
  float halfW;
  float d = clearingEdge(p, halfW);
  // Plants go right up to the edge and no further: a half-grown rim of them
  // would stand up on the dirt as stubble and blur the outline. (The soft rim
  // is the ground's, in clearingAt.)
  float inside = 1.0 - step(0.0, d);
  // In front of the near edge (nearer the camera, so larger z), within its
  // width: a plant s metres out may stand s times the camera's slope there.
  float nearZ = uClearZ + uClearHZ * uClearOpen;
  float s = p.y - nearZ;
  float slope = ${f(CAM.y)} / max(${f(CAM.z)} - nearZ, 0.1);
  float allowed = clamp(${f(REACH)} * s * slope / max(height, 0.01), 0.0, 1.0);
  float across = 1.0 - smoothstep(halfW, halfW + 0.12, abs(p.x));
  float front = (1.0 - allowed) * across * step(0.0, s);
  return max(inside, front);
}
`;
