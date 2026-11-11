import { useEffect, useRef } from "react";
import { scrollState, stepScroll } from "@/lib/scroll";

/**
 * One animation frame loop for the whole document.
 *
 * Everything in the DOM that answers the scroll — a card fading up as its
 * station passes, the hero tipping back, the scale readout counting down —
 * subscribes here and writes straight to style. None of it goes through React
 * state: sixty re-renders a second of a tree this size would cost more than
 * the frame it is trying to keep.
 */

type Sub = (chapter: number) => void;

const subs = new Set<Sub>();
let frame = 0;
let last = 0;

/*
 * This loop, not the render loop, is what advances the journey.
 *
 * The damped chapter used to be stepped inside the scene's `useFrame`, which
 * makes every word on the page a function of how fast the GPU is drawing
 * grass: on anything slow the copy fell as much as two screens behind the
 * scroll, and the words and the picture came apart with no floor on how far.
 * Here it is stepped on the document's own frame and the scene reads the
 * result, so a scene that cannot keep up falls behind the copy rather than
 * dragging it along.
 */
function tick(now: number) {
  // Capped, not clamped tight. The exponential in `damp` is frame-rate
  // independent only if it is given the real elapsed time; pinning dt to a
  // sixtieth means a page running at two frames a second catches up at a
  // thirtieth of the rate it should, and the copy sits visibly behind the
  // scroll. The cap is only here so a tab returning from the background does
  // not jump the whole journey in one step.
  const dt = last ? Math.min(0.25, (now - last) / 1000) : 0.016;
  last = now;
  stepScroll(dt);
  for (const fn of subs) fn(scrollState.smooth);
  frame = requestAnimationFrame(tick);
}

export function useJourney(fn: Sub) {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    const sub: Sub = (c) => latest.current(c);
    subs.add(sub);
    // Started once and never stopped.
    //
    // It used to shut the loop down whenever the last subscriber left, which
    // is tidy and also a trap: React mounts, unmounts and remounts effects, and
    // any ordering where the cancel lands after the restart leaves the loop
    // dead with every subscriber still in the set. The symptom is the whole
    // document freezing on whatever opacity it last had while the scene
    // carries on — the copy and the picture silently decouple. One rAF that
    // walks an empty set costs nothing.
    if (!frame) frame = requestAnimationFrame(tick);
    return () => {
      subs.delete(sub);
    };
  }, []);
}
