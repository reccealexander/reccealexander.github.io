export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Inverse lerp, clamped — the workhorse for "how far into this beat are we". */
export const remap = (v: number, a: number, b: number) =>
  a === b ? 0 : clamp((v - a) / (b - a));

export const smoothstep = (a: number, b: number, v: number) => {
  const t = remap(v, a, b);
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Framerate-independent exponential approach. `lambda` is roughly "how many
 * e-foldings per second", so the same call settles identically at 60 and at
 * 144 Hz — a plain `+= (target - v) * 0.1` does not.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Deterministic hash → [0,1). Seeded scatter has to survive a reload. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** A small seeded PRNG, so every field of grass is the same field on reload. */
export function makeRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export type Key = { at: number; v: number };

/**
 * Monotone cubic Hermite (Fritsch–Carlson) over irregularly spaced keys.
 *
 * Camera motion is sampled from this rather than from per-segment easing on
 * purpose: easing every segment forces velocity to zero at every key, and that
 * stutter — eight visible stops on the way down — is what reads as mechanical.
 * Hermite tangents make velocity continuous through the keys, and the monotone
 * clamp keeps a slow key next to a fast one from overshooting past either.
 */
export function hermite(keys: Key[], x: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (x <= keys[0].at) return keys[0].v;
  if (x >= keys[n - 1].at) return keys[n - 1].v;

  let i = 0;
  while (i < n - 2 && x > keys[i + 1].at) i++;

  const h = keys[i + 1].at - keys[i].at;

  const slope = (j: number): number => {
    if (j === 0) return (keys[1].v - keys[0].v) / (keys[1].at - keys[0].at);
    if (j === n - 1)
      return (keys[n - 1].v - keys[n - 2].v) / (keys[n - 1].at - keys[n - 2].at);
    const hPrev = keys[j].at - keys[j - 1].at;
    const hNext = keys[j + 1].at - keys[j].at;
    const dPrev = (keys[j].v - keys[j - 1].v) / hPrev;
    const dNext = (keys[j + 1].v - keys[j].v) / hNext;
    // A key that is a local extremum gets a flat tangent; anything else would
    // make the curve bulge past a value the keys never asked for.
    if (dPrev * dNext <= 0) return 0;
    const w1 = 2 * hNext + hPrev;
    const w2 = hNext + 2 * hPrev;
    return (w1 + w2) / (w1 / dPrev + w2 / dNext);
  };

  const m0 = slope(i);
  const m1 = slope(i + 1);
  const t = (x - keys[i].at) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  return (
    (2 * t3 - 3 * t2 + 1) * keys[i].v +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * keys[i + 1].v +
    (t3 - t2) * h * m1
  );
}
