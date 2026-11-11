import { useEffect, useRef } from "react";
import { clamp, damp } from "./math";

/**
 * The scroll model.
 *
 * The page is a normal document — real sections, real anchors, real text
 * selection — and the 3D scene is a fixed canvas behind it. What ties the two
 * together is a single number: `chapter`, a continuous position along the
 * journey where the integer part is which act you are in and the fraction is
 * how far through it you are. 2.5 means "halfway through the features".
 *
 * Acts are contiguous blocks in document order, so an act's local progress
 * reaches 1 exactly as the next one's reaches 0 and the camera never jumps at
 * a boundary. Measuring the sections rather than assuming their heights is
 * what lets the copy reflow — a longer FAQ answer just means a longer act.
 *
 * Nothing here goes through React state. The scene reads `scrollState` inside
 * useFrame; a store that re-rendered the tree on every scroll event would cost
 * more than the frame it is trying to drive.
 */

export const ACTS = ["hero", "approach", "bloom", "stem", "faq", "out"] as const;
export type ActId = (typeof ACTS)[number];

/** Chapter value at the start of each act — just its index. */
export const ACT_AT: Record<ActId, number> = ACTS.reduce(
  (acc, id, i) => ((acc[id] = i), acc),
  {} as Record<ActId, number>,
);

/** The end of the journey: the last act's local progress reaching 1. */
export const LAST_CHAPTER = ACTS.length;

type Span = { top: number; height: number };

export const scrollState = {
  /** Raw chapter, straight off the scroll position. */
  chapter: 0,
  /** Damped chapter — what the camera actually follows. */
  smooth: 0,
  /** Chapters per second, signed. Used for motion that reacts to travel. */
  velocity: 0,
  ready: false,
};

const spans = new Map<ActId, Span>();
const elements = new Map<ActId, HTMLElement>();

function measure() {
  const scroll = window.scrollY;
  for (const [id, el] of elements) {
    const rect = el.getBoundingClientRect();
    spans.set(id, { top: rect.top + scroll, height: Math.max(1, rect.height) });
  }
  update();
}

function update() {
  const y = window.scrollY;
  let chapter = 0;
  for (let i = 0; i < ACTS.length; i++) {
    const span = spans.get(ACTS[i]);
    if (!span) continue;
    const local = clamp((y - span.top) / span.height);
    chapter = i + local;
    // The act we are inside is the last one whose top we have passed; keep
    // walking so a fully-scrolled act contributes its trailing 1.0 and the
    // next one takes over.
    if (y < span.top + span.height) break;
  }
  scrollState.chapter = clamp(chapter, 0, LAST_CHAPTER);
  scrollState.ready = spans.size > 0;
}

/**
 * Scroll position, in pixels, of a chapter value. The inverse of the mapping
 * above — used to jump straight to a beat while working on it.
 */
export function chapterToScroll(c: number): number {
  const i = Math.max(0, Math.min(ACTS.length - 1, Math.floor(c)));
  const span = spans.get(ACTS[i]);
  if (!span) return 0;
  return span.top + clamp(c - i) * span.height;
}

declare global {
  interface Window {
    __petal?: {
      readonly chapter: number;
      /** Undamped, straight off the scroll position. */
      readonly raw: number;
      /** The measured acts, for checking the model against the document. */
      readonly acts: Array<{ id: string; top: number; height: number }>;
      seek(chapter: number): void;
    };
  }
}

/** Call once, from the app shell. */
export function initScroll(): () => void {
  measure();

  // A handle on the timeline, for working on any beat without scrolling to it:
  //   __petal.seek(1.8)   — mid-descent
  // and `?c=1.8` on the URL does the same on load.
  window.__petal = {
    get chapter() {
      return scrollState.smooth;
    },
    get raw() {
      return scrollState.chapter;
    },
    get acts() {
      return ACTS.map((id) => ({ id, ...(spans.get(id) ?? { top: -1, height: -1 }) }));
    },
    seek(c: number) {
      window.scrollTo({ top: chapterToScroll(c), behavior: "instant" });
      scrollState.smooth = c;
    },
  };
  const requested = Number(new URLSearchParams(location.search).get("c"));
  if (Number.isFinite(requested) && requested > 0) {
    requestAnimationFrame(() => window.__petal?.seek(requested));
  }
  const onScroll = () => update();
  const onResize = () => measure();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(document.body);
  // Fonts land after first paint and change every section's height with them.
  document.fonts?.ready.then(measure).catch(() => {});
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    ro.disconnect();
  };
}

/** Advance the damped chapter. Called once per frame, from the rig. */
export function stepScroll(dt: number) {
  const before = scrollState.smooth;
  // Loose enough that a trackpad flick reads as momentum through the grass,
  // tight enough that the copy and the camera stay on the same beat.
  scrollState.smooth = damp(scrollState.smooth, scrollState.chapter, 7.5, dt);
  // Close enough is arrived: without this the exponential leaves a residue
  // that never quite reaches the target, and a beat keyed to an exact chapter
  // never quite fires.
  if (Math.abs(scrollState.chapter - scrollState.smooth) < 0.0015) {
    scrollState.smooth = scrollState.chapter;
  }
  scrollState.velocity = dt > 0 ? (scrollState.smooth - before) / dt : 0;
}

/** Registers a section as an act. The returned ref goes on that section. */
export function useAct(id: ActId) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    elements.set(id, el);
    measure();
    return () => {
      elements.delete(id);
      spans.delete(id);
    };
  }, [id]);
  return ref;
}

/** Scroll position, in pixels, at the start of an act — used by the nav. */
export function actTop(id: ActId): number {
  return spans.get(id)?.top ?? 0;
}
