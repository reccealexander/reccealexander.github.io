import { useRef } from "react";
import { clamp } from "@/lib/math";
import { useJourney } from "./useJourney";
import { ramp, StageChrome, station } from "./stage";

/**
 * Burgers' equation, on the way down the stem.
 *
 * The first of the two projects, drawn rather than described: an approximation
 * that starts in the wrong place with the wrong shape, and a cost function that
 * walks it onto the exact solution. It is a schematic of the method — the
 * shapes are the real ones (a steepening front, linear convergence on a log
 * cost axis), the numbers on them are illustrative, and the figure says so
 * underneath.
 *
 * The whole thing is a function of the chapter, like everything else on this
 * page: the reader scrubs the descent with the scroll, which is also the point
 * — assimilation is iterative, and an iteration you can run backwards is the
 * one place a scroll-driven figure beats a still.
 */

// ---- the main plot ---------------------------------------------------------
const X0 = 30;
const X1 = 206;
const YMID = 69;
const YAMP = 45;
const px = (x: number) => X0 + x * (X1 - X0);
const py = (u: number) => YMID - u * YAMP;

/** The solution being chased: a front that has already steepened into a shock. */
const EXACT = { pos: 0.54, sharp: 15, amp: 0.82 };
/** Where the first iterate sits: too shallow, too smooth, too far left. */
const GUESS = { pos: 0.3, sharp: 3.2, amp: 0.5 };

const SAMPLES = 121;

/**
 * u(x) for one iterate, as a path.
 *
 * The wiggle is what makes an early iterate look like an iterate rather than a
 * smaller copy of the answer: assimilation puts high-frequency error in before
 * it takes it out. It is windowed by sin(πx) so the boundaries stay pinned.
 */
function profile(pos: number, sharp: number, amp: number, wiggle: number): string {
  let d = "";
  for (let i = 0; i < SAMPLES; i++) {
    const x = i / (SAMPLES - 1);
    const u =
      amp * Math.tanh((pos - x) * sharp) +
      wiggle * Math.sin(x * Math.PI * 7) * Math.sin(Math.PI * x);
    d += `${i ? " L " : "M "}${px(x).toFixed(1)} ${py(u).toFixed(1)}`;
  }
  return d;
}

const EXACT_PATH = profile(EXACT.pos, EXACT.sharp, EXACT.amp, 0);

// ---- the cost inset --------------------------------------------------------
const CX0 = 246;
const CX1 = 310;
const CY0 = 34;
const CY1 = 104;
/** Decades of cost the inset's vertical axis covers. */
const DECADES = 3.6;

/** log10(J/J₀) after a fraction `e` of the descent. Linear convergence, curved
 *  slightly at the start where the step is still finding the valley. */
const logCost = (e: number) => -3.3 * Math.pow(e, 1.12);
const cx = (e: number) => CX0 + e * (CX1 - CX0);
const cy = (e: number) => CY0 + clamp(-logCost(e) / DECADES) * (CY1 - CY0);

function costPath(upTo: number): string {
  const steps = 40;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const e = (i / steps) * upTo;
    d += `${i ? " L " : "M "}${cx(e).toFixed(1)} ${cy(e).toFixed(1)}`;
  }
  return d;
}

const COST_FULL = costPath(1);

const ITERATIONS = 120;
const EMBER = [228, 129, 63] as const;
const BLOOM = [242, 199, 68] as const;

export default function BurgersShowcase({ at, span }: { at: number; span: number }) {
  const box = useRef<HTMLDivElement>(null);
  const guess = useRef<SVGPathElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const walked = useRef<SVGPathElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const sweep = useRef<SVGGElement>(null);
  const iterOut = useRef<HTMLSpanElement>(null);
  const costOut = useRef<HTMLSpanElement>(null);
  const converged = useRef<HTMLSpanElement>(null);

  useJourney((c) => {
    const el = box.current;
    if (!el) return;
    const on = station(c, at, span);
    el.style.opacity = String(on);
    el.style.visibility = on < 0.01 ? "hidden" : "visible";
    if (on < 0.01) return;

    // Local progress through the beat, over the stretch where the block is
    // actually on screen. Outside it nothing is being watched.
    const p = clamp((c - (at - span * 0.44)) / (span * 0.88));
    // Finished by ~0.76, not by 0.9. `station` starts pulling this block down
    // shortly after that, so a descent that only converges at the end of its
    // own progress hands the reader the result and the exit at once.
    const e = ramp(p, 0.1, 0.76);

    const pos = GUESS.pos + (EXACT.pos - GUESS.pos) * e;
    const sharp = GUESS.sharp + (EXACT.sharp - GUESS.sharp) * Math.pow(e, 1.6);
    const amp = GUESS.amp + (EXACT.amp - GUESS.amp) * e;
    const wiggle = 0.15 * Math.pow(1 - e, 1.5);

    if (guess.current) {
      guess.current.setAttribute("d", profile(pos, sharp, amp, wiggle));
      const rgb = EMBER.map((v, i) => Math.round(v + (BLOOM[i] - v) * e));
      guess.current.style.stroke = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
    // One earlier iterate left behind, so the descent has a direction on screen
    // rather than just a current position.
    if (trail.current) {
      const b = clamp(e - 0.34);
      trail.current.setAttribute(
        "d",
        profile(
          GUESS.pos + (EXACT.pos - GUESS.pos) * b,
          GUESS.sharp + (EXACT.sharp - GUESS.sharp) * Math.pow(b, 1.6),
          GUESS.amp + (EXACT.amp - GUESS.amp) * b,
          0.15 * Math.pow(1 - b, 1.5),
        ),
      );
      trail.current.style.opacity = String(0.3 * ramp(p, 0.3, 0.42) * (1 - e * 0.5));
    }

    if (walked.current) walked.current.setAttribute("d", costPath(Math.max(e, 0.001)));
    if (dot.current) {
      dot.current.setAttribute("cx", cx(e).toFixed(1));
      dot.current.setAttribute("cy", cy(e).toFixed(1));
    }
    if (sweep.current) {
      sweep.current.style.transform = `translateX(${(px(pos) - px(EXACT.pos)).toFixed(1)}px)`;
      sweep.current.style.opacity = String(0.55 * (1 - ramp(p, 0.72, 0.84)));
    }

    if (iterOut.current) {
      iterOut.current.textContent = String(Math.round(e * ITERATIONS)).padStart(3, "0");
    }
    if (costOut.current) {
      costOut.current.textContent = Math.pow(10, logCost(e)).toExponential(1);
    }
    if (converged.current) {
      const k = ramp(p, 0.78, 0.87);
      converged.current.style.opacity = String(k);
      converged.current.style.transform = `translateY(${((1 - k) * 4).toFixed(2)}px)`;
    }
  });

  return (
    <div ref={box} className="w-full max-w-[36rem] opacity-0 will-change-transform">
      <p className="type-shadow mb-3 text-[0.62rem] font-medium uppercase tracking-[0.24em] text-ember">
        Project · 2025
      </p>
      <h3 className="display-shadow mb-3 font-display text-[clamp(1.4rem,2.6vw,2rem)] leading-[1.12] text-ink">
        Pulling an approximation back onto the truth.
      </h3>
      <p className="type-shadow mb-5 max-w-[46ch] text-[13px] leading-relaxed text-ink">
        Burgers&apos; equation has no closed form to check against here. Adjoint
        data assimilation runs gradient descent on the cost between the numerical
        and exact solutions, and the iterate walks onto the shock.
      </p>

      <div className="relative" aria-hidden="true">
        <StageChrome
          file="burgers_adjoint.py — data assimilation"
          meta="u_t + u·u_x = ν·u_xx"
          badge="Adjoint"
        >
          <div className="px-3 pb-2 pt-3 sm:px-4">
            {/* `fill="none"` on the root, inherited by every axis and band.
                An SVG path with no fill fills black and closes itself to do
                it, so `M x V y H z` — two axes — paints a black triangle
                under the plot. Elements that want a fill set their own. */}
            <svg viewBox="0 0 320 130" className="w-full" fill="none">
              {/* ---- the solution plot ---- */}
              <g stroke="currentColor" className="text-ink/25" strokeWidth="0.7">
                <path d={`M${X0} 20 V118 M${X0} ${YMID} H${X1}`} />
              </g>
              <g className="text-ink/10" stroke="currentColor" strokeWidth="0.5">
                <path
                  d={`M${X0} ${py(0.82)} H${X1} M${X0} ${py(-0.82)} H${X1}`}
                  strokeDasharray="2 3"
                />
              </g>
              <text x={X0 - 6} y={py(0.82) + 3} textAnchor="end" className="fill-ink/40" fontSize="6">
                u
              </text>
              <text x={X1} y="126" textAnchor="end" className="fill-ink/40" fontSize="6">
                x
              </text>

              {/* Where the front currently sits, so the horizontal error is
                  visible as a distance and not only as a shape. */}
              <g ref={sweep}>
                <path
                  d={`M${px(EXACT.pos)} 22 V116`}
                  className="stroke-ember"
                  strokeWidth="0.7"
                  strokeDasharray="2 2.5"
                />
              </g>

              <path
                d={EXACT_PATH}
                fill="none"
                className="stroke-ink/45"
                strokeWidth="1.1"
                strokeDasharray="3 2.5"
              />
              <path ref={trail} fill="none" stroke="#E4813F" strokeWidth="1" opacity="0" />
              <path
                ref={guess}
                d={profile(GUESS.pos, GUESS.sharp, GUESS.amp, 0.15)}
                fill="none"
                stroke="#E4813F"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />

              <g fontSize="6" className="fill-ink/45">
                <path
                  d={`M${X0 + 4} 24 h7`}
                  className="stroke-ink/45"
                  strokeWidth="1.1"
                  strokeDasharray="3 2.5"
                />
                <text x={X0 + 14} y="26">exact</text>
                <path d={`M${X0 + 44} 24 h7`} stroke="#F2C744" strokeWidth="1.6" />
                <text x={X0 + 58} y="26">assimilated</text>
              </g>

              {/* ---- the cost inset ---- */}
              <text x={CX0} y={CY0 - 12} className="fill-ink/45" fontSize="6">
                cost J / J₀
              </text>
              <g stroke="currentColor" className="text-ink/25" strokeWidth="0.7">
                <path d={`M${CX0} ${CY0 - 6} V${CY1} H${CX1}`} />
              </g>
              <g className="text-ink/12" stroke="currentColor" strokeWidth="0.5">
                <path
                  d={`M${CX0} ${cy(0.28)} H${CX1} M${CX0} ${cy(0.56)} H${CX1} M${CX0} ${cy(0.84)} H${CX1}`}
                  strokeDasharray="1.5 2.5"
                />
              </g>
              <path
                d={COST_FULL}
                fill="none"
                className="stroke-ink/25"
                strokeWidth="0.8"
                strokeDasharray="2 2"
              />
              <path ref={walked} fill="none" stroke="#F2C744" strokeWidth="1.4" />
              <circle ref={dot} r="2" fill="#F2C744" cx={CX0} cy={CY0} />
              <text x={CX1} y={CY1 + 8} textAnchor="end" className="fill-ink/40" fontSize="6">
                iteration
              </text>
            </svg>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-1 pt-2 text-[9.5px] text-muted">
              <span>
                iteration&nbsp;
                <span ref={iterOut} className="text-ink/80">000</span>
                &nbsp;/&nbsp;{ITERATIONS}
              </span>
              <span>
                J / J₀&nbsp;
                <span ref={costOut} className="text-ink/80">1.0e+0</span>
              </span>
              <span
                ref={converged}
                className="rounded-full border border-bloom/40 bg-bloom/10 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.12em] text-bloom opacity-0"
              >
                Converged
              </span>
            </div>
          </div>
        </StageChrome>
      </div>

      <p className="type-shadow mt-3 text-[10.5px] leading-relaxed text-ink/60">
        Schematic of the method; the shapes are the real ones, the numbers on
        them are illustrative.
      </p>
    </div>
  );
}
