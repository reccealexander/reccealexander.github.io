import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { guitar } from "@/lib/copy";
import { setMusicPlaying } from "@/lib/music";
import Cloud, { ThoughtDots, thoughtTiming } from "./Cloud";

/**
 * "playing guitar", in the description, with a few recordings behind it.
 *
 * Hovering the phrase (or tapping it, on a phone, or pressing it from the
 * keyboard) opens a small menu just above it; a track in it starts playing
 * and the menu gets out of the way; opened again, the same track stops, back
 * at its start. One plays at a time, through the one audio element, and the
 * menu stays put while the cursor crosses the gap from the phrase to it.
 * While anything plays, notes drift over the field (ui/MusicNotes).
 */
/** The guitar menu bubbles up more slowly than the others: more of a thought. */
const PACE = 2.2;

export default function GuitarMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const closeAt = useRef(0);
  const menu = useRef<HTMLSpanElement>(null);
  const [nudge, setNudge] = useState(0);

  // Centred over the phrase, but kept on the screen: near an edge (the phrase
  // is at the right on a phone) it slides in from it.
  useLayoutEffect(() => {
    if (!open) {
      setNudge(0);
      return;
    }
    const el = menu.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = r.left - nudge;
    // The puffs stand out past the box by about this much.
    const margin = 24;
    const over = left + r.width - (window.innerWidth - margin);
    setNudge(over > 0 ? -over : left < margin ? margin - left : 0);
    // Measured once as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The player, made once and stopped on the way out.
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    const ended = () => {
      setPlaying(null);
      setProgress(0);
      setMusicPlaying(false);
    };
    const tick = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    a.addEventListener("ended", ended);
    a.addEventListener("timeupdate", tick);
    audio.current = a;
    return () => {
      a.pause();
      setMusicPlaying(false);
      a.removeEventListener("ended", ended);
      a.removeEventListener("timeupdate", tick);
      audio.current = null;
    };
  }, []);

  // Escape, or a press anywhere else, puts it away.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", away);
    };
  }, [open]);

  const show = () => {
    window.clearTimeout(closeAt.current);
    setOpen(true);
  };
  // A moment's grace, so the cursor can get from the phrase to the menu.
  const hide = () => {
    window.clearTimeout(closeAt.current);
    closeAt.current = window.setTimeout(() => setOpen(false), 220);
  };

  const play = (id: string, src: string) => {
    const a = audio.current;
    if (!a) return;
    if (playing === id) {
      // Paused, it goes back to the top: played again, it starts over.
      a.pause();
      a.currentTime = 0;
      setProgress(0);
      setPlaying(null);
      setMusicPlaying(false);
      return;
    }
    if (!a.src.endsWith(src)) {
      a.src = src;
      setProgress(0);
    }
    a.play().then(
      () => {
        setPlaying(id);
        setMusicPlaying(true);
      },
      () => {
        setPlaying(null);
        setMusicPlaying(false);
      },
    );
    // Started: the menu has done its job.
    window.clearTimeout(closeAt.current);
    setOpen(false);
  };

  return (
    <span
      ref={root}
      className="relative inline-block"
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        className={`inline underline decoration-dotted decoration-1 underline-offset-4 transition-colors hover:text-bloom ${
          open || playing ? "text-bloom decoration-bloom/70" : "decoration-white/50"
        }`}
      >
        {label}
      </button>

      {open && (
        <>
          {/* A thought bubble: two dots up off the phrase, then the cloud. */}
          <ThoughtDots pace={PACE} className="bottom-full left-1/2 mb-0.5" />
          <span
            ref={menu}
            role="group"
            aria-label="Guitar recordings"
            style={{ transform: `translateX(calc(-50% + ${nudge}px))` }}
            className="absolute bottom-full left-1/2 z-20 mb-[2.6rem] block w-48 text-left [text-shadow:none]"
          >
            <Cloud
              puff={0.42}
              opacity={1}
              className="bubble-pop origin-bottom"
              style={thoughtTiming(PACE)}
              bodyClassName="py-0.5"
            >
              {guitar.map((t) => {
                const on = playing === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => play(t.id, t.src)}
                    aria-pressed={on}
                    aria-label={`${on ? "Pause" : "Play"} ${t.title}`}
                    className={`relative flex w-full items-center gap-2 overflow-hidden rounded-md px-1.5 py-1 text-[0.78rem] transition-colors ${
                      on ? "bg-void/10 font-semibold" : "hover:bg-void/[0.07]"
                    }`}
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-void/10">
                      {on ? (
                        <svg viewBox="0 0 12 12" className="h-2 w-2" fill="currentColor" aria-hidden="true">
                          <rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
                          <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 12 12" className="ml-px h-2 w-2" fill="currentColor" aria-hidden="true">
                          <path d="M2.5 1.4v9.2a.5.5 0 0 0 .76.43l7.4-4.6a.5.5 0 0 0 0-.86l-7.4-4.6a.5.5 0 0 0-.76.43Z" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{t.title}</span>
                    {/* A little level meter while it plays. */}
                    {on && (
                      <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="guitar-bar w-[2px] rounded-full bg-ember"
                            style={{ animationDelay: `${i * 0.18}s` }}
                          />
                        ))}
                      </span>
                    )}
                    {/* How far through it is. */}
                    {on && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-0 h-[2px] bg-ember/70"
                        style={{ width: `${progress * 100}%` }}
                      />
                    )}
                  </button>
                );
              })}
            </Cloud>
          </span>
        </>
      )}
    </span>
  );
}
