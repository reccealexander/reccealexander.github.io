import { useState, type KeyboardEvent } from "react";

/**
 * The guitar recordings as a little CD player (ui/GuitarMenu).
 *
 * Drawn in the same pen as the cloud it sits in: a player with a round window,
 * a display and a stop button, and the five discs fanned out of the slot down
 * its right side, each tucked a little way in. Pointing at one nudges it out
 * and puts its name up on the display; pressing it slides it the rest of the
 * way in, and it turns in the window while it plays. Another disc swaps with
 * it; the stop button (or the window) slides it back out.
 */

type Track = { id: string; title: string };

const INK = "#141414";
/** Each disc its own colour, so they can be told apart at a glance. */
const DISC = ["#f2c744", "#e4813f", "#8fb8e8", "#e79bb0", "#9fd3b4"];

/** Where the discs sit: centred past the player's right edge, a little
    staggered so each one shows. */
const OUT_X = 167;
const stagger = (i: number) => (i % 2) * 5;
const R = 19;
const IN_X = 128;
const rowY = (i: number) => 18 + i * 16;

function Disc({ x, y, r, colour }: { x: number; y: number; r: number; colour: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={colour} stroke={INK} strokeWidth={2.2} />
      {/* A sheen across it. */}
      <path
        d={`M${x - r * 0.62},${y - r * 0.5} A${r * 0.8},${r * 0.8} 0 0 1 ${x + r * 0.15},${y - r * 0.78}`}
        fill="none"
        stroke="#fff"
        strokeOpacity={0.7}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r={r * 0.42} fill="#f6f1e7" stroke={INK} strokeWidth={1.6} />
      <circle cx={x} cy={y} r={r * 0.14} fill={INK} />
    </>
  );
}

export default function CdPlayer({
  tracks,
  playing,
  onPlay,
  onStop,
}: {
  tracks: readonly Track[];
  playing: string | null;
  onPlay: (id: string) => void;
  onStop: () => void;
}) {
  const [pointing, setPointing] = useState<string | null>(null);
  const current = tracks.findIndex((t) => t.id === playing);
  const shown = tracks.find((t) => t.id === (pointing ?? playing));
  const key = (go: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };

  return (
    <svg viewBox="0 0 196 100" className="block h-auto w-[212px] overflow-visible" aria-label="CD player">
      {/* The discs, behind the player, so the slot hides the part pushed in. */}
      {tracks.map((t, i) => {
        const inside = t.id === playing;
        const nudge = !inside && pointing === t.id ? 5 : 0;
        return (
          <g
            key={t.id}
            role="button"
            tabIndex={0}
            aria-label={inside ? `${t.title}, playing` : `Play ${t.title}`}
            aria-pressed={inside}
            onClick={() => !inside && onPlay(t.id)}
            onKeyDown={key(() => !inside && onPlay(t.id))}
            onPointerEnter={() => setPointing(t.id)}
            onPointerLeave={() => setPointing((p) => (p === t.id ? null : p))}
            onFocus={() => setPointing(t.id)}
            onBlur={() => setPointing((p) => (p === t.id ? null : p))}
            className={inside ? "outline-none" : "cursor-pointer outline-none"}
            style={{
              transform: `translateX(${inside ? IN_X - OUT_X - stagger(i) : nudge}px)`,
              transition: "transform 0.5s cubic-bezier(0.3, 0.7, 0.3, 1)",
            }}
          >
            <Disc x={OUT_X + stagger(i)} y={rowY(i)} r={R} colour={DISC[i % DISC.length]} />
          </g>
        );
      })}

      {/* The player. */}
      <rect x={8} y={6} width={142} height={88} rx={14} fill="#a9c9bf" stroke={INK} strokeWidth={2.6} />
      {/* The slot the discs go into, down its right side. */}
      <path d="M149,11 V89" stroke={INK} strokeWidth={4} strokeLinecap="round" />

      {/* The window, with the playing disc turning in it. */}
      <g
        role="button"
        tabIndex={playing ? 0 : -1}
        aria-label={playing ? "Stop" : undefined}
        aria-hidden={playing ? undefined : true}
        onClick={() => playing && onStop()}
        onKeyDown={key(() => playing && onStop())}
        className={playing ? "cursor-pointer outline-none" : "outline-none"}
      >
        <circle cx={50} cy={50} r={33} fill="#26302c" stroke={INK} strokeWidth={2.6} />
        {current >= 0 && (
          <g key={playing} className="cd-in">
            <g className="cd-spin">
              <Disc x={50} y={50} r={27} colour={DISC[current % DISC.length]} />
            </g>
          </g>
        )}
        <circle cx={50} cy={50} r={33} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={6} />
      </g>

      {/* The display. */}
      <rect x={90} y={16} width={52} height={20} rx={4} fill="#1d2924" stroke={INK} strokeWidth={2} />
      <text
        x={116}
        y={29.5}
        textAnchor="middle"
        fontSize={7}
        fill="#bfe9c9"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {shown ? shown.title : "pick a CD"}
      </text>

      {/* Stop. */}
      <g
        role="button"
        tabIndex={playing ? 0 : -1}
        aria-label="Stop"
        onClick={() => playing && onStop()}
        onKeyDown={key(() => playing && onStop())}
        className={playing ? "cursor-pointer" : ""}
        opacity={playing ? 1 : 0.55}
      >
        <circle cx={104} cy={64} r={11} fill="#f6f1e7" stroke={INK} strokeWidth={2.2} />
        <rect x={100} y={60} width={8} height={8} rx={1.2} fill={INK} />
      </g>
      {/* And a little speaker. */}
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={124 + c * 6} cy={58 + r * 6} r={1.4} fill={INK} />),
      )}
    </svg>
  );
}
