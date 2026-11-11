import { sampleCamera } from "./zz-journey.mjs";
import { Vector3, PerspectiveCamera } from "three";

function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const clamp = (v,a=0,b=1)=> v<a?a:v>b?b:v;

for (const count of [18, 8]) {
  const rnd = makeRandom(551);
  const flakes = Array.from({ length: count }, () => ({
    x: 0.3 + (rnd() - 0.5) * 5,
    y: 0.15 + Math.pow(rnd(), 1.4) * 1.1,
    z: 0.8 + 1.4 + (rnd() - 0.5) * 5,
    scale: 0.7 + rnd() * 1.4,
    spin: (rnd() - 0.5) * 1.4,
    phase: rnd() * Math.PI * 2,
    drift: 0.5 + rnd() * 0.8,
    color: 0,
  }));
  rnd; // colours consume one more each above
  console.log(`\n=== ${count} flakes ===`);
  // camera path through chapters 1.9..4.4, desktop
  const cams = [];
  const cam = new PerspectiveCamera(42, 1440/900, 0.02, 60);
  for (let c = 1.9; c <= 4.4; c += 0.01) {
    const s = sampleCamera(c);
    cams.push({ c, p: s.pos.clone(), t: s.target.clone() });
  }
  for (const f of flakes) {
    // horizontal distance from the camera path, at the flake's closest approach
    let best = 1e9, bc = 0;
    for (const k of cams) {
      const dx = f.x - k.p.x, dz = f.z - k.p.z;
      const d = Math.hypot(dx, dz);
      if (d < best) { best = d; bc = k.c; }
    }
    const period = 1.25 / (0.045 * f.drift);
    console.log(
      `flake x=${f.x.toFixed(3)} z=${f.z.toFixed(3)} y0=${f.y.toFixed(3)} scale=${f.scale.toFixed(2)} ` +
      `minXZdist=${best.toFixed(3)}m at c=${bc.toFixed(2)}  fallPeriod=${period.toFixed(1)}s ` +
      `yRange=[${(f.y-0.3125).toFixed(2)}, ${(f.y+1.25).toFixed(2)}]`
    );
  }
}
