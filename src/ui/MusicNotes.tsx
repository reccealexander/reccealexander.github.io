import { useEffect, useRef } from "react";
import { isMusicPlaying, subscribeMusic } from "@/lib/music";
import { reducedMotion } from "@/three/quality";

/**
 * Music notes over the field while a guitar recording plays.
 *
 * They come down the way the petals do (three/Drift): a slow fall on a lazy
 * spiral, each turning as it goes, in the page's gold and cream. New ones stop
 * coming the moment the music stops, and the ones in the air finish their fall
 * and fade, so they never blink out. Behind the text, over the scene; drawn
 * straight to the DOM from one frame loop, not through React.
 */
const GLYPHS = ["♪", "♫", "♩", "♬"];
const COLOURS = ["#f2c744", "#f6f1e7", "#f2c744", "#e4813f", "#f6f1e7"];
/** A new note this often while playing, and never more than this many up. */
const EVERY = 0.42;
const MOST = 30;

type Note = {
  el: HTMLSpanElement;
  x: number;
  born: number;
  life: number;
  sway: number;
  rate: number;
  phase: number;
  spin: number;
  turn: number;
  drift: number;
  peak: number;
};

export default function MusicNotes() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = layer.current;
    if (!host || reducedMotion()) return;
    const notes: Note[] = [];
    let raf = 0;
    let last = performance.now() / 1000;
    let due = 0;

    const spawn = (now: number) => {
      const el = document.createElement("span");
      el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      const size = 14 + Math.random() * 16;
      el.style.cssText = `position:absolute;left:0;top:0;font-size:${size}px;line-height:1;color:${
        COLOURS[Math.floor(Math.random() * COLOURS.length)]
      };text-shadow:0 1px 4px rgba(6,16,9,0.55);will-change:transform,opacity;opacity:0`;
      host.appendChild(el);
      notes.push({
        el,
        x: Math.random() * window.innerWidth,
        born: now,
        life: 8 + Math.random() * 5,
        sway: 18 + Math.random() * 40,
        rate: 0.6 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 50,
        turn: (Math.random() - 0.5) * 40,
        drift: 10 + Math.random() * 30,
        peak: 0.55 + Math.random() * 0.4,
      });
    };

    const frame = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - last);
      last = now;
      const H = window.innerHeight;

      if (isMusicPlaying() && notes.length < MOST) {
        due -= dt;
        if (due <= 0) {
          spawn(now);
          due = EVERY * (0.6 + Math.random() * 0.8);
        }
      }

      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const u = (now - n.born) / n.life;
        if (u >= 1) {
          n.el.remove();
          notes.splice(i, 1);
          continue;
        }
        const t = now - n.born;
        // Down the screen over its life, on a lazy spiral, drifting a little
        // with the wind.
        const y = -40 + u * (H + 80);
        const x = n.x + Math.sin(t * n.rate + n.phase) * n.sway + t * n.drift;
        const r = n.turn + n.spin * t + Math.cos(t * n.rate + n.phase) * 14;
        const a = n.peak * Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.18);
        n.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${r.toFixed(1)}deg)`;
        n.el.style.opacity = a.toFixed(3);
      }

      // Nothing playing and nothing left in the air: rest until it starts.
      if (isMusicPlaying() || notes.length > 0) raf = requestAnimationFrame(frame);
      else raf = 0;
    };

    const wake = () => {
      if (isMusicPlaying() && !raf) {
        last = performance.now() / 1000;
        due = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const unsubscribe = subscribeMusic(wake);
    wake();

    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      for (const n of notes) n.el.remove();
    };
  }, []);

  return <div ref={layer} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[5] overflow-hidden" />;
}
