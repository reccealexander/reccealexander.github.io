import { useState, type KeyboardEvent } from "react";

/**
 * The guitar recordings as a little CD player (ui/GuitarMenu).
 *
 * Drawn in the same pen as the cloud it sits in: a sharp-cornered player
 * whose top is a square clear lid, so the disc in it can be seen, with a strip
 * of controls under it, and a lead plugged into its side by an audio
 * jack. The five discs lie in a row along its right side, the first tucked in
 * under the lid and on top of the rest, each further one beneath the one
 * before. Pointing at one lifts it and puts its name on the display; pressing
 * it slides it in under the lid, where it turns while it plays. Another disc
 * swaps with it; the stop button (or the lid) slides it back out.
 */

type Track = { id: string; title: string };

const INK = "#141414";
/** Silvery, and only just told apart. */
const DISC = ["#d6d9dc", "#cfd3d7", "#d9d6d1", "#d1d6d3", "#d7d2d5"];

/** The player: a square clear lid, with the strip of controls under it. */
const P = { x: 8, y: 4, size: 100 };
const LID_BOTTOM = P.y + P.size;
const BOTTOM = LID_BOTTOM + 24;
const RIGHT = P.x + P.size;
/** Where a disc sits once it is in: the middle of the lid. */
const SEAT = { x: P.x + P.size / 2, y: P.y + P.size / 2 };
/** Discs that all but fill the lid; the row of them level with the seat, the
    first tucked in under the lid's edge. */
const R = 46;
const discX = (i: number) => RIGHT + R - 14 + i * 14;

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
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r={r * 0.38} fill="#f2eee6" stroke={INK} strokeWidth={1.6} />
      <circle cx={x} cy={y} r={r * 0.12} fill={INK} />
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
  const shown = tracks.find((t) => t.id === (pointing ?? playing));
  const key = (go: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };
  const stop = {
    role: "button",
    tabIndex: playing ? 0 : -1,
    "aria-label": "Stop",
    onClick: () => playing && onStop(),
    onKeyDown: key(() => playing && onStop()),
  };
  // Drawn far to near: the further a disc is from the player, the lower it lies.
  const order = tracks.map((t, i) => ({ t, i })).reverse();

  return (
    <svg viewBox="0 0 268 130" className="absolute left-0 top-0 block h-auto w-[278px] overflow-visible" aria-label="CD player">
      {/* The lead: plugged into the side by a jack, running away down to the
          left and on under the cloud's edge (ui/Cloud trims it there). */}
      <path
        d={`M${P.x - 15},${BOTTOM - 10} C${P.x - 32},${BOTTOM - 10} ${P.x - 40},${BOTTOM + 4} ${P.x - 52},${BOTTOM + 22} S${P.x - 80},${BOTTOM + 62} ${P.x - 110},${BOTTOM + 86}`}
        fill="none"
        stroke={INK}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      {/* The jack: its plastic grip, then the metal plug going into the side. */}
      <rect x={P.x - 17} y={BOTTOM - 14.5} width={10} height={9} rx={2.5} fill="#2b2b2b" stroke={INK} strokeWidth={1.6} />
      <rect x={P.x - 7.5} y={BOTTOM - 12.4} width={8.5} height={4.8} fill="#c9ccce" stroke={INK} strokeWidth={1.4} />
      <path d={`M${P.x - 3.6},${BOTTOM - 12.4} v4.8`} stroke={INK} strokeWidth={1.4} />

      {/* Inside the player, under the lid: a dark tray and its spindle. */}
      <rect x={P.x} y={P.y} width={P.size} height={LID_BOTTOM - P.y} fill="#2a3330" />
      <circle cx={SEAT.x} cy={SEAT.y} r={5} fill="#58625e" stroke="#1a1f1d" strokeWidth={1.5} />

      {/* The discs. */}
      {order.map(({ t, i }) => {
        const inside = t.id === playing;
        const lift = !inside && pointing === t.id ? -6 : 0;
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
              transform: inside ? `translate(${SEAT.x - discX(i)}px, 0px)` : `translate(0px, ${lift}px)`,
              transition: "transform 0.5s cubic-bezier(0.3, 0.7, 0.3, 1)",
            }}
          >
            {/* Turning, once it is in. */}
            <g className={inside ? "cd-spin cd-spin-late" : undefined}>
              <Disc x={discX(i)} y={SEAT.y} r={R} colour={DISC[i % DISC.length]} />
            </g>
          </g>
        );
      })}

      {/* The clear lid, over all of it, with a glint or two. */}
      <g {...stop} aria-hidden={playing ? undefined : true} className={playing ? "cursor-pointer outline-none" : "outline-none"}>
        <rect x={P.x} y={P.y} width={P.size} height={LID_BOTTOM - P.y} fill="#e6f2ee" fillOpacity={0.22} />
        <path d={`M${P.x + 10},${P.y + 38} L${P.x + 44},${P.y + 6}`} stroke="#fff" strokeOpacity={0.5} strokeWidth={4} strokeLinecap="round" />
        <path d={`M${P.x + 12},${P.y + 56} L${P.x + 62},${P.y + 8}`} stroke="#fff" strokeOpacity={0.28} strokeWidth={2.5} strokeLinecap="round" />
      </g>

      {/* The control strip. */}
      {/* Copper, with a little shine along it. */}
      <defs>
        <linearGradient id="cd-copper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9935a" />
          <stop offset="0.45" stopColor="#b8703b" />
          <stop offset="1" stopColor="#8f522a" />
        </linearGradient>
      </defs>
      <rect x={P.x} y={LID_BOTTOM} width={P.size} height={BOTTOM - LID_BOTTOM} fill="url(#cd-copper)" />
      {/* The display: amber on near-black, in a terminal face, glowing. */}
      <defs>
        <filter id="cd-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="0.9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={P.x + 7} y={LID_BOTTOM + 5} width={60} height={14} rx={2} fill="#1a1410" stroke={INK} strokeWidth={1.6} />
      <text
        x={P.x + 37}
        y={LID_BOTTOM + 15.4}
        textAnchor="middle"
        fontSize={9.5}
        fill="#ff9d3d"
        filter="url(#cd-glow)"
        style={{ fontFamily: "VT323, ui-monospace, Menlo, monospace" }}
      >
        {shown ? shown.title : "pick a CD"}
      </text>
      <g {...stop} className={playing ? "cursor-pointer outline-none" : "outline-none"} opacity={playing ? 1 : 0.55}>
        <circle cx={P.x + 84} cy={LID_BOTTOM + 12} r={7.5} fill="#f2eee6" stroke={INK} strokeWidth={2} />
        <rect x={P.x + 81.2} y={LID_BOTTOM + 9.2} width={5.6} height={5.6} rx={0.8} fill={INK} />
      </g>

      {/* The case: a thin copper frame all the way round, inside one ink
          line with sharp corners, and the lid's edge. */}
      <rect
        x={P.x + 2.4}
        y={P.y + 2.4}
        width={P.size - 4.8}
        height={BOTTOM - P.y - 4.8}
        fill="none"
        stroke="url(#cd-copper-frame)"
        strokeWidth={2.6}
        strokeLinejoin="miter"
      />
      <defs>
        <linearGradient id="cd-copper-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3a06a" />
          <stop offset="0.5" stopColor="#b8703b" />
          <stop offset="1" stopColor="#8f522a" />
        </linearGradient>
      </defs>
      <rect x={P.x} y={P.y} width={P.size} height={BOTTOM - P.y} fill="none" stroke={INK} strokeWidth={2.8} strokeLinejoin="miter" />
      <path d={`M${P.x},${LID_BOTTOM} H${RIGHT}`} stroke={INK} strokeWidth={2.2} />
    </svg>
  );
}
