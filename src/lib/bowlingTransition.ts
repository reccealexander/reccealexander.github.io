/**
 * The trip to the bowling alley.
 *
 * Going there is not a cut: a groundhog the size of the screen slides in from
 * the right, head first, and covers the page; the alley is put up behind it
 * while it holds there; and it slides on off the left, the alley appearing
 * behind it as it goes (see ui/BowlingTransition.tsx). This is the state the
 * two sides share — the overlay that draws it, the menu that starts it, and
 * the bowling page, which says when it has drawn its first frames and so is
 * ready to be seen.
 */
export type BowlingPhase = "idle" | "in" | "hold" | "out";

export const bowlingTransition = {
  phase: "idle" as BowlingPhase,
  ready: false,
};

const listeners = new Set<() => void>();
function set(phase: BowlingPhase) {
  if (bowlingTransition.phase === phase) return;
  bowlingTransition.phase = phase;
  listeners.forEach((l) => l());
}

export function subscribeBowlingTransition(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const bowlingPhase = () => bowlingTransition.phase;

/** Start the trip: slide in and cover. */
export function startBowlingTransition() {
  if (bowlingTransition.phase !== "idle") return;
  bowlingTransition.ready = false;
  set("in");
}

/** Arriving straight at the alley's address: begin already covering it. */
export function holdForBowling() {
  if (bowlingTransition.phase !== "idle") return;
  set("hold");
}

export const setBowlingPhase = set;

/** Called by the bowling page once it has drawn. */
export function markBowlingReady() {
  bowlingTransition.ready = true;
}

/** Called by the bowling page on its way out, so the next trip waits again. */
export function resetBowlingReady() {
  bowlingTransition.ready = false;
}
