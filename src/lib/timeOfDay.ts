import { useSyncExternalStore } from "react";
import { Color } from "three";

/**
 * The time of day the field is shown at.
 *
 * Morning is what the scene was built in. Sunset and evening are laid over it
 * rather than built again: one number, `daylight.value`, runs 0 (morning) to 1
 * (sunset) to 2 (evening), eased toward wherever the reader last chose, and
 * everything that answers the time of day reads it once a frame — the grade in
 * three/TimeGrade.ts, the glow on the flowers, the fireflies, the drifting
 * petals that the fireflies replace.
 *
 * A module-level store rather than React context for the same reason as the
 * growth clock: the materials want a float in their frame loop, not a
 * re-render, and the picker is the only thing that needs to re-render on it.
 */
export type TimeOfDay = "morning" | "sunset" | "evening";

export const TIMES: readonly { id: TimeOfDay; label: string; at: number }[] = [
  { id: "morning", label: "Morning", at: 0 },
  { id: "sunset", label: "Sunset", at: 1 },
  { id: "evening", label: "Evening", at: 2 },
];

export const daylight = { value: 0, target: 0 };

let current: TimeOfDay = "morning";
const listeners = new Set<() => void>();

export function setTimeOfDay(id: TimeOfDay) {
  if (id === current) return;
  current = id;
  daylight.target = TIMES.find((t) => t.id === id)?.at ?? 0;
  listeners.forEach((l) => l());
}

export function useTimeOfDay(): TimeOfDay {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** Ease toward the chosen time. Called once a frame, by the grade. */
export function stepDaylight(dt: number, calm: boolean) {
  if (calm) {
    daylight.value = daylight.target;
    return;
  }
  // About a second and a half to cross a step: long enough to watch the light
  // change, short enough that the choice feels answered.
  daylight.value += (daylight.target - daylight.value) * (1 - Math.exp(-dt * 2.6));
  if (Math.abs(daylight.target - daylight.value) < 1e-4) daylight.value = daylight.target;
}

const ramp = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far into the evening: 0 until past sunset, 1 at full dark. What the
    flower glow and the fireflies key off. */
export function nightness(): number {
  return ramp(1.15, 2, daylight.value);
}

/*
 * The highlights on the grass, by time of day.
 *
 * The grade shifts the whole frame, but on its own it only tints the morning's
 * lime-green sunlight; a low sun does not light grass lime, and the moon does
 * not light it at all the way the sun does. So the colours the field paints
 * its light in change too: the pool, the blade faces standing square into it
 * and the hottest tips go gold and amber at sunset and silver-blue by
 * moonlight, and the lit tips outside the pool lean copper, then cold. The
 * sunset ones are pitched a little short, because the grade warms them again
 * on top.
 */
const HIGHLIGHT = {
  warm: ["#a4cd2e", "#cfae3e", "#6f8fa8"],
  face: ["#c8dc60", "#e8c25a", "#9fb8cc"],
  hot: ["#eef2c4", "#fbe7b0", "#e2ecf6"],
} as const;
const HIGHLIGHT_C = Object.fromEntries(
  Object.entries(HIGHLIGHT).map(([k, v]) => [k, v.map((h) => new Color(h))]),
) as Record<keyof typeof HIGHLIGHT, Color[]>;
const TIP_TOWARD = [null, new Color("#c98b3a"), new Color("#7f9bb0")] as const;
const TIP_SHARE = [0, 0.5, 0.55];

function between(stops: readonly Color[], out: Color): Color {
  const v = Math.min(2, Math.max(0, daylight.value));
  const i = Math.min(1, Math.floor(v));
  return out.lerpColors(stops[i], stops[i + 1], v - i);
}

/** One of the sunlight colours, for the light the field is in now. */
export function highlight(key: keyof typeof HIGHLIGHT, out: Color): Color {
  return between(HIGHLIGHT_C[key], out);
}

const _a = new Color();
const _b = new Color();
/** A biome's lit-tip colour, leaned toward the light the field is in now. */
export function litTip(base: Color, out: Color): Color {
  const v = Math.min(2, Math.max(0, daylight.value));
  const i = Math.min(1, Math.floor(v));
  const at = (k: number, c: Color) => (k === 0 ? c.copy(base) : c.copy(base).lerp(TIP_TOWARD[k]!, TIP_SHARE[k]));
  return out.lerpColors(at(i, _a), at(i + 1, _b), v - i);
}
