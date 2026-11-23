import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import { navigate, onNavigate } from "@/lib/router";
import Cloud from "@/ui/Cloud";
import { markBowlingReady, resetBowlingReady } from "@/lib/bowlingTransition";
import Alley from "./Alley";
import {
  cursor,
  game,
  newGame,
  setDrag,
  setSpin,
  snapshot,
  subscribe,
  throwBall,
  toggleSpinMode,
} from "./game";
import { position, score } from "./physics";

/** How far a drag has to go, in pixels, for full spin. */
const FULL_SPIN_PX = 220;

const useGame = () => useSyncExternalStore(subscribe, snapshot, snapshot);
const useTouch = () => useState(() => window.matchMedia("(pointer: coarse)").matches)[0];

/**
 * Groundhog bowling: ten groundhogs racked as pins at the end of a lane.
 *
 * Point to aim, click to bowl. Hold shift and drag sideways to put spin on it —
 * the drag draws an arc, and the dotted line on the lane bends to show where
 * the hook will take it.
 */
export default function BowlingPage() {
  useGame();
  const touch = useTouch();

  useEffect(() => {
    const previous = document.title;
    document.title = "Groundhog bowling · Alexander Recce";
    window.scrollTo({ top: 0, behavior: "instant" });
    return () => {
      resetBowlingReady();
      document.title = previous;
    };
  }, []);

  // Keys: space bowls, escape goes home.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/");
      if (e.key === " " && !(e.target as HTMLElement).closest?.("button, a")) {
        e.preventDefault();
        if (game.phase === "over") newGame();
        else throwBall();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /*
   * The pointer. A press with shift held (or with spin mode on, for a touch
   * screen) starts drawing the arc, and the spin follows how far sideways it
   * has been dragged; anything else bowls when it is let go.
   */
  const press = useRef<"spin" | "throw" | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    track(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.shiftKey || game.spinMode) {
      press.current = "spin";
      setDrag({ x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      setSpin(0);
    } else {
      press.current = "throw";
    }
  };
  const onMove = (e: React.PointerEvent) => {
    track(e);
    const d = game.drag;
    if (press.current === "spin" && d) {
      setDrag({ ...d, x: e.clientX, y: e.clientY });
      setSpin((e.clientX - d.x0) / FULL_SPIN_PX);
    }
  };
  const onUp = () => {
    if (press.current === "spin") setDrag(null);
    else if (press.current === "throw") {
      if (game.phase === "over") newGame();
      else throwBall();
    }
    press.current = null;
  };
  const track = (e: React.PointerEvent) => {
    cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
    cursor.y = -((e.clientY / window.innerHeight) * 2 - 1);
    cursor.active = true;
  };

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-void">
      <div
        className="absolute inset-0 touch-none"
        style={{ cursor: game.drag ? "ew-resize" : game.phase === "aim" ? "crosshair" : "default" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
        }}
        onPointerLeave={() => {
          if (!press.current) cursor.active = false;
        }}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 29, near: 0.05, far: 60, position: [0, 1.15, 2.4] }}
          gl={{ antialias: true }}
          // Two frames after the canvas is up the alley has compiled and drawn,
          // and the groundhog covering it can get out of the way.
          onCreated={() => requestAnimationFrame(() => requestAnimationFrame(markBowlingReady))}
        >
          <Alley />
        </Canvas>
      </div>

      <DragArc />

      <a
        href="/"
        onClick={onNavigate("/")}
        className="group fixed left-8 top-8 z-30 transition-transform duration-300 hover:-translate-x-0.5 sm:left-11 sm:top-11"
      >
        <Cloud bodyClassName="inline-flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
          <span aria-hidden="true">←</span>
          Back
        </Cloud>
      </a>

      <Scoreboard />
      <Message />
      <Hint />

      <div className="pointer-events-none fixed inset-x-5 bottom-5 z-20 flex flex-col items-start gap-3 sm:inset-x-8 sm:bottom-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="pointer-events-auto flex items-end gap-3">
          <PinDiagram />
          {touch && <SpinModeToggle />}
        </div>
        <ProTip />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ arc guide */

/**
 * The arc a shift-drag draws: from where the press began to the cursor,
 * bowed upward the further it goes, with a faint track marking full spin
 * either way. The bow is the hook — a long drag draws a deep arc and a long
 * bend on the lane.
 */
function DragArc() {
  useGame();
  const d = game.drag;
  if (!d) return null;
  const spin = game.spin;
  const dx = Math.max(-FULL_SPIN_PX, Math.min(FULL_SPIN_PX, d.x - d.x0));
  const ex = d.x0 + dx;
  const ey = d.y0;
  const bow = Math.abs(dx) * 0.55;
  const cx = d.x0 + dx * 0.15;
  const cy = d.y0 - bow * 1.6;
  // Direction of the curve at its end, for the arrowhead.
  const tx = ex - cx;
  const ty = ey - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const head = 12;
  const pct = Math.round(Math.abs(spin) * 100);
  return (
    <>
    <svg className="pointer-events-none fixed inset-0 z-20 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="arc-grad" x1={d.x0} y1={d.y0} x2={ex} y2={ey} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f5f2ed" stopOpacity="0.5" />
          <stop offset="1" stopColor="#f2c744" />
        </linearGradient>
      </defs>
      {/* The track: how far is full spin, either way. */}
      <line
        x1={d.x0 - FULL_SPIN_PX}
        y1={d.y0}
        x2={d.x0 + FULL_SPIN_PX}
        y2={d.y0}
        stroke="#f5f2ed"
        strokeOpacity="0.18"
        strokeDasharray="2 6"
      />
      {[-1, -0.5, 0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={d.x0 + t * FULL_SPIN_PX}
          y1={d.y0 - (t === 0 ? 8 : 5)}
          x2={d.x0 + t * FULL_SPIN_PX}
          y2={d.y0 + (t === 0 ? 8 : 5)}
          stroke="#f5f2ed"
          strokeOpacity="0.35"
        />
      ))}
      <circle cx={d.x0} cy={d.y0} r={5} fill="#f5f2ed" fillOpacity="0.8" />
      {pct > 0 && (
        <>
          <path
            d={`M ${d.x0} ${d.y0} Q ${cx} ${cy} ${ex} ${ey}`}
            fill="none"
            stroke="url(#arc-grad)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d={`M ${ex} ${ey} L ${ex - ux * head - uy * head * 0.6} ${ey - uy * head + ux * head * 0.6} M ${ex} ${ey} L ${
              ex - ux * head + uy * head * 0.6
            } ${ey - uy * head - ux * head * 0.6}`}
            stroke="#f2c744"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
    <p
      className="pointer-events-none fixed z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-void/80 px-3 py-1 text-xs text-ink backdrop-blur-sm"
      style={{ left: ex, top: ey + 18 }}
    >
      {pct === 0 ? "No spin" : `${pct}% hook ${spin > 0 ? "right →" : "← left"}`}
    </p>
    </>
  );
}

/* ------------------------------------------------------------------ HUD */

/** Touch screens have no shift key; this makes every drag draw the arc. */
function SpinModeToggle() {
  useGame();
  return (
    <button
      type="button"
      onClick={toggleSpinMode}
      className={`rounded-full border px-4 py-2 text-xs backdrop-blur-md transition-colors ${
        game.spinMode ? "border-bloom bg-bloom/15 text-bloom" : "border-line bg-void/75 text-muted hover:text-ink"
      }`}
      aria-pressed={game.spinMode}
    >
      Spin mode {game.spinMode ? "on" : "off"}
    </button>
  );
}

/** The ten, as dots in their triangle, filled while standing. */
function PinDiagram() {
  useGame();
  const rows = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];
  return (
    <div
      className="rounded-2xl border border-line bg-void/75 px-4 py-3 backdrop-blur-md"
      aria-label={`${game.standing.size} groundhogs standing`}
    >
      <div className="flex flex-col items-center gap-1.5">
        {rows.map((row) => (
          <div key={row[0]} className="flex gap-1.5">
            {row.map((n) => (
              <span
                key={n}
                className={`block h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                  game.standing.has(n) ? "bg-ember" : "border border-line bg-transparent"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] uppercase tracking-[0.2em] text-muted">Pins</p>
    </div>
  );
}

function Scoreboard() {
  useGame();
  const { frames, total } = score(game.rolls);
  const { frame } = position(game.rolls);
  // What a scoresheet shows in each box: X for a strike, / for a spare.
  const marks = (f: number, rolls: number[]): string[] => {
    const n = (r: number | undefined) => (r === undefined ? "" : r === 0 ? "–" : String(r));
    const [a, b, c] = rolls;
    if (f < 9) {
      if (a === 10) return ["", "X"];
      return [n(a), b !== undefined && a + b === 10 ? "/" : n(b)];
    }
    const m0 = a === 10 ? "X" : n(a);
    const m1 =
      b === undefined ? "" : a === 10 ? (b === 10 ? "X" : n(b)) : a + b === 10 ? "/" : n(b);
    const m2 =
      c === undefined ? "" : a === 10 && b !== 10 ? (b + c === 10 ? "/" : n(c)) : c === 10 ? "X" : n(c);
    return [m0, m1, m2];
  };
  return (
    <div className="fixed inset-x-5 top-[5.75rem] z-20 rounded-2xl border border-line bg-void/75 p-2 backdrop-blur-md sm:inset-x-auto sm:right-8 sm:top-8">
      <div className="flex justify-center">
        {frames.map((fr, f) => {
          const current = f === frame && game.phase !== "over";
          return (
            <div
              key={f}
              className={`border-l border-line first:border-l-0 ${f === 9 ? "w-12 sm:w-16" : "w-8 sm:w-11"} ${
                current ? "bg-raise" : ""
              }`}
            >
              <p className={`text-center text-[10px] ${current ? "text-bloom" : "text-muted"}`}>{f + 1}</p>
              <div className="flex justify-end">
                {marks(f, fr.rolls).map((m, i) => (
                  <span
                    key={i}
                    className={`h-4 w-4 text-center text-[11px] leading-4 tabular-nums ${
                      m === "X" || m === "/" ? "text-bloom" : "text-ink"
                    } ${i > 0 || f === 9 ? "border-b border-l border-line" : ""}`}
                  >
                    {m}
                  </span>
                ))}
              </div>
              <p className="h-5 text-center text-sm tabular-nums text-ink">{fr.score ?? ""}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-1 px-1 text-right text-xs text-muted">
        Total <span className="tabular-nums text-ink">{total}</span>
      </p>
    </div>
  );
}

/** What just happened — big, briefly. */
function Message() {
  useGame();
  const [shown, setShown] = useState(0);
  const id = game.messageId;
  useEffect(() => {
    if (!game.message) return;
    setShown(id);
    if (game.phase === "over") return;
    const t = setTimeout(() => setShown(0), 2000);
    return () => clearTimeout(t);
  }, [id]);
  const big = game.message === "Strike!" || game.message === "Spare!";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[28%] z-20 flex flex-col items-center px-6 text-center">
      {shown === id && game.message && (
        <p
          key={id}
          className={`gh-pop font-display ${big ? "text-6xl italic text-bloom sm:text-8xl" : "text-3xl text-ink sm:text-4xl"}`}
          style={{ textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}
        >
          {game.message}
        </p>
      )}
      {game.phase === "over" && (
        <button
          type="button"
          onClick={newGame}
          className="pointer-events-auto mt-6 rounded-full bg-bloom px-6 py-2.5 text-sm font-medium text-void transition-transform hover:scale-[1.03]"
        >
          Bowl another game
        </button>
      )}
    </div>
  );
}

/** Before the first ball, the one line of instructions. */
function Hint() {
  useGame();
  if (game.phase !== "aim" || game.rolls.length > 0 || game.drag) return null;
  return (
    <p className="pointer-events-none fixed inset-x-0 top-[22%] z-20 text-center sm:top-[13%]">
      <span className="rounded-full bg-void/70 px-4 py-1.5 text-sm text-ink backdrop-blur-md">
        Point to aim · click to bowl
      </span>
    </p>
  );
}

/* -------------------------------------------------------------- pro tip */

const TIP_KEY = "groundhog-bowling:tip-collapsed";

/**
 * The pro tip, as a thought: a small cloud to press, and pressed, two little
 * bubbles float up off it one after the other and the tip itself is written
 * in the big cloud they lead to. Pressed again (or its ×), it is put away;
 * which it was is remembered.
 */
function ProTip() {
  const touch = useTouch();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(TIP_KEY, v ? "1" : "0");
    } catch {
      /* private mode: it just will not be remembered */
    }
  };
  const open = !collapsed;
  const kbd = "rounded border border-void/20 bg-void/5 px-1.5 py-0.5 text-xs";

  return (
    <div className="pointer-events-auto relative z-10 mb-3 mr-3 self-end">
      {open && (
        <>
          {/* The big cloud, with the tip in it. */}
          <aside
            aria-label="Pro tip"
            className="bubble-pop absolute bottom-[9.75rem] right-6 w-[min(18rem,calc(100vw-7rem))] origin-bottom-right"
            style={{ animationDelay: "0.24s" }}
          >
            <Cloud bodyClassName="px-2 py-1 pr-7">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-void/60">
                <span aria-hidden="true">✦</span> Pro tip
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                Your cursor aims the ball. To hook it, hold <kbd className={kbd}>Shift</kbd> and drag
                sideways: the arc you draw is the spin, and the further you drag, the harder it breaks.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-void/70">
                The dotted line on the lane shows where it'll go. Aim away from the pocket and let the
                hook bring it back in. Click or press <kbd className={kbd}>Space</kbd> to bowl.
              </p>
              {touch && (
                <p className="mt-2 text-sm leading-relaxed text-void/70">
                  No shift key? Turn on <span className="font-medium text-void">Spin mode</span> and drag
                  to draw the arc; turn it off to aim and tap to bowl.
                </p>
              )}
              <button
                type="button"
                onClick={() => set(true)}
                className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full text-void/60 transition-colors hover:bg-void/10 hover:text-void"
                aria-label="Put the pro tip away"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </button>
            </Cloud>
          </aside>
          {/* The two little bubbles leading up to it. */}
          <span
            aria-hidden="true"
            className="bubble-pop absolute bottom-[3.6rem] right-[5.2rem] h-3 w-3 rounded-full bg-cloud/90 shadow-[0_4px_10px_rgba(0,0,0,0.3)]"
          />
          <span
            aria-hidden="true"
            className="bubble-pop absolute bottom-[5.3rem] right-[4rem] h-6 w-6 rounded-full bg-cloud/90 shadow-[0_6px_14px_rgba(0,0,0,0.3)]"
            style={{ animationDelay: "0.12s" }}
          />
        </>
      )}
      {/* The cloud to press. */}
      <button
        type="button"
        onClick={() => set(open)}
        aria-expanded={open}
        className="block transition-transform duration-200 hover:scale-105"
      >
        <Cloud bodyClassName="inline-flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
          <span aria-hidden="true">✦</span> Pro tip
        </Cloud>
      </button>
    </div>
  );
}
