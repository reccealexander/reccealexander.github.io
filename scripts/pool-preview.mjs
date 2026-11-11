/**
 * The pools of sun, drawn as the camera sees them, without a browser.
 *
 * three/sunlight.ts exports the same field twice — once as GLSL for the scene
 * and once as TypeScript — and this is what the second one is for. Casting the
 * journey's own camera at the canopy plane and printing `sunPool` over it turns
 * a thirty-second round trip through headless Chrome into an instant one, which
 * is the difference between placing this by measurement and placing it by
 * guesswork. The boxes are where the hero's type actually lands.
 *
 * A chapter may be given, because the second pool exists as much for the last
 * third of the journey as for the hero and placing it from the hero alone is
 * how the first one ended up lighting nothing after chapter three.
 *
 *   npx tsx scripts/pool-preview.mjs [chapter]
 *   node --experimental-strip-types scripts/pool-preview.mjs 4.4
 */
import { register } from "node:module";

/*
 * The journey is written for a bundler, so its imports carry no extension and
 * node cannot resolve them. Rather than keep a second copy of the camera keys
 * in here — which is the version of this that silently goes stale the first
 * time a keyframe moves — the resolver is taught to try `.ts` before giving up.
 * Static imports are resolved before any statement runs, so the two modules
 * below have to be pulled in dynamically, after this.
 */
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(spec, ctx, next) {
      try { return await next(spec, ctx); }
      catch (err) {
        if (spec.startsWith(".") && !/\\.[a-z]+$/.test(spec)) return next(spec + ".ts", ctx);
        throw err;
      }
    }`),
  import.meta.url,
);

const { sunPool } = await import("../src/three/sunlight.ts");
const { sampleCamera } = await import("../src/lib/journey.ts");

const CHAPTER = Number(process.argv[2] ?? 0);

const W = 120;
const H = 46;
const cam = sampleCamera(CHAPTER);
const POS = [cam.pos.x, cam.pos.y, cam.pos.z];
const TARGET = [cam.target.x, cam.target.y, cam.target.z];
const FOV = cam.fov;
const ASPECT = 1440 / 900;
/*
 * Not the soil: what a camera above the field sees is the canopy. Once the lens
 * is down inside the field that is no longer true — it is looking along the
 * canopy rather than down onto it — so the plane it is cast at comes down with
 * it, and everything past the horizon that plane makes is simply off the top of
 * the picture, which is exactly what it is on screen too.
 */
const CANOPY = Math.min(0.24, Math.max(0.02, POS[1] - 0.06));

// The hero's type, in 1440x900 pixels, as measured off the live page.
const TYPE = [
  ["eyebrow", 640, 168, 160, 16],
  ["wordmark", 556, 204, 328, 106],
  ["tagline", 458, 350, 525, 41],
  ["body", 458, 412, 525, 78],
  ["cta", 556, 538, 328, 44],
  ["requirements", 458, 610, 525, 16],
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const fwd = norm(sub(TARGET, POS));
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const tanV = Math.tan((FOV * Math.PI) / 360);
const tanH = tanV * ASPECT;

/** Where the pixel at these normalised device coordinates meets the canopy. */
function hit(ndcX, ndcY) {
  const d = [
    fwd[0] + right[0] * ndcX * tanH + up[0] * ndcY * tanV,
    fwd[1] + right[1] * ndcX * tanH + up[1] * ndcY * tanV,
    fwd[2] + right[2] * ndcX * tanH + up[2] * ndcY * tanV,
  ];
  const t = (CANOPY - POS[1]) / d[1];
  if (t <= 0) return null;
  return [POS[0] + d[0] * t, POS[2] + d[2] * t];
}

const RAMP = " ·:-=+*#%@";
const rows = [];
let sum = 0;
let n = 0;
for (let j = 0; j < H; j++) {
  let line = "";
  for (let i = 0; i < W; i++) {
    const ndcX = ((i + 0.5) / W) * 2 - 1;
    const ndcY = 1 - ((j + 0.5) / H) * 2;
    const p = hit(ndcX, ndcY);
    const v = p ? sunPool(p[0], p[1]) : 0;
    sum += v;
    n++;
    const px = ((ndcX + 1) / 2) * 1440;
    const py = ((1 - ndcY) / 2) * 900;
    const onType = TYPE.some(
      ([, x, y, w, h]) => px >= x && px <= x + w && py >= y && py <= y + h,
    );
    const ch = RAMP[Math.min(9, Math.floor(v * 10))];
    line += onType && ch === " " ? "." : onType ? `\x1b[41m${ch}\x1b[0m` : ch;
  }
  rows.push(line);
}

console.log(rows.join("\n"));
console.log(
  `\nchapter ${CHAPTER}  eye ${POS.map((v) => v.toFixed(2)).join(",")}  plane y=${CANOPY.toFixed(2)}`,
);
console.log(`mean pool over the frame: ${(sum / n).toFixed(3)}`);
if (CHAPTER > 0.8) process.exit(0);
console.log("red cells are pixels the hero's own type sits on.");

// ...and the worst of it under each block, which is the number that decides
// whether this ships.
for (const [name, x, y, w, h] of TYPE) {
  let hi = 0;
  let tot = 0;
  let c = 0;
  for (let py = y; py <= y + h; py += 2) {
    for (let px = x; px <= x + w; px += 4) {
      const p = hit((px / 1440) * 2 - 1, 1 - (py / 900) * 2);
      const v = p ? sunPool(p[0], p[1]) : 0;
      hi = Math.max(hi, v);
      tot += v;
      c++;
    }
  }
  console.log(`${name.padEnd(14)} peak ${hi.toFixed(3)}   mean ${(tot / c).toFixed(3)}`);
}
