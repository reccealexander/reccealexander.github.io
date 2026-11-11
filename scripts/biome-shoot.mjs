/**
 * Same job as shoot.mjs, but for a biome other than the default.
 *
 * The biome lives in React state with no URL override, so this drives the
 * picker the way a reader would: open the menu, click the row, wait for the
 * field to be replanted. Anything else would be photographing a code path
 * nobody takes.
 *
 *   node scripts/biome-shoot.mjs forest [url] [outDir]
 */
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const BIOME = process.argv[2] ?? "forest";
const URL = process.argv[3] ?? "http://localhost:5178/";
const OUT = process.argv[4] ?? `shots/${BIOME}`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const STOPS = [
  ["00-hero", 0.05],
  ["01-hero-leaving", 0.7],
  ["02-approach", 1.3],
  ["03-arriving", 1.75],
  ["04-bloom", 2.05],
  ["08-off-the-bloom", 3.1],
  ["10-stem-step-03", 3.66],
  ["11-stem-foot", 4.0],
  ["12-soil-faq", 4.4],
  ["13-soil-late", 4.9],
];

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars"],
});

const page = await browser.newPage();
const [W, H] = (process.env.VIEWPORT ?? "1440x900").split("x").map(Number);
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, hasTouch: W < 700 });

const problems = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") problems.push(`[${t}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

// The picker hides itself past chapter 0.8, so this has to happen first.
await page.click('button[aria-haspopup="menu"]');
await new Promise((r) => setTimeout(r, 300));
const picked = await page.evaluate((want) => {
  const rows = [...document.querySelectorAll('[role="menuitemradio"]')];
  const row = rows.find((r) => r.textContent.toLowerCase().includes(want));
  if (!row) return rows.map((r) => r.textContent);
  row.click();
  return true;
}, { forest: "fern", meadow: "meadow", flowers: "superbloom", pond: "pond" }[BIOME] ?? BIOME);
if (picked !== true) {
  console.error("could not find that biome. rows were:", picked);
  await browser.close();
  process.exit(1);
}
// Replanting a field of sixteen thousand instances is not free.
await new Promise((r) => setTimeout(r, 2500));
console.log("biome:", await page.evaluate(() =>
  document.querySelector('button[aria-haspopup="menu"]')?.getAttribute("aria-label")));

for (const [name, chapter] of STOPS) {
  await page.evaluate((c) => window.__petal?.seek(c), chapter);
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
