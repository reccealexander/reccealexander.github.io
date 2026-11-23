import { useState, type KeyboardEvent } from "react";

/**
 * The guitar recordings as a little CD player (ui/GuitarMenu).
 *
 * Drawn in the same pen as the cloud it sits in: a square player with a round
 * window, a display and a stop button, its cable running off out of the
 * cloud, and the five discs in a row along its right side, the first tucked in
 * behind it and each lying over the one before. Pointing at one nudges it up
 * and puts its name on the display; pressing it slides it into the player,
 * where it turns in the window while it plays. Another disc swaps with it; the
 * stop button (or the window) slides it back out.
 */

type Track = { id: string; title: string };

const INK = "#141414";
/** Silvery, and only just told apart. */
const DISC = ["#d6d9dc", "#cfd3d7", "#d9d6d1", "#d1d6d3", "#d7d2d5"];

/** The player: a square. */
const P = { x: 5, y: 5, size: 90 };
const PLAYER_RIGHT = P.x + P.size;
/** The window, where the playing disc turns. */
const WIN = { x: 50, y: 39, r: 24 };
/** The row of discs: centred along the player's middle, the first tucked in
    behind its right side. */
const R = 20;
const ROW_Y = 50;
const discX = (i: number) => PLAYER_RIGHT + 13 + i * 24;

function Disc({ x, y, r, colour }: { x: number; y: number; r: number; colour: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={colour} stroke={INK} strokeWidth={2.2} />
      {/* A faint sheen across it. */}
      <path
        d={`M${x - r * 0.62},${y - r * 0.5} A${r * 0.8},${r * 0.8} 0 0 1 ${x + r * 0.15},${y - r * 0.78}`}
        fill="none"
        stroke="#fff"
        strokeOpacity={0.75}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r={r * 0.4} fill="#f2eee6" stroke={INK} strokeWidth={1.6} />
      <circle cx={x} cy={y} r={r * 0.13} fill={INK} />
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
  const stopProps = {
    role: "button",
    tabIndex: playing ? 0 : -1,
    "aria-label": "Stop",
    onClick: () => playing && onStop(),
    onKeyDown: key(() => playing && onStop()),
  };

  return (
    <svg viewBox="0 0 228 100" className="block h-auto w-[236px] overflow-visible" aria-label="CD player">
      {/* The cable, from the bottom of the player's left side, off out of the
          cloud. */}
      <path
        d={`M${P.x + 1},${P.y + P.size - 12} C${P.x - 22},${P.y + P.size - 8} ${P.x - 34},${P.y + P.size + 22} ${P.x - 78},${P.y + P.size + 70}`}
        fill="none"
        stroke={INK}
        strokeWidth={4}
        strokeLinecap="round"
      />

      {/* The discs, behind the player, so it hides the one tucked in. */}
      {tracks.map((t, i) => {
        const inside = t.id === playing;
        const lift = !inside && pointing === t.id ? -5 : 0;
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
              transform: inside ? `translate(${WIN.x - discX(i)}px, 0px)` : `translate(0px, ${lift}px)`,
              transition: "transform 0.5s cubic-bezier(0.3, 0.7, 0.3, 1)",
            }}
          >
            <Disc x={discX(i)} y={ROW_Y} r={R} colour={DISC[i % DISC.length]} />
          </g>
        );
      })}

      {/* The player. */}
      <rect x={P.x} y={P.y} width={P.size} height={P.size} rx={12} fill="#bccac4" stroke={INK} strokeWidth={2.6} />

      {/* The window, with the playing disc turning in it. */}
      <g {...stopProps} aria-hidden={playing ? undefined : true} className={playing ? "cursor-pointer outline-none" : "outline-none"}>
        <circle cx={WIN.x} cy={WIN.y} r={WIN.r} fill="#27302c" stroke={INK} strokeWidth={2.4} />
        {current >= 0 && (
          <g key={playing} className="cd-in">
            <g className="cd-spin">
              <Disc x={WIN.x} y={WIN.y} r={WIN.r - 5} colour={DISC[current % DISC.length]} />
            </g>
          </g>
        )}
        <circle cx={WIN.x} cy={WIN.y} r={WIN.r} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={5} />
      </g>

      {/* The display. */}
      <rect x={13} y={69} width={58} height={16} rx={3.5} fill="#1d2924" stroke={INK} strokeWidth={1.8} />
      <text x={42} y={79.8} textAnchor="middle" fontSize={6.6} fill="#bfe9c9" style={{ fontFamily: "var(--font-sans)" }}>
        {shown ? shown.title : "pick a CD"}
      </text>

      {/* Stop. */}
      <g {...stopProps} className={playing ? "cursor-pointer outline-none" : "outline-none"} opacity={playing ? 1 : 0.55}>
        <circle cx={82} cy={77} r={7.5} fill="#f2eee6" stroke={INK} strokeWidth={2} />
        <rect x={79.2} y={74.2} width={5.6} height={5.6} rx={1} fill={INK} />
      </g>
    </svg>
  );
}
