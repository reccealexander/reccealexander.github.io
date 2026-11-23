import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A cloud: what the site's menus open as — a thought bubble, the dots leading
 * up to it drawn by ThoughtDots below.
 *
 * The shape is a hand-drawn thought bubble, traced: six uneven lobes with a
 * notch where each meets the next, a cream fill and a dark pen line round it.
 * It is never stretched — always the same proportions, scaled as a whole until
 * what is in it fits the safe middle of it, which keeps the lobes round and the
 * contents clear of the notches. The cloud's own box is the whole drawing, so
 * a menu is placed by what is seen.
 */

/** The traced outline, in its own units. */
const PATH =
  "M96,84 C110,10 240,-20 271,70 C360,40 490,130 365,198 C420,270 320,360 248,276 " +
  "C225,350 110,350 88,263 C10,290 -35,180 43,148 C5,110 40,45 96,84 Z";
const VIEW = { x: 2.4, y: 14.4, w: 414.3, h: 315.6 };
/** Its middle by area, as fractions of its width and height: where the
    contents go, so they sit in the body of the cloud. */
const MIDDLE = { x: 0.51, y: 0.52 };
/**
 * How much of its width and height a box centred there can take and still
 * keep a comfortable margin from the line all round — measured off the outline
 * for a box half again as wide as tall, and one twice as wide, and eased
 * between (a wider box can be a little wider, though no taller).
 */
function room(aspect: number) {
  const t = Math.min(1, Math.max(0, (aspect - 1.45) / 0.55));
  return { w: 0.525 + 0.16 * t, h: 0.475 - 0.024 * t };
}

export default function Cloud({
  className = "",
  bodyClassName = "",
  style,
  opacity = 1,
  children,
}: {
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  opacity?: number;
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

  // Scaled, as a whole, until the contents fit the roomy middle with a margin
  // to spare; the contents sit at the cloud's middle.
  let pad: { l: number; r: number; t: number; b: number } | null = null;
  if (size) {
    const fit = room(size.w / Math.max(1, size.h));
    const s = Math.max(size.w / (fit.w * VIEW.w), size.h / (fit.h * VIEW.h));
    const W = VIEW.w * s;
    const H = VIEW.h * s;
    const l = MIDDLE.x * W - size.w / 2;
    const t = MIDDLE.y * H - size.h / 2;
    pad = { l, t, r: W - size.w - l, b: H - size.h - t };
  }

  return (
    // Spans, not divs, so a menu inside a paragraph can be one.
    <span
      className={`relative block w-max ${className}`}
      style={{ ...style, padding: pad ? `${pad.t}px ${pad.r}px ${pad.b}px ${pad.l}px` : undefined }}
    >
      {pad && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible"
          style={{ filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.32))" }}
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          preserveAspectRatio="none"
        >
          <path
            d={PATH}
            fill="var(--color-cloud)"
            fillOpacity={opacity}
            stroke="#141414"
            strokeWidth={2.6}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <span ref={body} className={`relative block text-void ${bodyClassName}`}>
        {children}
      </span>
    </span>
  );
}

/**
 * The three dots a thought bubble trails back to where it came from, small to
 * large on the way up, popping in one after the other before the cloud itself
 * (give the cloud `bubble-pop` with `thoughtTiming(pace)`). Placed by the
 * caller, with the cloud's bottom about 2.6rem above where they start; `flip`
 * runs them up to the left rather than the right. `pace` stretches the whole
 * sequence: 1 is quick, 2 takes twice as long.
 */
export const THOUGHT_DELAY = "0.15s";

/** Style for the cloud at the end of a thought bubble, at the given pace. */
export const thoughtTiming = (pace = 1) => ({
  animationDelay: `${0.15 * pace}s`,
  animationDuration: `${0.18 * pace}s`,
});

const DOTS = [
  { size: 7, x: 0, y: 0 },
  { size: 11, x: 8, y: 10 },
  { size: 16, x: 19, y: 24 },
];

export function ThoughtDots({
  className = "",
  flip = false,
  pace = 1,
}: {
  className?: string;
  flip?: boolean;
  pace?: number;
}) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute h-10 w-[35px] ${className}`}>
      {DOTS.map((d, i) => (
        <span
          key={d.size}
          className="bubble-pop absolute rounded-full border-2 border-[#141414] bg-cloud shadow-[0_3px_8px_rgba(0,0,0,0.3)]"
          style={{
            width: d.size,
            height: d.size,
            bottom: d.y,
            [flip ? "right" : "left"]: d.x,
            animationDelay: `${0.05 * i * pace}s`,
            animationDuration: `${0.18 * pace}s`,
          }}
        />
      ))}
    </span>
  );
}
