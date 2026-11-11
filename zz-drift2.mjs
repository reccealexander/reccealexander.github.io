import { sampleCamera } from "./zz-journey.mjs";
import { Vector3, PerspectiveCamera } from "three";

function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const clamp = (v,a=0,b=1)=> v<a?a:v>b?b:v;

const count = Number(process.argv[2] ?? 18);
const [VW, VH] = (process.argv[3] ?? "1440x900").split("x").map(Number);
const rnd = makeRandom(551);
const accents = 5;
const flakes = Array.from({ length: count }, () => ({
  x: 0.3 + (rnd() - 0.5) * 5,
  y: 0.15 + Math.pow(rnd(), 1.4) * 1.1,
  z: 0.8 + 1.4 + (rnd() - 0.5) * 5,
  scale: 0.7 + rnd() * 1.4,
  spin: (rnd() - 0.5) * 1.4,
  phase: rnd() * Math.PI * 2,
  drift: 0.5 + rnd() * 0.8,
  color: (rnd() * accents) | 0,
}));

const cam = new PerspectiveCamera(42, VW / VH, 0.02, 60);
const aspect = VW / VH;
const cams = [];
for (let c = 1.9; c <= 4.45; c += 0.02) {
  const s = sampleCamera(c);
  cam.position.copy(s.pos);
  const range = cam.position.distanceTo(s.target);
  const closeUp = 1 - clamp((range - 1.2) / 1.4);
  const pull = aspect < 1.45 ? 1 + (Math.min(1.45 / Math.max(aspect, 0.35), 2.3) - 1) * closeUp : 1;
  if (pull > 1.001) cam.position.sub(s.target).multiplyScalar(pull).add(s.target);
  cams.push({ c, p: cam.position.clone(), fov: s.fov });
}

let worst = { d: 1e9 };
for (let i = 0; i < flakes.length; i++) {
  const f = flakes[i];
  let best = { d: 1e9 };
  for (let t = 0; t < 400; t += 0.05) {
    const fall = ((t * 0.045 * f.drift + f.phase) % 1.25) * 1.25;
    const p = new Vector3(
      f.x + Math.sin(t * 0.5 * f.drift + f.phase) * 0.12,
      f.y + 1.25 - fall,
      f.z + Math.cos(t * 0.37 * f.drift + f.phase) * 0.12,
    );
    for (const k of cams) {
      const d = p.distanceTo(k.p);
      if (d < best.d) best = { d, c: k.c, t, p: p.clone() };
    }
  }
  // How much of the frame a 3.6x2cm petal, scaled, spans at that range.
  const halfH = best.d * Math.tan((44 * Math.PI) / 360);
  const span = 0.036 * f.scale;
  console.log(
    `flake ${String(i).padStart(2)} colour#${f.color} scale=${f.scale.toFixed(2)}  ` +
      `min 3D distance to lens = ${best.d.toFixed(3)}m at c=${best.c.toFixed(2)}, t=${best.t.toFixed(1)}s  ` +
      `petal spans ${(span / (2 * halfH) * 100).toFixed(0)}% of frame height`,
  );
  if (best.d < worst.d) worst = { ...best, i };
}
console.log(`\nclosest of all: flake ${worst.i} at ${worst.d.toFixed(3)}m, chapter ${worst.c.toFixed(2)}`);
