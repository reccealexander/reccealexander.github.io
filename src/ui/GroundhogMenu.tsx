import { useEffect, useSyncExternalStore } from "react";
import { BOWLING_PATH, navigate } from "@/lib/router";
import { startBowlingTransition } from "@/lib/bowlingTransition";
import { reducedMotion } from "@/three/quality";
import {
  closeGroundhogMenu,
  groundhogMenu,
  subscribeGroundhogMenu,
} from "@/lib/groundhogMenu";

const isOpen = () => groundhogMenu.open;

/**
 * What a click on the groundhog opens: a small card that grows out of its
 * body, with the one place it can take you. Positioned by the groundhog
 * itself (see lib/groundhogMenu); this only draws it and closes it.
 */
export default function GroundhogMenu() {
  const open = useSyncExternalStore(subscribeGroundhogMenu, isOpen, isOpen);

  useEffect(() => {
    if (!open) return;
    // Anywhere else, or Escape, puts it away.
    const away = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-groundhog-menu]")) closeGroundhogMenu();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGroundhogMenu();
    };
    window.addEventListener("pointerdown", away, { capture: true });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, { capture: true });
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-groundhog-menu
      ref={(el) => {
        groundhogMenu.el = el;
      }}
      className="group/gh pointer-events-auto invisible fixed z-50 h-0 w-0"
    >
      {/* The card, anchored at the animal's chest and grown out of it. */}
      <div
        role="menu"
        aria-label="Groundhog"
        className="gh-menu absolute bottom-3 left-4 w-64 origin-bottom-left rounded-2xl border border-line bg-void/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md group-data-[side=left]/gh:left-auto group-data-[side=left]/gh:right-4 group-data-[side=left]/gh:origin-bottom-right"
      >
        <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.2em] text-muted">
          This groundhog has a lane
        </p>
        <button
          type="button"
          role="menuitem"
          autoFocus
          onClick={() => {
            closeGroundhogMenu();
            // The groundhog itself is the loading screen (ui/BowlingTransition);
            // asked for less motion, it is simply a cut.
            if (reducedMotion()) navigate(BOWLING_PATH);
            else startBowlingTransition();
          }}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-raise hover:text-bloom focus-visible:bg-raise"
        >
          Go to the bowling alley
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {/* A small tail back to its body. */}
      <span
        aria-hidden="true"
        className="gh-menu absolute bottom-1 left-1 h-2.5 w-2.5 rounded-full border border-line bg-void/90 group-data-[side=left]/gh:left-auto group-data-[side=left]/gh:right-1"
      />
    </div>
  );
}
