import { damp } from "./math";

/**
 * Which leaf the cursor is on, and how far each of them has answered.
 *
 * A module-level store rather than React state, for the same reason lib/scroll
 * is one: this is read inside useFrame every frame by the scene and inside the
 * journey callback every frame by the document, and a hover that re-rendered
 * the tree would cost more than the frame it is trying to drive.
 *
 * The *damped* value is the part that matters. Both halves of a leaf's label —
 * the blade in the canvas and the type laid on it in the DOM — have to move by
 * exactly the same amount or the type slides off the leaf it is written on, so
 * neither owns the animation. The scene advances `amount` once a frame and both
 * read it: lib/flowerLayout folds it into the leaf's rotation, which is where
 * the mesh gets its attitude and where the label's basis is projected from.
 */

export const leafHover = {
  /** The leaf under the cursor, or -1. */
  index: -1,
  /** 0→1 per leaf, damped. Written by three/Flower, read by both sides. */
  amount: [0, 0, 0, 0],
};

/** How far a hovered leaf tips up toward the reader, in radians. */
export const HOVER_LIFT = 0.11;

export function setLeafHover(index: number, on: boolean) {
  if (on) leafHover.index = index;
  else if (leafHover.index === index) leafHover.index = -1;
}

/** Advances one leaf's damped hover. Called once a frame, from the scene. */
export function stepLeafHover(index: number, dt: number): number {
  // A backgrounded tab hands back one enormous delta on its first frame, which
  // unclamped would snap every leaf to its target in a single step.
  const step = Math.min(dt, 0.05);
  const want = leafHover.index === index ? 1 : 0;
  const next = damp(leafHover.amount[index], want, 9, step);
  leafHover.amount[index] = Math.abs(next - want) < 0.002 ? want : next;
  return leafHover.amount[index];
}
