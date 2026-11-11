import { chapterToScroll } from "@/lib/scroll";

/**
 * Where the nav actually sends you.
 *
 * An anchor lands on a section's top edge, and for these sections that edge is
 * the moment an act *begins* — a screenful or more before the thing the link is
 * named after is on screen. `#contact` was the worst of it: its section opens
 * with a full viewport of spacer, so clicking the most prominent button on the
 * page put you in an empty field and asked you to scroll again.
 *
 * So the links are aimed at chapters rather than at elements: the beat where
 * the thing named is actually being read. The hrefs stay real, so the page
 * still works without this and the URL still means something.
 */
export const NAV_CHAPTER: Record<string, number> = {
  "#top": 0,
  "#research": 1.28,
  "#experience": 3.1,
};

/** How long the page takes to travel, however far it is going. */
const DURATION = 900;

let running = 0;

/**
 * The scroll is animated here rather than handed to `scrollTo({behavior})`.
 *
 * The native smooth scroll turned out to be cancellable by things this page
 * does constantly — writing the URL fragment killed it outright, and it did not
 * survive the trip across a full document either. Driving it on rAF is a dozen
 * lines, always lands exactly where it was told to, and lets the easing match
 * the rest of the site's motion instead of the browser's.
 */
function glide(to: number) {
  const from = window.scrollY;
  const distance = to - from;
  if (Math.abs(distance) < 2) return;

  const id = ++running;
  const started = performance.now();
  // Ease-in-out cubic: the page is often travelling ten thousand pixels, and a
  // linear run at that distance reads as a jump cut with extra steps.
  const ease = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const step = (now: number) => {
    // A newer call, or the reader taking the wheel back, ends this one.
    if (id !== running) return;
    const t = Math.min(1, (now - started) / DURATION);
    window.scrollTo({ top: from + distance * ease(t), behavior: "instant" });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Stops any glide in progress — called when the reader scrolls themselves. */
export function cancelGlide() {
  running++;
}

/**
 * Click handler for a link into the journey.
 *
 * Modified clicks and anything but the primary button are left alone, so the
 * fragment still means what it says to someone opening it in a new tab. The
 * fragment is deliberately not written to the URL afterwards: writing it
 * cancels an in-flight smooth scroll outright — measured, the scroll simply
 * never starts — and the href on the anchor already carries the meaning.
 */
export function seek(href: string) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (NAV_CHAPTER[href] === undefined) return;
    e.preventDefault();
    seekToHref(href);
  };
}

/** Returns true if it handled the click. */
export function seekToHref(href: string): boolean {
  const chapter = NAV_CHAPTER[href];
  if (chapter === undefined) return false;
  const top = chapterToScroll(chapter);
  if (!Number.isFinite(top)) return false;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cancelGlide();
    window.scrollTo({ top, behavior: "instant" });
  } else {
    glide(top);
  }
  return true;
}
