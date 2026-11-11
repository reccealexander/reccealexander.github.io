import { createSwayGrid, type SwayGrid } from "./sway";

/**
 * The one sway grid.
 *
 * The cursor is pushing on the ground, not on a particular kind of plant, so
 * the grass and the fern understory have to be reading the same springs — two
 * grids stepped separately drift apart within a second of the first sweep, and
 * a meadow that carries both would show it as two canopies laying over out of
 * time with each other. It also outlives every field: changing biome rebuilds
 * what is planted, and a ring that was mid-flight when the reader chose is
 * still mid-flight afterwards.
 */
let grid: SwayGrid | null = null;

export function swayGrid(): SwayGrid {
  return (grid ??= createSwayGrid());
}
