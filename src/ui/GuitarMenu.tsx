import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { guitar } from "@/lib/copy";
import { setMusicPlaying } from "@/lib/music";
import CdPlayer from "./CdPlayer";

/**
 * "playing guitar", in the description, with a few recordings behind it.
 *
 * Hovering the phrase (or tapping it, on a phone, or pressing it from the
 * keyboard) lets a little CD player down on its lead from above, to hang
 * over it (ui/CdPlayer): a disc pressed slides in and plays; stopped, it slides back
 * out and the song goes back to its start. One plays at a time, through the
 * one audio element, and the player stays put while the cursor crosses the
 * gap from the phrase to it.
 * While anything plays, notes drift over the field (ui/MusicNotes).
 */
/** Where its lead is, across the drawing: hung over the phrase from there. */
const HANG_X = 60;
/** Its swing: how hard it is pulled back to hanging straight, and how
    quickly the swinging dies away. */
const GRAVITY = 9000;
const DAMPING = 0.95;
/** How far the pointer has to move before a press is a drag, not a click. */
const DRAG_FROM = 5;

export default function GuitarMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const closeAt = useRef(0);
  const menu = useRef<HTMLSpanElement>(null);
  const [nudge, setNudge] = useState(0);
  // Kept up a moment after it is put away, while it is drawn back up.
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  /*
   * The pendulum. It hangs from the top of its lead, somewhere above the top
   * of the screen; dragged, it turns about there to follow the pointer, and let
   * go, it swings back and forth until it hangs still. Worked out in a frame
   * loop and written straight to the element, not through React.
   */
  const swing = useRef<HTMLSpanElement>(null);
  const pend = useRef({
    theta: 0,
    omega: 0,
    length: 600,
    raf: 0,
    last: 0,
    // A press in progress, and whether it has become a drag.
    press: null as null | { x: number; y: number; id: number; grab: number; from: number },
    dragging: false,
    swallowClick: false,
    lastTheta: 0,
    lastAt: 0,
  });
  const pivot = () => {
    const r = menu.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    // The top of the lead: above the top of the screen.
    pend.current.length = Math.max(320, r.top + 60);
    return { x: r.left + HANG_X, y: r.top - pend.current.length };
  };
  const draw = () => {
    const el = swing.current;
    if (!el) return;
    const p = pend.current;
    el.style.transformOrigin = `${HANG_X}px ${-p.length}px`;
    el.style.transform = p.theta ? `rotate(${p.theta}rad)` : "";
  };
  const run = () => {
    const p = pend.current;
    if (p.raf) return;
    p.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - p.last) / 1000);
      p.last = now;
      if (!p.dragging) {
        p.omega += (-(GRAVITY / p.length) * Math.sin(p.theta) - DAMPING * p.omega) * dt;
        p.theta += p.omega * dt;
      }
      draw();
      if (p.dragging || Math.abs(p.theta) > 0.0008 || Math.abs(p.omega) > 0.002) {
        p.raf = requestAnimationFrame(step);
      } else {
        p.theta = 0;
        p.omega = 0;
        p.raf = 0;
        draw();
      }
    };
    p.raf = requestAnimationFrame(step);
  };
  const angleTo = (x: number, y: number) => {
    const o = pivot();
    return Math.atan2(x - o.x, y - o.y);
  };
  const onSwingDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = pend.current;
    p.press = { x: e.clientX, y: e.clientY, id: e.pointerId, grab: angleTo(e.clientX, e.clientY), from: p.theta };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pend.current;
      if (!p.press || e.pointerId !== p.press.id) return;
      if (!p.dragging) {
        if (Math.hypot(e.clientX - p.press.x, e.clientY - p.press.y) < DRAG_FROM) return;
        p.dragging = true;
        p.omega = 0;
        p.lastTheta = p.theta;
        p.lastAt = performance.now();
        run();
      }
      const next = Math.max(-0.75, Math.min(0.75, p.press.from + angleTo(e.clientX, e.clientY) - p.press.grab));
      const now = performance.now();
      const dt = Math.max(0.008, (now - p.lastAt) / 1000);
      // How fast it is being swung, smoothed, for when it is let go.
      p.omega = p.omega * 0.6 + ((next - p.lastTheta) / dt) * 0.4;
      p.lastTheta = next;
      p.lastAt = now;
      p.theta = next;
    };
    const up = (e: PointerEvent) => {
      const p = pend.current;
      if (!p.press || e.pointerId !== p.press.id) return;
      if (p.dragging) {
        p.dragging = false;
        // A drag is not a click on whatever it ended over.
        p.swallowClick = true;
        window.setTimeout(() => (p.swallowClick = false), 0);
        run();
        // Let go away from the phrase and the player: put it away as usual.
        if (!root.current?.contains(document.elementFromPoint(e.clientX, e.clientY))) hide();
      }
      p.press = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // The handlers read everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Put away: it hangs straight again next time.
  useEffect(() => {
    if (shown) return;
    const p = pend.current;
    cancelAnimationFrame(p.raf);
    Object.assign(p, { theta: 0, omega: 0, raf: 0, press: null, dragging: false });
  }, [shown]);
  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const t = window.setTimeout(() => setShown(false), 380);
    return () => window.clearTimeout(t);
  }, [open]);

  // Over the phrase, but kept on the screen.
  useLayoutEffect(() => {
    if (!shown) {
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
  }, [shown]);

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
    if (pend.current.dragging) return;
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

      {shown && (
        // The player, let down on its lead from above to rest just over the
        // phrase, and drawn back up when it is put away. It can be dragged,
        // and swings from the top of its lead like a pendulum.
        <span
          ref={menu}
          data-groundhog-menu=""
          role="group"
          aria-label="Guitar recordings"
          style={{ transform: `translateX(${nudge - HANG_X}px)` }}
          className="absolute bottom-full left-1/2 z-20 mb-3 block w-max text-left [text-shadow:none]"
        >
          <span className={`block ${leaving ? "cd-rise" : "cd-drop"}`}>
            {/* Drag it to swing it. */}
            <span
              ref={swing}
              className="block cursor-grab touch-none select-none active:cursor-grabbing"
              onPointerDown={onSwingDown}
              onClickCapture={(e) => {
                if (pend.current.swallowClick) {
                  e.stopPropagation();
                  e.preventDefault();
                }
              }}
            >
              <CdPlayer hang tracks={guitar} playing={playing} onPlay={play} onStop={stop} />
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
