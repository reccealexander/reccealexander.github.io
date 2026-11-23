import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A cloud: used for the bowling alley's thought bubble and its way back.
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
  const body = useRef<HTMLDivElement>(null);
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
    <div className={`relative ${className}`} style={style}>
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
      <div ref={body} className={`relative text-void ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
