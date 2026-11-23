import { useEffect, useRef, useState } from "react";
import { hero } from "@/lib/copy";
import { LAYOUT } from "@/lib/journey";
import { useAct } from "@/lib/scroll";
import { clamp } from "@/lib/math";
import { clearingScreen, onClearingOpen, restartClearing } from "@/three/clearing";
import { useJourney } from "./useJourney";
import Wordmark from "./Wordmark";

/**
 * Standing in the field, at your own height.
 *
 * On opening, a patch of the grass in the middle of the frame goes back into
 * the ground and leaves bare dirt (three/clearing.ts); once it has opened, the
 * name glitches in on it, with room under it for a description. Nothing else
 * is on the first screen but the field and the groundhog.
 *
 * The scene is pitched dark enough to carry near-white copy, and the name
 * wears a tight outline of its own rather than sitting on a scrim. On the way
 * out it outruns the field and tips back into the page, which clears the frame
 * before the camera starts closing on the flower.
 */
export default function Hero() {
  const section = useAct("hero");
  const mark = useRef<HTMLDivElement>(null);
  // The name waits for the clearing to open before it glitches in.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    restartClearing();
    return onClearingOpen(() => setOpened(true));
  }, []);

  /*
   * Where the clearing is on the opening screen, which the text is set to
   * fill. It is fixed to the ground and seen from the opening camera, so it
   * depends only on the screen's shape.
   */
  const [patch, setPatch] = useState(() => clearingScreen(window.innerWidth / window.innerHeight));
  useEffect(() => {
    const onResize = () => setPatch(clearingScreen(window.innerWidth / window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useJourney((c) => {
    const t = clamp(c);
    if (!mark.current) return;
    mark.current.style.opacity = String(1 - clamp((t - 0.22) / 0.7));
    mark.current.style.transform = `translate3d(0, ${-t * 46}%, 0) rotateX(${t * 14}deg)`;
  });

  return (
    <section
      id="top"
      ref={section as React.RefObject<HTMLElement>}
      aria-label="Introduction"
      className="relative flex flex-col items-center justify-center px-6 text-center"
      style={{ perspective: "1100px", minHeight: `${LAYOUT.heroVh}svh` }}
    >
      {/* The name and the description under it, filling the clearing to
          just inside its edges, the name along the top. Marked so the
          groundhog does not come up on them (three/Groundhog.tsx), and so it
          can be cut out of them when it is carried over (the same).

          Two boxes, not one column: the name is laid over the top, out of the
          flow, and the description is held a fixed distance below its line.
          The glitching faces each have their own height, and in a shared
          column every one of them would knock the description up and down. */}
      <div
        ref={mark}
        data-hero-title=""
        className="absolute will-change-transform"
        style={
          {
            "--name": "clamp(1.6rem,3.4vw,2.6rem)",
            "--pad": "clamp(0.9rem,2vw,1.75rem)",
            left: `calc(${patch.left * 100}% + var(--pad))`,
            right: `calc(${(1 - patch.right) * 100}% + var(--pad))`,
            top: `calc(${patch.top * 100}% + var(--pad))`,
            bottom: `calc(${(1 - patch.bottom) * 100}% + var(--pad))`,
          } as React.CSSProperties
        }
      >
        <h1 className="mark-shadow absolute inset-x-0 top-0 flex justify-center whitespace-nowrap font-display text-[length:var(--name)] font-normal leading-none tracking-tight">
          <Wordmark text={hero.wordmark} start={opened} />
        </h1>
        {/* Kept open for a description, whether or not there is one yet. It
            stays hidden until the grass has cleared, then fades up just after
            the name starts glitching in. */}
        <div
          className={`type-shadow space-y-2.5 pt-[calc(var(--name)+0.9rem)] text-[0.8rem] leading-normal text-ink sm:space-y-3 sm:pt-[calc(var(--name)+1.1rem)] sm:leading-relaxed transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none sm:text-[0.95rem] ${
            opened ? "translate-y-0 opacity-100 delay-500" : "translate-y-1.5 opacity-0"
          }`}
        >
          {hero.description.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
        </div>
        {/* Where to find me — arriving with the description. */}
        <div
          className={`mt-3 flex items-center justify-center gap-5 text-[0.8rem] sm:mt-4 sm:text-sm transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
            opened ? "translate-y-0 opacity-100 delay-700" : "pointer-events-none translate-y-1.5 opacity-0"
          }`}
        >
          <a
            href={hero.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="type-shadow inline-flex items-center gap-1.5 text-ink/90 underline decoration-white/30 underline-offset-4 transition-colors hover:text-bloom hover:decoration-bloom"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M4.2 7.4h2.7V16H4.2zM5.55 3.3a1.55 1.55 0 1 1 0 3.1 1.55 1.55 0 0 1 0-3.1M8.6 7.4h2.6v1.2h.04c.36-.68 1.24-1.4 2.56-1.4 2.74 0 3.24 1.8 3.24 4.14V16h-2.7v-4.2c0-1 0-2.3-1.4-2.3s-1.62 1.1-1.62 2.22V16H8.6z" />
            </svg>
            LinkedIn
          </a>
          <a
            href={`mailto:${hero.email}`}
            className="type-shadow inline-flex items-center gap-1.5 text-ink/90 underline decoration-white/30 underline-offset-4 transition-colors hover:text-bloom hover:decoration-bloom"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.75" y="4.75" width="14.5" height="10.5" rx="1.5" />
              <path d="m3.5 5.75 6.5 5 6.5-5" />
            </svg>
            {hero.email}
          </a>
        </div>
      </div>
    </section>
  );
}
