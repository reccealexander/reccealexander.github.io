import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { guitar } from "@/lib/copy";
import { setMusicPlaying } from "@/lib/music";
import Cloud, { DOT_ANCHOR } from "./Cloud";
import CdPlayer from "./CdPlayer";

/**
 * "playing guitar", in the description, with a few recordings behind it.
 *
 * Hovering the phrase (or tapping it, on a phone, or pressing it from the
 * keyboard) bubbles up a cloud above it with a little CD player in it
 * (ui/CdPlayer): a disc pressed slides in and plays; stopped, it slides back
 * out and the song goes back to its start. One plays at a time, through the
 * one audio element, and the cloud stays put while the cursor crosses the gap
 * from the phrase to it.
 * While anything plays, notes drift over the field (ui/MusicNotes).
 */
/** The guitar menu bubbles up more slowly than the others: more of a thought. */
const PACE = 2.2;

export default function GuitarMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const closeAt = useRef(0);
  const menu = useRef<HTMLSpanElement>(null);
  const [nudge, setNudge] = useState(0);

  // Centred over the phrase, but kept on the screen — checked again as the
  // cloud grows to its full size, not only as it opens.
  useLayoutEffect(() => {
    if (!open) {
      setNudge(0);
      return;
    }
    const el = menu.current;
    if (!el) return;
    let current = 0;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const left = r.left - current;
      const margin = 8;
      const over = left + r.width - (window.innerWidth - margin);
      const next = over > 0 ? -over : left < margin ? margin - left : 0;
      if (Math.abs(next - current) > 0.5) {
        current = next;
        setNudge(next);
      }
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [open]);

  // The player, made once and stopped on the way out.
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    const ended = () => {
      setPlaying(null);
      setMusicPlaying(false);
    };
    a.addEventListener("ended", ended);
    audio.current = a;
    return () => {
      a.pause();
      setMusicPlaying(false);
      a.removeEventListener("ended", ended);
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

  // Stopped: the disc comes back out, and the song goes back to its start.
  const stop = () => {
    const a = audio.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlaying(null);
    setMusicPlaying(false);
  };

  const play = (id: string) => {
    const a = audio.current;
    const track = guitar.find((t) => t.id === id);
    if (!a || !track) return;
    // The disc goes in straight away; the sound follows when it has loaded.
    setPlaying(id);
    if (!a.src.endsWith(track.src)) a.src = track.src;
    a.currentTime = 0;
    a.play().then(
      () => setMusicPlaying(true),
      () => {
        setPlaying(null);
        setMusicPlaying(false);
      },
    );
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
          {/* A thought bubble: rings up off the phrase, then the cloud. */}
          <span
            ref={menu}
            data-groundhog-menu=""
            role="group"
            aria-label="Guitar recordings"
            // The smallest ring over the phrase.
            style={{ transform: `translateX(calc(${-DOT_ANCHOR * 100}% + ${nudge}px))` }}
            className="absolute bottom-full left-1/2 z-20 mb-0.5 block w-max text-left [text-shadow:none]"
          >
            <Cloud dots="left" pace={PACE} bodyClassName="">
              <CdPlayer tracks={guitar} playing={playing} onPlay={play} onStop={stop} />
            </Cloud>
          </span>
        </>
      )}
    </span>
  );
}
