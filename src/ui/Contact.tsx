import { LAYOUT } from "@/lib/journey";
import { useAct } from "@/lib/scroll";
import { BOWLING_PATH, onNavigate } from "@/lib/router";

/**
 * Back to the field.
 *
 * The last act runs the descent in reverse and carries the camera all the way
 * back to where the page began: high over the field, tipped down, the same
 * frame as the first screen. No copy — the page simply closes on the place it
 * opened.
 *
 * The section is exactly as tall as it needs to be for that. The bottom of the
 * document is reached at local progress (height − one screen) / height, which
 * for two screens is halfway — so the camera keys in lib/journey land the
 * opening shot at chapter 5.5, and the last scroll position shows it.
 */
export default function Contact() {
  const section = useAct("out");
  return (
    <section
      ref={section as React.RefObject<HTMLElement>}
      className="relative"
      style={{ height: `${LAYOUT.outVh}svh` }}
    >
      {/* The one thing said here: the groundhogs in this field have a lane. */}
      <a
        href={BOWLING_PATH}
        onClick={onNavigate(BOWLING_PATH)}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-line bg-void/70 px-4 py-2 text-sm text-ink backdrop-blur-md transition-colors hover:border-bloom/60 hover:text-bloom"
      >
        Groundhog bowling →
      </a>
    </section>
  );
}
