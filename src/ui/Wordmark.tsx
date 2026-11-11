import { useEffect, useLayoutEffect, useRef } from "react";
import { reducedMotion } from "@/three/quality";

/**
 * The name, arriving one letter at a time out of the wrong typefaces.
 *
 * Every glyph cycles through a stack of faces at speed and then, in a random
 * order, drops into the display face it was always going to be. It reads as a
 * sign settling rather than as text appearing, which is the one thing the hero
 * still does now that there is nothing else on it.
 *
 * Three details are what stop it looking cheap:
 *
 *  - Each letter is measured in its *final* face and pinned to that width
 *    before the cycling starts. Faces have wildly different advance widths, so
 *    unpinned the whole line shivers sideways on every tick and the two words
 *    end the animation somewhere other than where they started.
 *  - Letters settle on random draws from a shuffled order, not left to right. A
 *    sequential settle is a typewriter, which is a different and much more
 *    familiar effect.
 *  - The cycling face is never the final one. A glyph that lands early by luck
 *    and then leaves again reads as a mistake rather than as churn.
 */

/*
 * Faces to churn through, and only stock ones.
 *
 * The page loads exactly two families and this animation is over in a second
 * and a half; fetching four more for it would put a network request on the
 * critical path of the first thing anybody sees. These are all resident on
 * every platform the site runs on, and they are chosen to be as unlike each
 * other as the local set allows — a slab, a grotesque, a mono, a condensed —
 * because what sells the effect is the *difference* between frames.
 */
const FACES = [
  "Georgia, serif",
  "'Times New Roman', Times, serif",
  "'Courier New', ui-monospace, monospace",
  "Verdana, Geneva, sans-serif",
  "'Arial Black', Impact, sans-serif",
  "'Trebuchet MS', sans-serif",
  "Palatino, 'Palatino Linotype', serif",
  "ui-monospace, 'SF Mono', Menlo, monospace",
];

/** How long a glyph holds one face before switching, in ms. */
const TICK = 55;
/** When the first and last letters land. */
const FIRST_LAND = 420;
const LAST_LAND = 1500;

export default function Wordmark({ text }: { text: string }) {
  const host = useRef<HTMLSpanElement>(null);

  /*
   * Widths first, in the real face, before anything moves.
   *
   * Layout effect rather than effect: this has to run in the same frame the
   * spans are first laid out, or the reader gets one painted frame of unpinned
   * type and the line jumps as the animation starts.
   */
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const letters = Array.from(el.querySelectorAll<HTMLElement>("[data-letter]"));
    /*
     * Fonts land after first paint and change every one of these, so this runs
     * twice: once now against whatever is on screen, and again when the display
     * face has actually arrived.
     *
     * The second pass is why the face is cleared before measuring. It fires in
     * the middle of the animation, when most of these spans are showing a
     * substitute — measured then, half the line gets pinned to the advance
     * width of Courier or Arial Black and keeps it for good, which is exactly
     * the ragged spacing this was supposed to prevent. Reads are batched ahead
     * of writes for the usual reason.
     */
    const pin = () => {
      const faces = letters.map((s) => s.style.fontFamily);
      for (const span of letters) {
        span.style.fontFamily = "";
        span.style.width = "";
      }
      const widths = letters.map((s) => s.getBoundingClientRect().width);
      letters.forEach((span, i) => {
        span.style.width = `${widths[i].toFixed(2)}px`;
        span.style.fontFamily = faces[i];
      });
    };
    pin();
    let cancelled = false;
    document.fonts?.ready.then(() => !cancelled && pin()).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [text]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const letters = Array.from(el.querySelectorAll<HTMLElement>("[data-letter]"));
    if (letters.length === 0) return;

    // Reduced motion gets the finished sign, not a slower glitch. The whole
    // point of the effect is rapid substitution, which is the thing being
    // asked for less of.
    if (reducedMotion()) {
      for (const span of letters) span.style.fontFamily = "";
      return;
    }

    // A shuffled landing order, spread over the window. Shuffling the letters
    // and then handing out ascending times is what makes the order random and
    // the pacing even; drawing a random time per letter clumps them.
    const order = letters.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const landAt = new Array<number>(letters.length);
    order.forEach((letter, place) => {
      const spread = place / Math.max(1, order.length - 1);
      landAt[letter] = FIRST_LAND + (LAST_LAND - FIRST_LAND) * spread;
    });

    const start = performance.now();
    // A face per letter, stepped rather than redrawn at random every tick: two
    // neighbours landing on the same face for one frame reads as a word, and
    // the eye catches it.
    const seed = letters.map(() => Math.floor(Math.random() * FACES.length));
    let raf = 0;
    let lastTick = 0;

    const step = (now: number) => {
      const t = now - start;
      let running = false;
      if (t - lastTick >= TICK) {
        lastTick = t;
        letters.forEach((span, i) => {
          if (t >= landAt[i]) {
            if (span.style.fontFamily) span.style.fontFamily = "";
            return;
          }
          running = true;
          seed[i] = (seed[i] + 1 + Math.floor(Math.random() * 3)) % FACES.length;
          span.style.fontFamily = FACES[seed[i]];
        });
      } else {
        running = t < LAST_LAND;
      }
      if (running) raf = requestAnimationFrame(step);
      else for (const span of letters) span.style.fontFamily = "";
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      for (const span of letters) span.style.fontFamily = "";
    };
  }, [text]);

  return (
    // The name is one string to a screen reader and to anyone selecting it; the
    // per-glyph spans are presentational only.
    <span ref={host} aria-label={text}>
      {Array.from(text).map((ch, i) =>
        ch === " " ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} aria-hidden="true">
            &nbsp;
          </span>
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <span
            key={i}
            data-letter=""
            aria-hidden="true"
            className="inline-block text-center align-baseline"
          >
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
