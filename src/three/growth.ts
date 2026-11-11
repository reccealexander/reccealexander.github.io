import { reducedMotion } from "./quality";

/**
 * Plants coming up out of the ground when the biome changes.
 *
 * Switching biome replants the entire field — a different species, a different
 * palette, a different number of things standing in a different arrangement.
 * Done plainly that is a cut: one frame of meadow, the next frame of forest,
 * and what the reader sees is not a place changing but a page redrawing. The
 * 2D site answers this by growing its field in, and it is the single cheapest
 * thing that makes a swap read as a swap rather than as a reload.
 *
 * The clock is a module-level timestamp rather than React state on purpose.
 * Every plant family wants the same number in the same frame, and threading it
 * through context would mean a re-render of eight instanced meshes on every
 * animation frame to move one float. Materials read it in their own `useFrame`
 * and write it into their own uniform.
 *
 * It is a timestamp and not an accumulator, which is what keeps the families in
 * step without any of them having to run in a particular order: each one
 * computes the same `(now - started) / RUN` from the same clock, so a family
 * whose frame callback happens to run last is not a frame behind the rest.
 */

/**
 * How long a full changeover takes, in milliseconds.
 *
 * Slower than it was, and the stagger below is what makes the extra time worth
 * spending: the run is not one plant's growth held longer, it is the wave
 * crossing the field more slowly, so the last plant to come up is now well over
 * a second behind the first. At the old pace the whole field arrived close
 * enough to together that the sweep read as a single push from underneath.
 *
 * It also buys back the replant. Changing biome blocks the main thread for
 * about 150 ms before the first frame can be drawn, and that time comes out of
 * the run — a fixed cost, so it was an eighth of the animation and is now a
 * fourteenth.
 */
const RUN = 2100;

/**
 * Armed from the start, so the field comes up on first load as well as on a
 * switch.
 *
 * This used to sit far in the past, which made the opening frame fully grown —
 * on the reasoning that the hero already has the petal's flight arriving over
 * it and did not need a second thing moving. That was the wrong call. The
 * grow-in and the petal are not competing: the petal crosses the frame in front
 * of copy that is still fading up, and the field coming up underneath both of
 * them is the same gesture the 2D site opens with.
 *
 * `pending` rather than a timestamp, for exactly the reason the switch needs
 * it: the first field is planted before the first frame can be drawn, and a
 * clock started at module load would have spent most of its run against a blank
 * canvas.
 */
let started = 0;

/**
 * Armed, but not yet ticking.
 *
 * The clock cannot start when the biome changes, which is the obvious place and
 * is wrong. Changing biome replants every family — tens of thousands of
 * instances, their attributes filled on the CPU — and that work happens
 * synchronously between the click and the first frame that could show any of
 * it. Started at the click, the run was over before a single frame of it was
 * drawn: photographed at 90 ms after the click, the new field was already
 * standing at full height.
 *
 * So the click only arms it, and the first frame that asks starts it. Whichever
 * material gets there first sets the clock and every other material in that
 * same frame reads the same near-zero from it, which is exactly the behaviour
 * the shared-timestamp design was for.
 */
let pending = true;

/** Arm a changeover. Called when the biome actually changes, and nowhere else. */
export function restartGrowth(): void {
  pending = true;
}

/** How far through the changeover we are, 0..1. */
export function growth(now = performance.now()): number {
  // A reader who has asked for less movement gets the new field already
  // standing. The swap still happens; it simply does not perform.
  if (reducedMotion()) {
    pending = false;
    return 1;
  }
  if (pending) {
    pending = false;
    started = now;
  }
  const t = (now - started) / RUN;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/**
 * Hold the changeover at a fixed point, for the harness.
 *
 * Photographing this by wall clock does not work — a screenshot costs more than
 * a tenth of the run, so the frames come out drifted and unevenly spaced, and
 * telling a broken grow-in from a badly timed one is guesswork. This lets the
 * harness ask for exactly half grown and then take as long as it likes.
 */
if (typeof window !== "undefined") {
  (window as unknown as { __grow?: unknown }).__grow = {
    hold: (t: number) => {
      pending = false;
      started = performance.now() - t * RUN;
    },
    // Deliberately does not call growth(): asking would start the clock, and a
    // probe that changes what it is measuring is worse than no probe.
    at: () => (pending ? 0 : growth()),
  };
}

/**
 * Whether a grow-in has run and finished. Unlike `growing()` this never starts
 * the clock, so background work can ask it without changing what it measures.
 */
export function settled(now = performance.now()): boolean {
  return !pending && growth(now) >= 1;
}

/** Whether anything is still moving — lets a material skip the uniform write. */
export function growing(now = performance.now()): boolean {
  return growth(now) < 1;
}

/**
 * The same thing in GLSL.
 *
 * Exports `growAt(float, float)`: the changeover's progress and this plant's
 * own place in the queue, in and an eased 0..1 out.
 *
 * The stagger is what makes it a wave rather than a curtain. Everything coming
 * up at once is a scale on the whole field, which reads as the field being
 * pushed up from underneath in one piece; spread over the run it reads as
 * ground being taken plant by plant. `SPAN` is how much of the run is spent
 * queueing — at zero it is a curtain, at one the last plant only starts as the
 * first finishes and the whole thing feels slack.
 */
export const GROWTH_GLSL = /* glsl */ `
float growAt(float g, float stagger) {
  const float SPAN = 0.55;
  float t = clamp((g - stagger * SPAN) / (1.0 - SPAN), 0.0, 1.0);
  // Smoothstep in, but weighted so a plant leaves the ground quickly and takes
  // its time settling into its last few percent. A linear rise reads as a
  // machine part travelling; this reads as something unfolding.
  t = t * t * (3.0 - 2.0 * t);
  return t * (1.0 + 0.06 * (1.0 - t) * 4.0);
}

/**
 * Where a plant stands in the queue, from where it is rooted.
 *
 * Outward from the camera's dwell, so the change starts under the reader's eye
 * and runs away to the horizon. The other direction was tried and is worse:
 * beginning at the far edge means the first half of the animation happens in
 * the part of the frame nobody is looking at, and the near field — which is
 * most of the picture — all arrives at once at the end.
 */
float growStagger(vec2 xz) {
  return clamp(length(xz - vec2(0.0, -1.5)) / 9.0, 0.0, 1.0);
}
`;
