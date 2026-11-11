import { plantField } from "./zz-field.mjs";
import { BIOMES } from "./zz-biomes.mjs";
import { sampleCamera } from "./zz-journey.mjs";

const biome = BIOMES.find((b) => b.id === "meadow") ?? BIOMES[0];
for (const clumps of [23000, 12500, 5200]) {
  const { blades } = plantField(clumps, biome);
  console.log(`\n=== ${clumps} clumps -> ${blades.length} blades ===`);
  const cams = [];
  for (let c = 1.9; c <= 4.45; c += 0.02) cams.push({ c, p: sampleCamera(c).pos.clone() });
  const hits = [];
  for (const b of blades) {
    for (const k of cams) {
      const d = Math.hypot(b.x - k.p.x, b.z - k.p.z);
      // A blade can only reach the lens if its arc can carry a tip that high.
      if (d < 0.18 && b.y + b.height > k.p.y - 0.02) {
        hits.push({ d, c: k.c, b, camY: k.p.y });
        break;
      }
    }
  }
  hits.sort((a, x) => a.d - x.d);
  console.log(`${hits.length} blades rooted within 18cm of the lens with a tip at or above it`);
  for (const h of hits.slice(0, 14)) {
    console.log(
      `  d=${h.d.toFixed(3)}m at c=${h.c.toFixed(2)}  root y=${h.b.y.toFixed(3)} h=${h.b.height.toFixed(3)} ` +
        `tip=${(h.b.y + h.b.height).toFixed(3)}  camY=${h.camY.toFixed(3)}  halfW=${h.b.halfWidth.toFixed(4)}`,
    );
  }
}
