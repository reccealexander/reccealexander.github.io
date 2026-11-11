import { type CSSProperties, type ReactNode } from "react";
import { clamp } from "@/lib/math";
import { stationGlow } from "@/lib/journey";

/**
 * A figure, drawn in the page.
 *
 * The two projects on the stem are the same window twice — a title bar, a
 * caption line and a pill naming the method — so the chrome lives here.
 *
 * `pane` rather than an opaque panel, because nothing between the hero and the
 * footer may paint a background — but tinted harder than a copy card is. A
 * ten-pixel axis label over a field of grass is not a plot, it is a smudge;
 * ninety per cent is the same tint every card on this site already takes on a
 * phone, for the same reason.
 */
export function StageChrome({
  file,
  meta,
  badge,
  children,
}: {
  file: string;
  meta: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <div
      className="pane overflow-hidden rounded-xl shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)]"
      style={{ "--pane-tint": "90%" } as CSSProperties}
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
          <span className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
          <span className="h-2 w-2 rounded-full bg-[#28C840]" />
        </span>
        <span className="truncate text-[11px] text-muted">{file}</span>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-1.5">
        {/* Deliberately not `uppercase`: this line carries equations, and
            CSS text-transform does not know that the ν in u_t + u·u_x = ν·u_xx
            is a different letter from an N. */}
        <span className="truncate text-[10px] tracking-[0.14em] text-muted">{meta}</span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-ember/15 px-2 py-1 text-[10px] font-medium text-ember">
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M6 0.8 L7.1 4.3 L10.6 5.4 L7.1 6.5 L6 10 L4.9 6.5 L1.4 5.4 L4.9 4.3 Z"
              fill="currentColor"
            />
          </svg>
          {badge}
        </span>
      </div>

      {children}
    </div>
  );
}

/**
 * How lit a station is, given its own length.
 *
 * The same shape the step cards use, written as fractions of the block rather
 * than in absolute chapters: a Gaussian has no end, and at close spacing the
 * tails of two neighbours meet at a third opacity each, so there is a hard edge
 * on it just past the halfway point to the next station. Expressed this way,
 * lengthening an act moves the window with it instead of putting two beats on
 * screen at once.
 */
export function station(c: number, at: number, span: number): number {
  const near = 1 - clamp((Math.abs(c - at) - span * 0.41) / (span * 0.085));
  return clamp(stationGlow(c, at, span * 0.38) * 2) * near;
}

/** Smoothly 0→1 as `p` crosses [a, b]. */
export function ramp(p: number, a: number, b: number): number {
  const t = clamp((p - a) / (b - a));
  return t * t * (3 - 2 * t);
}
