/**
 * Throwaway probe: close look at a plant, and the sway-coherence test.
 *
 *   node zzstalk.mjs <chapter> <out> [biomeLabel] [dpr] [crop x,y,w,h] [sweep]
 *
 * `sweep` drives the pointer across the field and shoots mid-motion, which is
 * the only way to see whether a head has stayed on the stem it grew on.
 */
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const chapter = Number(process.argv[2] ?? 1.3);
const out = process.argv[3] ?? "zzstalk";
const biome = process.argv[4] ?? "";
const dpr = Number(process.argv[5] ?? 3);
const sweep = process.argv[6] ?? "";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: dpr });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
await page.goto("http://localhost:5178/", { waitUntil: "networkidle0", timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));
if (biome) {
  await page.click('button[aria-haspopup="menu"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate((l) => {
    [...document.querySelectorAll('[role="menuitemradio"]')]
      .find((b) => b.textContent?.toLowerCase().includes(l))
      ?.click();
  }, { forest: "fern", meadow: "meadow", flowers: "superbloom", pond: "pond" }[biome] ?? biome);
  await new Promise((r) => setTimeout(r, 3000));
}
await page.evaluate((c) => window.__petal?.seek(c), chapter);
await new Promise((r) => setTimeout(r, 1800));

if (sweep === "rake") {
  // A raster over a patch of screen, shooting every pass: at the hero the
  // pointer's half-metre reach is a few dozen pixels of a field seen in
  // perspective, so a single horizontal drag can miss a stand entirely.
  const [px, py] = (process.argv[7] ?? "700,300").split(",").map(Number);
  await writeFile(`${out}-rest.png`, await page.screenshot());
  for (let row = 0; row < 7; row++) {
    const y = py - 60 + row * 20;
    for (let s = 0; s < 14; s++) {
      await page.mouse.move(px - 260 + s * 40, y);
      await new Promise((r) => setTimeout(r, 6));
    }
    await writeFile(`${out}-rake${row}.png`, await page.screenshot());
  }
} else if (sweep === "park") {
  // Still, over one spot: the spring settles to a steady lean, so the whole
  // plant should be over and the head still on the end of its stem.
  const [px, py] = (process.argv[7] ?? "700,300").split(",").map(Number);
  await writeFile(`${out}-rest.png`, await page.screenshot());
  await page.mouse.move(px - 40, py);
  await page.mouse.move(px, py);
  await new Promise((r) => setTimeout(r, 1200));
  await writeFile(`${out}-park.png`, await page.screenshot());
  // ...and mid-flight, which is where a part reading the field at the wrong
  // height would part company with the rest of the plant.
  for (let s = 0; s < 12; s++) {
    await page.mouse.move(px - 220 + s * 40, py);
    await new Promise((r) => setTimeout(r, 6));
  }
  await writeFile(`${out}-flight.png`, await page.screenshot());
} else if (sweep) {
  // Walk the pointer across the middle of the frame fast enough that the
  // springs are still travelling, shooting as it goes.
  await page.mouse.move(200, 500);
  for (let f = 0; f < 6; f++) {
    for (let s = 0; s < 6; s++) {
      await page.mouse.move(200 + (f * 6 + s) * 30, 500 + Math.sin(f) * 60);
      await new Promise((r) => setTimeout(r, 8));
    }
    await writeFile(`${out}-sweep${f}.png`, await page.screenshot());
  }
} else {
  await writeFile(`${out}.png`, await page.screenshot());
}
await browser.close();
for (const p of [...new Set(problems)]) console.error(p);
