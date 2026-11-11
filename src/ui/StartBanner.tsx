import { useEffect, useRef, useState } from "react";
import { scrollState } from "@/lib/scroll";
import { useBiome } from "./BiomeContext";
import { useJourney } from "./useJourney";

/**
 * A nudge on opening: "Try catching the groundhog".
 *
 * Slides in from the top right corner just as the groundhog first comes up out
 * of the grass (see three/Groundhog.tsx — a couple of seconds in), stays
 * a few seconds, and slides back out. Once per visit, only from the opening
 * shot, and not at the pond, where there is no groundhog to catch.
 */
const SHOW_AT = 2100;
const SHOW_FOR = 5500;

export default function StartBanner() {
  const { biome } = useBiome();
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(false);
  const pond = useRef(!!biome.pond);
  pond.current = !!biome.pond;

  useEffect(() => {
    const show = window.setTimeout(() => {
      // Only if the reader is still looking at the field it is in.
      if (!pond.current && scrollState.chapter < 0.3) setShown(true);
      else setDone(true);
    }, SHOW_AT);
    const hide = window.setTimeout(() => setShown(false), SHOW_AT + SHOW_FOR);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);

  // Scrolled away from the opening shot: the groundhog has gone, so has this.
  useJourney((c) => {
    if (c > 0.3) setShown((v) => (v ? false : v));
  });

  if (done) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 sm:right-6 sm:top-6"
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-void/80 py-2.5 pl-3.5 pr-2 text-sm text-ink shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:transition-none ${
          shown
            ? "translate-x-0 translate-y-0 opacity-100"
            : "pointer-events-none translate-x-[120%] -translate-y-2 opacity-0"
        }`}
      >
        {/* An open hand, reaching. */}
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-bloom"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 10V4.8a1.2 1.2 0 0 1 2.4 0V9M9.4 9V3.6a1.2 1.2 0 0 1 2.4 0V9M11.8 9V4.6a1.2 1.2 0 0 1 2.4 0v5.6c0 3.4-2.2 6.1-5.4 6.1-2.1 0-3.4-1-4.5-2.7L2.6 10.5a1.2 1.2 0 0 1 2-1.3L7 12" />
        </svg>
        <span aria-hidden="true">Try catching the groundhog</span>
        {/* Announced once, as it arrives. */}
        <span className="sr-only">{shown ? "Try catching the groundhog" : ""}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setShown(false)}
          className="rounded-md p-1 text-muted transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
