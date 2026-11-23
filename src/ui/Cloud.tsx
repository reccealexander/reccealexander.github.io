import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A cloud: what the site's menus open as — a thought bubble, the dots leading
 * up to it drawn by ThoughtDots below.
 *
 * Drawn as one shape — a rounded body the size of what is in it, and a ring
 * of puffs all the way round its edge, of a few different sizes — so it reads
 * as a cloud from any side rather than a box with bumps on it. The puffs are
 * laid out from the body's measured size, so they stay round however wide or
 * tall it is, and they stand out past it, which keeps whatever is written
 * inside clear of the scalloped edge. It is filled as one group, so it can be
 * a little see-through without the overlaps showing as seams.
 */

/** Even but not regular: the same cloud every time, never a cog. */
const jitter = (i: number) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};

/** A point `d` of the way round a rounded rectangle w×h (corner radius c),
    clockwise from the top-left end of its top edge. */
function around(d: number, w: number, h: number, c: number) {
  const sx = w - 2 * c;
  const sy = h - 2 * c;
  const q = (Math.PI / 2) * c;
  const legs = [sx, q, sy, q, sx, q, sy, q];
  let i = 0;
  while (i < 7 && d > legs[i]) d -= legs[i++];
  const corner = (cx: number, cy: number, from: number) => {
    const t = from + (c > 0 ? d / c : 0);
    return { x: cx + c * Math.cos(t), y: cy + c * Math.sin(t) };
  };
  switch (i) {
    case 0: return { x: c + d, y: 0 };
    case 1: return corner(w - c, c, -Math.PI / 2);
    case 2: return { x: w, y: c + d };
    case 3: return corner(w - c, h - c, 0);
    case 4: return { x: w - c - d, y: h };
    case 5: return corner(c, h - c, Math.PI / 2);
    case 6: return { x: 0, y: h - c - d };
    default: return corner(c, c, Math.PI);
  }
}

function puffs(w: number, h: number, scale: number) {
  // The puff size follows the cloud's height, within reason.
  const r = Math.min(Math.max(h * 0.4, 11), 34) * scale;
  // Centred on the body's edge, evenly by distance round it — so there are
  // as many along a long side as its length calls for, and no flat gaps.
  const c = Math.min(r, w / 2, h / 2);
  const length = 2 * (w - 2 * c) + 2 * (h - 2 * c) + 2 * Math.PI * c;
  const n = Math.max(6, Math.round(length / (r * 1.15)));
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = around(((i + 0.3) / n) * length, w, h, c);
    out.push({ ...p, r: r * (0.84 + 0.32 * jitter(i)) });
  }
  return { r, out };
}

export default function Cloud({
  className = "",
  bodyClassName = "",
  style,
  puff = 1,
  opacity = 0.88,
  children,
}: {
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  /** Bigger or smaller puffs than the default for the cloud's size. */
  puff?: number;
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

  const shape = size && puffs(size.w, size.h, puff);
  const m = shape ? shape.r * 1.3 + 2 : 0;

  return (
    // Spans, not divs, so a menu inside a paragraph can be one.
    <span className={`relative block ${className}`} style={style}>
      {size && shape && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: -m,
            top: -m,
            width: size.w + 2 * m,
            height: size.h + 2 * m,
            filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.35))",
          }}
          viewBox={`${-m} ${-m} ${size.w + 2 * m} ${size.h + 2 * m}`}
        >
          <g fill="var(--color-cloud)" opacity={opacity}>
            <rect width={size.w} height={size.h} rx={Math.min(shape.r, size.w / 2, size.h / 2)} />
            {shape.out.map((p, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <circle key={i} cx={p.x} cy={p.y} r={p.r} />
            ))}
          </g>
        </svg>
      )}
      <span ref={body} className={`relative block text-void ${bodyClassName}`}>
        {children}
      </span>
    </span>
  );
}

/**
 * The two little dots a thought bubble trails back to where it came from,
 * popping in one after the other before the cloud itself (give the cloud
 * `bubble-pop` with `thoughtTiming(pace)`). Placed by the caller; `flip` runs
 * them up and to the left rather than to the right. `pace` stretches the whole
 * sequence: 1 is quick, 2 takes twice as long.
 */
export const THOUGHT_DELAY = "0.11s";

/** Style for the cloud at the end of a thought bubble, at the given pace. */
export const thoughtTiming = (pace = 1) => ({
  animationDelay: `${0.11 * pace}s`,
  animationDuration: `${0.18 * pace}s`,
});

export function ThoughtDots({
  className = "",
  flip = false,
  pace = 1,
}: {
  className?: string;
  flip?: boolean;
  pace?: number;
}) {
  const dot = "bubble-pop absolute rounded-full bg-cloud shadow-[0_3px_8px_rgba(0,0,0,0.3)]";
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute h-6 w-5 ${className}`}>
      <span
        className={`${dot} bottom-0 h-[6px] w-[6px] ${flip ? "right-0" : "left-0"}`}
        style={{ animationDuration: `${0.18 * pace}s` }}
      />
      <span
        className={`${dot} bottom-[9px] h-[10px] w-[10px] ${flip ? "right-[7px]" : "left-[7px]"}`}
        style={{ animationDelay: `${0.055 * pace}s`, animationDuration: `${0.18 * pace}s` }}
      />
    </span>
  );
}
