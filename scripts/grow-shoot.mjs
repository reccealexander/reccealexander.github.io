/**
 * Photographs a biome changeover while it is happening.
 *
 * Neither shoot.mjs nor biome-shoot.mjs can see this: both settle for well over
 * a second before they take the frame, and the whole animation is 2100 ms. A
 * grow-in that is broken — plants arriving at full size, heads floating off
 * their stems, a family that never grows at all — looks identical to a working
 * one in a settled screenshot.
 *
 *   node scripts/grow-shoot.mjs [from] [to]
 */
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const FROM = process.argv[2] ?? "meadow";
const TO = process.argv[3] ?? "forest";
const OUT = `shots/grow-${FROM}-${TO}`;
const URL = "http://localhost:5178/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ROW = { forest: "fern", meadow: "meadow", flowers: "superbloom", pond: "pond" };
/**
 * Fractions of the run, held rather than timed.
 *
 * Not wall-clock offsets: a screenshot costs a good tenth of the run, so timed
 * frames drift and bunch, and the first version of this script "proved" the
 * grow-in worked when what it had actually photographed was nine frames of a
 * finished field.
 */
const AT = [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1];

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

async function choose(id) {
  await page.click('button[aria-haspopup="menu"]');
  await new Promise((r) => setTimeout(r, 260));
  await page.evaluate((want) => {
    const row = [...document.querySelectorAll('[role="menuitemradio"]')].find((r) =>
      r.textContent.toLowerCase().includes(want),
    );
    row?.click();
  }, ROW[id] ?? id);
}

if (FROM !== "meadow") {
  await choose(FROM);
  await new Promise((r) => setTimeout(r, 3000));
}

// Open the menu and settle BEFORE the clock starts, so the only thing the
// timings below are measuring is the growth and not the menu's own animation.
await page.click('button[aria-haspopup="menu"]');
await new Promise((r) => setTimeout(r, 300));

const t0 = await page.evaluate((want) => {
  const row = [...document.querySelectorAll('[role="menuitemradio"]')].find((r) =>
    r.textContent.toLowerCase().includes(want),
  );
  row?.click();
  return performance.now();
}, ROW[TO] ?? TO);

// Let the replant finish and the first frame land, so the hold below is
// against a field that exists.
await new Promise((r) => setTimeout(r, 1800));

for (const t of AT) {
  await page.evaluate((v) => window.__grow?.hold(v), t);
  // Two frames: one to write the uniform, one to draw with it.
  await new Promise((r) => setTimeout(r, 120));
  await page.evaluate((v) => window.__grow?.hold(v), t);
  await new Promise((r) => setTimeout(r, 60));
  const pct = String(Math.round(t * 100)).padStart(3, "0");
  await page.screenshot({ path: `${OUT}/${pct}.png` });
}

console.log(`clicked at ${t0.toFixed(0)}, ${AT.length} held frames into ${OUT}`);
await browser.close();

if (problems.length) {
  console.error("\n--- console output ---");
  for (const p of [...new Set(problems)]) console.error(p);
  process.exitCode = 1;
} else {
  console.log("no console errors or warnings.");
}
