/**
 * One measurement, taken once, that everything expensive keys off. Deciding
 * per-frame would mean a scene that visibly changes its mind halfway down the
 * page; deciding never means a phone rendering forty-six thousand blades.
 */
export type Quality = "low" | "medium" | "high";

function detect(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 640;
  if (coarse || small || cores <= 4 || mem <= 4) return "low";
  if (cores >= 8 && mem >= 8) return "high";
  return "medium";
}

let cached: Quality | null = null;

export function quality(): Quality {
  if (cached === null) cached = detect();
  return cached;
}

/**
 * Clumps, not blades — each one puts three or four blades in the field, so the
 * blade count is roughly three and a half times these.
 *
 * A fifth again more than they were. The three acts spent down among the plants
 * frame two thirds of a metre of ground and want it full, and the field is
 * planted at one density across the whole disc — which is the right rule, and
 * means the only way to fill the near ground is to fill all of it. The fifth is
 * what the frame at chapter 3.5 needed; it is also a fifth more triangles
 * everywhere, which is the whole of what it costs.
 */
export const CLUMPS: Record<Quality, number> = {
  low: 6200,
  medium: 15000,
  high: 27500,
};

export const MOTES: Record<Quality, number> = {
  low: 220,
  medium: 500,
  high: 900,
};

export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
