import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { drawing } from "@/lib/copy";
import { reducedMotion } from "@/three/quality";
import Cloud, { ThoughtDots, thoughtTiming } from "./Cloud";

/**
 * "drawing", in the description, with the drawing behind it.
 *
 * Like the guitar (ui/GuitarMenu): hovering the phrase — or tapping it —
 * bubbles up a small cloud above it, the same size as the guitar's, with the
 * drawing in it under its title. Pressing that cloud grows it, from where it
 * is, into one that fills nearly the whole screen; pressing anywhere, the ×, or
 * Escape puts it back. The big one is drawn on the page itself, outside the
 * hero's faded, transformed block, so it is not dimmed or moved with it.
 */
const PACE = 2.2;

export default function DrawingMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const bigCloud = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const from = useRef<DOMRect | null>(null);
  const closeAt = useRef(0);
  const [nudge, setNudge] = useState(0);

  // Centred over the phrase, but kept on the screen.
  useLayoutEffect(() => {
    if (!open) {
      setNudge(0);
      return;
    }
    const el = menu.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = r.left - nudge;
    const margin = 24;
    const over = left + r.width - (window.innerWidth - margin);
    setNudge(over > 0 ? -over : left < margin ? margin - left : 0);
    // Measured once as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape, or a press anywhere else, puts the small one away.
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

  // The big one: grown out of the small cloud, the page held still under it.
  useLayoutEffect(() => {
    if (!big) return;
    const el = bigCloud.current;
    const start = from.current;
    if (el && start && !reducedMotion()) {
      const end = el.getBoundingClientRect();
      const s = Math.min(start.width / end.width, start.height / end.height);
      const dx = start.left + start.width / 2 - (end.left + end.width / 2);
      const dy = start.top + start.height / 2 - (end.top + end.height / 2);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.85 },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ],
        { duration: 460, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.05)" },
      );
    }
    closeButton.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBig(false);
    };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, [big]);

  const show = () => {
    window.clearTimeout(closeAt.current);
    setOpen(true);
  };
  // A moment's grace, so the cursor can get from the phrase to the cloud.
  const hide = () => {
    window.clearTimeout(closeAt.current);
    closeAt.current = window.setTimeout(() => setOpen(false), 220);
  };

  const grow = () => {
    from.current = menu.current?.getBoundingClientRect() ?? null;
    window.clearTimeout(closeAt.current);
    setOpen(false);
    setBig(true);
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
          open || big ? "text-bloom decoration-bloom/70" : "decoration-white/50"
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
            data-groundhog-menu=""
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
              <button
                type="button"
                onClick={grow}
                aria-label={`${drawing.title} Open it larger.`}
                className="group block w-full text-left"
              >
                <span className="block px-0.5 pb-1 text-[0.7rem] font-semibold leading-snug">
                  {drawing.title}
                </span>
                <img
                  src={drawing.small}
                  alt={drawing.alt}
                  width={640}
                  height={480}
                  className="block w-full rounded-md shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-200 group-hover:scale-[1.02]"
                />
              </button>
            </Cloud>
          </span>
        </>
      )}

      {big &&
        createPortal(
          <div
            data-groundhog-menu=""
            role="dialog"
            aria-modal="true"
            aria-label={drawing.title}
            onClick={() => setBig(false)}
            className="drawing-backdrop fixed inset-0 z-[70] grid place-items-center bg-black/45 p-6"
          >
            <div ref={bigCloud} className="relative">
              <Cloud puff={0.8} opacity={1} bodyClassName="px-2 py-1 text-center">
                <p className="pb-2 text-base font-semibold sm:text-lg">{drawing.title}</p>
                <img
                  src={drawing.large}
                  alt={drawing.alt}
                  width={2400}
                  height={1800}
                  className="block rounded-lg shadow-[0_4px_14px_rgba(0,0,0,0.22)]"
                  style={{ width: "min(80vw, 100vw - 6rem, calc((80vh - 4rem) * 4 / 3))" }}
                />
              </Cloud>
            </div>
            <button
              ref={closeButton}
              type="button"
              onClick={() => setBig(false)}
              aria-label="Close"
              className="fixed right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-cloud text-void shadow-[0_6px_16px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 sm:right-6 sm:top-6"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </span>
  );
}
