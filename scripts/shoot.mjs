/**
 * Drives the real page in a real browser and photographs the journey.
 *
 * A scene like this fails silently — one bad line of GLSL and the canvas is
 * simply black, with a compile log in the console and nothing on screen — so
 * "it builds" is not evidence of anything. This walks the scroll, saves a
 * frame per act, and fails loudly on any console error.
 *
 *   node scripts/shoot.mjs [url] [outDir]
 */
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const URL = process.argv[2] ?? "http://localhost:5178/";
const OUT = process.argv[3] ?? "shots";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Chapter values, straight off the journey in src/lib/journey.ts. */
const STATIONS = [
  ["p1", 2.2451],
  ["p2", 2.3458],
  ["p3", 2.4464],
  ["p4", 2.5471],
  ["p5", 2.6477],
  ["p6", 2.7484],
  ["p7", 2.8490],
  ["p8", 2.9497],
];

const STOPS = [
  ["00-hero", 0.05],
  ["01-hero-leaving", 0.7],
  ["02-approach", 1.3],
  ["03-arriving", 1.75],
  ["04-bloom", 2.05],
  ["05-petal-01", 2.28],
  ["06-petal-04", 2.53],
  ["07-petal-08", 2.93],
  ["08-off-the-bloom", 3.1],
  ["09-stem-step-01", 3.36],
  ["10-stem-step-03", 3.66],
  ["11-stem-foot", 4.0],
  ["12-soil-faq", 4.4],
  ["13-soil-late", 4.9],
  ["14-back-out", 5.3],
  ["15-download", 5.48],
];

const PLAN = process.env.SHOOT === "stations" ? STATIONS : STOPS;

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  /*
   * Real headless and the real GPU.
   *
   * This used to run `headless: "shell"` with `--use-angle=swiftshader`, which
   * draws this scene at about 0.4 frames a second — a ninety-second pass
   * captured twenty-three frames. New headless gets Metal and runs it at over a
   * hundred. Everything about verifying this project got slower and less
   * trustworthy for the sake of a flag that was only ever there out of habit.
   */
  headless: true,
  args: ["--hide-scrollbars"],
});

const page = await browser.newPage();
const [W, H] = (process.env.VIEWPORT ?? "1440x900").split("x").map(Number);
// Deliberately not `isMobile: true`. CDP substitutes its own layout viewport
// for mobile emulation — a requested 390x844 lays out at 435x942 — so every
// portrait screenshot taken that way was of a width the site is never asked
// for, and at least one "finding" from it did not exist at a real 390.
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, hasTouch: W < 700 });

const problems = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") problems.push(`[${t}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const height = await page.evaluate(() => document.body.scrollHeight);
console.log("document height:", height, "px");

for (const [name, chapter] of PLAN) {
  await page.evaluate((c) => window.__petal?.seek(c), chapter);
  // Long enough for the damped camera to settle where the scroll put it.
  await new Promise((r) => setTimeout(r, 1400));
  const landed = await page.evaluate(() => ({ c: window.__petal?.chapter ?? -1 }));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name.padEnd(18)} asked ${chapter.toFixed(2)}  landed ${landed.c.toFixed(2)}`);
}

await browser.close();

if (problems.length) {
  console.error("\n--- console output ---");
  for (const p of [...new Set(problems)]) console.error(p);
  process.exitCode = 1;
} else {
  console.log("\nno console errors or warnings.");
}
