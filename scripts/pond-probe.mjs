/**
 * What the pond costs and how much of it is under blossom.
 *
 * Three numbers, taken off the real page in the real browser, because the three
 * things this biome is being pulled between — petals, the reflection and the
 * koi — are all *screen* facts and none of them can be read off the source.
 *
 *   node scripts/pond-probe.mjs [tag] [chapter]
 *
 * Coverage is classified by hue rather than by a second render pass, and the
 * rule is chosen so nothing else in this frame can be mistaken for blossom:
 * a petal is pink, which here means red over blue over green. Water is blue
 * over red; the reflected canopy, the bark, the koi's crimson and the sun's
 * sparks are all warm, which is green over blue. So the three-way order
 * r > b > g belongs to the blossom alone.
 *
 * The only brightness in the test is a floor to keep the near-black corners
 * out. It used to be much higher, and a high one measures the palette instead
 * of the covering: pitching the blossom down for the sake of the hero's copy
 * took twelve points off a number that is supposed to count petals.
 *
 * The DOM is hidden first, so the wordmark's pink <img> and the yellow download
 * button are not in the picture being classified.
 */
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const TAG = process.argv[2] ?? "probe";
const CHAPTER = Number(process.argv[3] ?? 0.05);
/** The snapshot server from scripts/pond-snap.sh, not the shared one. */
const URL = process.env.PROBE_URL ?? "http://localhost:5311/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "shots/probe";

/** The band of the 1440x900 hero that is water: under the canopy, over the bank. */
const BAND = { top: 210, bottom: 800 };
/** The near half of that, which is the water big enough on screen to read. */
const NEAR = { top: 520, bottom: 800 };

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // Off the vsync clock. At 120 Hz every version of this scene measures 8.3 ms
  // and the number means nothing; unclamped, the frame time is the frame's own
  // cost and a change in it is a change in the work.
  args: [
    "--hide-scrollbars",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
    "--disable-features=CalculateNativeWinOcclusion",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const problems = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") problems.push(`[${t}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

// Reloaded until the picker is there. Another agent is editing this tree while
// this runs, and a page loaded in the middle of a hot update is a blank scene —
// which in a measurement is indistinguishable from the thing being measured.
let picked = false;
for (let attempt = 0; attempt < 40 && !picked; attempt++) {
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  await new Promise((r) => setTimeout(r, 3500));
  if (!(await page.evaluate(() => !!document.querySelector('button[aria-haspopup="menu"]')))) {
    problems.length = 0;
    await new Promise((r) => setTimeout(r, 4000));
    continue;
  }
  await page.click('button[aria-haspopup="menu"]');
  await new Promise((r) => setTimeout(r, 300));
  picked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="menuitemradio"]')];
    const row = rows.find((r) => r.textContent.toLowerCase().includes("pond"));
    if (!row) return false;
    row.click();
    return true;
  });
}
if (!picked) {
  console.error("no pond row after six tries — the tree is probably mid-edit");
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate((c) => window.__petal?.seek(c), CHAPTER);
await new Promise((r) => setTimeout(r, 2000));

// Frame time, off the page's own clock. The median, not the mean: one hitch
// from a garbage collection would otherwise decide the answer.
const timing = await page.evaluate(
  () =>
    new Promise((done) => {
      const gaps = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        if (n > 10) gaps.push(now - last);
        last = now;
        if (++n < 190) requestAnimationFrame(tick);
        else {
          gaps.sort((a, b) => a - b);
          done({
            median: gaps[gaps.length >> 1],
            p90: gaps[Math.floor(gaps.length * 0.9)],
            frames: gaps.length,
          });
        }
      };
      requestAnimationFrame(tick);
    }),
);

// Where the hero's type is, taken before it is hidden. The pond is now half
// under pale blossom and the copy sits on it with no scrim, so every change
// that brightens this frame is a legibility change and has to be read as one.
const typeBoxes = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("#top h1, #top p, #top a")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    out.push({ x: r.x, y: r.y, w: r.width, h: r.height, large: size >= 24 });
  }
  return out;
});

// The scene alone. Everything the document paints is hidden rather than
// removed, so nothing relayouts and the canvas keeps its size.
await page.evaluate(() => {
  const root = document.querySelector("#root") ?? document.body;
  for (const el of [...root.children, ...document.body.children]) {
    if (el.querySelector?.("canvas") || el.tagName === "CANVAS") continue;
    el.style.visibility = "hidden";
  }
});
await new Promise((r) => setTimeout(r, 900));

const shot = await page.screenshot({ encoding: "base64" });
await writeFile(`${OUT}/${TAG}.png`, Buffer.from(shot, "base64"));

const stats = await page.evaluate(
  async (b64, BAND, NEAR, TYPE) =>
    new Promise((done) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const zone = (top, bottom) => {
          let petal = 0;
          let total = 0;
          let lum = 0;
          for (let y = top; y < bottom; y++) {
            for (let x = 0; x < c.width; x++) {
              const i = (y * c.width + x) * 4;
              const r = d[i];
              const gg = d[i + 1];
              const bb = d[i + 2];
              total++;
              lum += 0.2126 * r + 0.7152 * gg + 0.0722 * bb;
              if (r > 50 && bb > gg && r > bb) petal++;
            }
          }
          return { pct: (100 * petal) / total, lum: lum / total };
        };
        // Whole-frame mean luminance, which is the number the hero's near-white
        // type has to stay legible against.
        let all = 0;
        for (let i = 0; i < d.length; i += 4)
          all += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        // The backdrop under the type, as a contrast ratio against the colour
        // the ink is *specified* as — #f5f2ed, whose relative luminance is
        // 0.890. Reported at the ninety-fifth percentile of the backdrop rather
        // than at its mean: what fails a line of copy is the one pale petal
        // under a stroke, not the average of the box.
        const lin = (c) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const INK = 0.890;
        const boxes = [];
        for (const b of TYPE) {
          const ls = [];
          for (let y = Math.max(0, b.y | 0); y < Math.min(c.height, b.y + b.h); y++) {
            for (let x = Math.max(0, b.x | 0); x < Math.min(c.width, b.x + b.w); x++) {
              const i = (y * c.width + x) * 4;
              ls.push(
                0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]),
              );
            }
          }
          if (!ls.length) continue;
          ls.sort((p, q) => p - q);
          const at = (f) => ls[Math.floor(f * (ls.length - 1))];
          boxes.push({
            large: b.large,
            mean: (INK + 0.05) / (ls.reduce((s, v) => s + v, 0) / ls.length + 0.05),
            p95: (INK + 0.05) / (at(0.95) + 0.05),
          });
        }
        done({
          band: zone(BAND.top, BAND.bottom),
          near: zone(NEAR.top, NEAR.bottom),
          frameLum: all / (d.length / 4),
          type: {
            worstMean: Math.min(...boxes.map((b) => b.mean)),
            worstP95: Math.min(...boxes.map((b) => b.p95)),
            failing: boxes.filter((b) => b.p95 < (b.large ? 3 : 4.5)).length,
            boxes: boxes.length,
          },
        });
      };
      img.src = "data:image/png;base64," + b64;
    }),
  shot,
  BAND,
  NEAR,
  typeBoxes,
);

const counts = await page.evaluate(() => window.__pondCounts ?? null);

console.log(`\n${TAG}  chapter ${CHAPTER}`);
console.log(`  frame time   median ${timing.median.toFixed(2)} ms   p90 ${timing.p90.toFixed(2)} ms`);
if (counts) console.log(`  instances    ${JSON.stringify(counts)}`);
console.log(`  coverage     band ${stats.band.pct.toFixed(1)}%   near ${stats.near.pct.toFixed(1)}%`);
console.log(
  `  luminance    band ${stats.band.lum.toFixed(1)}   near ${stats.near.lum.toFixed(1)}   frame ${stats.frameLum.toFixed(1)}`,
);
console.log(
  `  type         worst mean ${stats.type.worstMean.toFixed(2)}:1   worst p95 ${stats.type.worstP95.toFixed(2)}:1   failing ${stats.type.failing}/${stats.type.boxes}`,
);

await browser.close();
if (problems.length) {
  console.error("\n--- console ---");
  for (const p of [...new Set(problems)]) console.error(p);
  process.exitCode = 1;
} else {
  console.log("  console      clean");
}
