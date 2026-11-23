import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CLOUD, CLOUD_DOTS, CLOUD_MIDDLE, CLOUD_ROOM } from "./cloudShape";

/**
 * A cloud: what the site's menus open as — a thought bubble.
 *
 * It is a hand drawing of one, traced (see cloudShape): the pen line exactly as
 * drawn, wobble and thick-and-thin and all, round a cream fill, with the three
 * rings that trail off it. Never stretched — always the drawing's own
 * proportions, scaled as a whole until what is in it fits the middle with a
 * clear margin inside the line. The rings come with it, scaled and placed as
 * in the drawing, so a menu is positioned by where the smallest ring is
 * (DOT_ANCHOR): that is the one that sits over what was pressed.
 *
 * With `dots`, it opens as a thought: the rings pop in, smallest first, then
 * the cloud. `pace` stretches that: 1 is quick, 2 takes twice as long.
 */

const BOX = CLOUD.box;

/** How much of the cloud a box of contents centred in it can take. */
function room(aspect: number) {
  const t = Math.min(1, Math.max(0, (aspect - 1.45) / 0.55));
  const { narrow, wide } = CLOUD_ROOM;
  return { w: narrow.w + (wide.w - narrow.w) * t, h: narrow.h + (wide.h - narrow.h) * t };
}

/** The rings, in the cloud's own units, smallest (nearest what was pressed) first. */
const RINGS = [...CLOUD_DOTS].reverse();
const BOTTOM = BOX.y + BOX.h;
/** How far below the cloud the rings reach, as a fraction of its height. */
const RINGS_BELOW = Math.max(...RINGS.map((r) => r.box.y + r.box.h)) / BOX.h - BOTTOM / BOX.h;
/** Where the smallest ring's middle is, as a fraction of the cloud's width. */
export const DOT_ANCHOR = (RINGS[0].box.x + RINGS[0].box.w / 2 - BOX.x) / BOX.w;

export default function Cloud({
  className = "",
  bodyClassName = "",
  style,
  dots,
  pace = 1,
  children,
}: {
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  /** Trail the rings down to the left (as drawn) or, mirrored, to the right. */
  dots?: "left" | "right";
  pace?: number;
  children: ReactNode;
}) {
  const body = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // Scaled, as a whole, until the contents fit the middle with a margin to
  // spare; the contents sit at the cloud's middle.
  let fit: { s: number; W: number; H: number; l: number; t: number } | null = null;
  if (size) {
    const r = room(size.w / Math.max(1, size.h));
    const s = Math.max(size.w / (r.w * BOX.w), size.h / (r.h * BOX.h));
    const W = BOX.w * s;
    const H = BOX.h * s;
    fit = { s, W, H, l: CLOUD_MIDDLE.x * W - size.w / 2, t: CLOUD_MIDDLE.y * H - size.h / 2 };
  }
  const mirror = dots === "right";
  const at = (i: number) => ({ animationDelay: `${0.05 * i * pace}s`, animationDuration: `${0.18 * pace}s` });

  return (
    // Spans, not divs, so a menu inside a paragraph can be one.
    <span
      className={`relative block w-max ${className}`}
      style={{ ...style, paddingBottom: dots && fit ? RINGS_BELOW * fit.H : undefined }}
    >
      <span
        className={`relative block ${dots ? "bubble-pop" : ""}`}
        style={{
          ...(dots ? { ...at(3), transformOrigin: `${mirror ? 100 - DOT_ANCHOR * 100 : DOT_ANCHOR * 100}% 100%` } : {}),
          padding: fit && size ? `${fit.t}px ${fit.W - size.w - fit.l}px ${fit.H - size.h - fit.t}px ${fit.l}px` : undefined,
        }}
      >
        {fit && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible"
            style={{ filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.32))" }}
            viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`}
            preserveAspectRatio="none"
          >
            <path d={CLOUD.fill} fill="var(--color-cloud)" />
            <path d={CLOUD.ink} fill="#141414" fillRule="evenodd" />
          </svg>
        )}
        <span ref={body} className={`relative block text-void ${bodyClassName}`}>
          {children}
        </span>
      </span>

      {/* The rings, under the cloud as in the drawing. */}
      {dots &&
        fit &&
        RINGS.map((r, i) => {
          const x = (r.box.x - BOX.x) * fit.s;
          const w = r.box.w * fit.s;
          return (
            <svg
              key={r.box.x}
              aria-hidden="true"
              className="bubble-pop pointer-events-none absolute overflow-visible"
              style={{
                ...at(i),
                left: mirror ? fit.W - x - w : x,
                top: (r.box.y - BOX.y) * fit.s,
                width: w,
                height: r.box.h * fit.s,
                transform: mirror ? "scaleX(-1)" : undefined,
                filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.3))",
              }}
              viewBox={`${r.box.x} ${r.box.y} ${r.box.w} ${r.box.h}`}
            >
              <path d={r.fill} fill="var(--color-cloud)" />
              <path d={r.ink} fill="#141414" fillRule="evenodd" />
            </svg>
          );
        })}
    </span>
  );
}
