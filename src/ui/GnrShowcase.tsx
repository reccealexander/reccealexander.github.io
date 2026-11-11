import { useRef } from "react";
import { clamp } from "@/lib/math";
import { useJourney } from "./useJourney";
import { ramp, StageChrome, station } from "./stage";

/**
 * Graphene nanoribbons, a beat further down the stem.
 *
 * The published project: modelled unit cells on the left, the band structure
 * DFT returns for them on the right, drawn k-point by k-point as you scroll
 * because that is the order the calculation actually produces it in. The edge
 * of the ribbon is picked out in ember, since the edge is the result — the
 * electronic properties depend on which way the sheet was cut.
 *
 * As with the first figure, the shapes are honest and the axis numbers are not
 * claimed: the caption underneath says so.
 */

// ---- the ribbon ------------------------------------------------------------
const R = 8.2; // hexagon radius
const H = R * Math.sin(Math.PI / 3); // half the flat-to-flat height
const DX = 1.5 * R; // column pitch
const COLS = 8;
const ROWS = 3;
const OX = 26;
const OY = 52;

/** Centre of the hex at column `i`, row `j`. Odd columns drop by one half-cell,
 *  which is what makes the two lattices share vertices instead of overlapping. */
const hexAt = (i: number, j: number) => ({
  x: OX + i * DX,
  y: OY + j * 2 * H + (i % 2) * H,
});

/** A vertex of a flat-top hexagon, by clock angle in degrees. */
function vertex(cx: number, cy: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
}

function lattice(): string {
  let d = "";
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const { x, y } = hexAt(i, j);
      for (let k = 0; k < 6; k++) {
        const v = vertex(x, y, k * 60);
        d += `${k ? " L " : " M "}${v.x.toFixed(1)} ${v.y.toFixed(1)}`;
      }
      d += " Z";
    }
  }
  return d.trim();
}

/**
 * One edge of the ribbon: the outermost row of rings, drawn whole.
 *
 * The first version traced the boundary polygon instead, which is the tidier
 * drawing and the wrong one — with alternate columns dropped by half a cell,
 * chaining "outer vertices" per column doubles back on itself and the edge
 * comes out as a scribble across the lattice. The edge rings *are* the edge
 * carbons, so stroking them says the same thing and cannot be wrong about the
 * geometry.
 */
function edgeRow(row: number): string {
  let d = "";
  for (let i = 0; i < COLS; i++) {
    const { x, y } = hexAt(i, row);
    for (let k = 0; k < 6; k++) {
      const v = vertex(x, y, k * 60);
      d += `${k ? " L " : " M "}${v.x.toFixed(1)} ${v.y.toFixed(1)}`;
    }
    d += " Z";
  }
  return d.trim();
}

const LATTICE = lattice();
const TOP_EDGE = edgeRow(0);
const BOTTOM_EDGE = edgeRow(ROWS - 1);

/** The cell that repeats: two columns of it, which is the period of the ribbon. */
const CELL = {
  x: hexAt(2, 0).x - R - 1.5,
  y: hexAt(0, 0).y - H - 4,
  w: 2 * DX,
  h: ROWS * 2 * H + H + 8,
};

// ---- the band structure ----------------------------------------------------
const BX0 = 200;
const BX1 = 306;
const BY0 = 26;
const BY1 = 112;
const BYM = (BY0 + BY1) / 2;
const EAMP = 38;
const bx = (k: number) => BX0 + k * (BX1 - BX0);
const by = (E: number) => BYM - E * EAMP;

/** Half the gap at Γ. The ribbon is semiconducting, which is the finding. */
const HALF_GAP = 0.17;

const band = (k: number, floor: number, width: number) =>
  floor + (width * (1 - Math.cos(Math.PI * k))) / 2;

const KPOINTS = 32;

/** A band, drawn as far as the calculation has got. */
function bandPath(upTo: number, floor: number, width: number, sign: number): string {
  const steps = 48;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const k = (i / steps) * upTo;
    d += `${i ? " L " : "M "}${bx(k).toFixed(1)} ${by(sign * band(k, floor, width)).toFixed(1)}`;
  }
  return d;
}

export default function GnrShowcase({ at, span }: { at: number; span: number }) {
  const box = useRef<HTMLDivElement>(null);
  const cell = useRef<SVGRectElement>(null);
  const edges = useRef<SVGGElement>(null);
  const conduction = useRef<SVGPathElement>(null);
  const valence = useRef<SVGPathElement>(null);
  const upper = useRef<SVGPathElement>(null);
  const lower = useRef<SVGPathElement>(null);
  const scan = useRef<SVGGElement>(null);
  const gap = useRef<SVGGElement>(null);
  const kOut = useRef<HTMLSpanElement>(null);
  const chip = useRef<HTMLSpanElement>(null);

  useJourney((c) => {
    const el = box.current;
    if (!el) return;
    const on = station(c, at, span);
    el.style.opacity = String(on);
    el.style.visibility = on < 0.01 ? "hidden" : "visible";
    if (on < 0.01) return;

    const p = clamp((c - (at - span * 0.44)) / (span * 0.88));

    // The cell is picked out first, then the edge it is cut along, and only
    // then does the calculation run — which is the order of the work.
    if (cell.current) cell.current.style.opacity = String(ramp(p, 0.06, 0.16));
    if (edges.current) edges.current.style.opacity = String(ramp(p, 0.16, 0.28));

    // Swept by ~0.62, so the gap it was run to measure gets marked while the
    // figure is still at full brightness rather than on its way off screen.
    const k = ramp(p, 0.2, 0.62);
    if (conduction.current) conduction.current.setAttribute("d", bandPath(k, HALF_GAP, 0.62, 1));
    if (valence.current) valence.current.setAttribute("d", bandPath(k, HALF_GAP, 0.62, -1));
    if (upper.current) {
      upper.current.setAttribute("d", bandPath(k, 0.58, 0.5, 1));
      upper.current.style.opacity = String(0.4 * ramp(p, 0.3, 0.5));
    }
    if (lower.current) {
      lower.current.setAttribute("d", bandPath(k, 0.58, 0.5, -1));
      lower.current.style.opacity = String(0.4 * ramp(p, 0.3, 0.5));
    }
    if (scan.current) {
      scan.current.style.transform = `translateX(${(bx(k) - bx(0)).toFixed(1)}px)`;
      scan.current.style.opacity = String(ramp(p, 0.2, 0.26) * (1 - ramp(p, 0.62, 0.68)));
    }
    if (gap.current) {
      const g = ramp(p, 0.64, 0.74);
      gap.current.style.opacity = String(g);
      gap.current.style.transform = `translateX(${((1 - g) * -5).toFixed(2)}px)`;
    }

    if (kOut.current) {
      kOut.current.textContent = String(Math.round(k * KPOINTS)).padStart(2, "0");
    }
    if (chip.current) {
      const s = ramp(p, 0.72, 0.82);
      chip.current.style.opacity = String(s);
      chip.current.style.transform = `translateY(${((1 - s) * 4).toFixed(2)}px)`;
    }
  });

  return (
    <div ref={box} className="w-full max-w-[36rem] opacity-0 will-change-transform">
      <p className="type-shadow mb-3 text-[0.62rem] font-medium uppercase tracking-[0.24em] text-ember">
        Project · 2024 · Published
      </p>
      <h3 className="display-shadow mb-3 font-display text-[clamp(1.4rem,2.6vw,2rem)] leading-[1.12] text-ink">
        A transistor channel three atoms wide.
      </h3>
      <p className="type-shadow mb-5 max-w-[46ch] text-[13px] leading-relaxed text-ink">
        Density functional theory over modelled graphene nanoribbon unit cells,
        measuring the band structure that decides whether the ribbon can switch —
        and how much of it depends on how the sheet was cut.
      </p>

      <div className="relative" aria-hidden="true">
        <StageChrome
          file="gnr_bands.in — density functional theory"
          meta="Γ → X · armchair edge"
          badge="DFT"
        >
          <div className="px-3 pb-2 pt-3 sm:px-4">
            {/* `fill="none"` on the root, inherited by every axis, ring and
                band. An SVG path with no fill fills black and closes itself to
                do it, so `M x V y H z` — one pair of axes — paints a black
                triangle over the plot. Elements that want a fill set theirs. */}
            <svg viewBox="0 0 320 130" className="w-full" fill="none">
              {/* ---- the modelled ribbon ---- */}
              <text x="14" y="18" className="fill-ink/45" fontSize="6">
                unit cell
              </text>
              <rect
                ref={cell}
                x={CELL.x}
                y={CELL.y}
                width={CELL.w}
                height={CELL.h}
                rx="2"
                className="fill-ember/10 stroke-ember"
                strokeWidth="0.7"
                strokeDasharray="2.5 2"
                opacity="0"
              />
              <path d={LATTICE} fill="none" className="stroke-ink/35" strokeWidth="0.7" />
              <g ref={edges} opacity="0">
                <path d={TOP_EDGE} fill="none" className="stroke-ember" strokeWidth="1.4" />
                <path d={BOTTOM_EDGE} fill="none" className="stroke-ember" strokeWidth="1.4" />
              </g>
              <text x="14" y="122" className="fill-ink/45" fontSize="6">
                edge carbons in ember
              </text>

              {/* ---- the band structure ---- */}
              <g stroke="currentColor" className="text-ink/25" strokeWidth="0.7">
                <path d={`M${BX0} ${BY0} V${BY1} H${BX1}`} />
              </g>
              <path
                d={`M${BX0} ${BYM} H${BX1}`}
                className="stroke-ink/30"
                strokeWidth="0.6"
                strokeDasharray="2 2.5"
              />
              <text x={BX0 - 4} y={BY0 + 8} textAnchor="end" className="fill-ink/40" fontSize="6">
                E
              </text>
              <text x={BX1 - 2} y={BYM - 3} textAnchor="end" className="fill-ink/40" fontSize="5.5">
                E_F
              </text>
              <text x={BX0} y={BY1 + 8} className="fill-ink/40" fontSize="6">
                Γ
              </text>
              <text x={BX1} y={BY1 + 8} textAnchor="end" className="fill-ink/40" fontSize="6">
                X
              </text>

              <g ref={scan} opacity="0">
                <path
                  d={`M${BX0} ${BY0} V${BY1}`}
                  className="stroke-bloom"
                  strokeWidth="0.7"
                  strokeDasharray="2 2"
                />
              </g>

              <path ref={upper} fill="none" className="stroke-ink/60" strokeWidth="0.9" opacity="0" />
              <path ref={lower} fill="none" className="stroke-ink/60" strokeWidth="0.9" opacity="0" />
              <path ref={conduction} fill="none" stroke="#F2C744" strokeWidth="1.5" />
              <path ref={valence} fill="none" stroke="#E4813F" strokeWidth="1.5" />

              {/* The gap the whole calculation was run to measure. */}
              <g ref={gap} opacity="0">
                <path
                  d={`M${BX0 + 9} ${by(HALF_GAP)} V${by(-HALF_GAP)}`}
                  className="stroke-bloom"
                  strokeWidth="0.8"
                />
                <path
                  d={`M${BX0 + 6.5} ${by(HALF_GAP) + 2.5} L${BX0 + 9} ${by(HALF_GAP)} L${BX0 + 11.5} ${by(HALF_GAP) + 2.5}
                      M${BX0 + 6.5} ${by(-HALF_GAP) - 2.5} L${BX0 + 9} ${by(-HALF_GAP)} L${BX0 + 11.5} ${by(-HALF_GAP) - 2.5}`}
                  fill="none"
                  className="stroke-bloom"
                  strokeWidth="0.8"
                />
                <text x={BX0 + 14} y={BYM + 2} className="fill-bloom" fontSize="6.5">
                  E_g
                </text>
              </g>
            </svg>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-1 pt-2 text-[9.5px] text-muted">
              <span>
                k-points&nbsp;
                <span ref={kOut} className="text-ink/80">00</span>
                &nbsp;/&nbsp;{KPOINTS}
              </span>
              <span>edge&nbsp;<span className="text-ink/80">armchair</span></span>
              <span
                ref={chip}
                className="rounded-full border border-bloom/40 bg-bloom/10 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.12em] text-bloom opacity-0"
              >
                Gap opens
              </span>
            </div>
          </div>
        </StageChrome>
      </div>

      <p className="type-shadow mt-3 text-[10.5px] leading-relaxed text-ink/60">
        Recce, A. (2024). <em>Evaluating graphene nanoribbons for miniaturization
        of field effect transistors: A density functional theory study.</em>{" "}
        Theoretical and Natural Science, 39, 50–59.
      </p>
    </div>
  );
}
