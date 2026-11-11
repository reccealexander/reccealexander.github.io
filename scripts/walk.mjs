/**
 * The beats this change is judged on, in one pass.
 *
 * shoot.mjs walks the whole journey at its own sixteen stops; this takes the
 * seven the light was actually tuned against and nothing else, so the loop
 * while placing a pool of sun is thirty seconds rather than a minute and a
 * half. Same rule: it fails loudly on any console output.
 *
 *   node scripts/walk.mjs [outDir] [url]
 */
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const OUT = process.argv[2] ?? "shots/walk";
const URL = process.argv[3] ?? "http://localhost:5178/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [W, H] = (process.env.VIEWPORT ?? "1440x900").split("x").map(Number);

const STOPS = [0.05, 0.6, 1.3, 1.86, 2.4, 3.5, 4.9];

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

const problems = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") problems.push(`[${t}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

for (const c of STOPS) {
  await page.evaluate((v) => window.__petal?.seek(v), c);
  await new Promise((r) => setTimeout(r, 1400));
  await page.screenshot({ path: `${OUT}/${c.toFixed(2)}.png` });
  console.log("shot", c);
}

await browser.close();
if (problems.length) {
  console.error("\n--- console output ---");
  for (const p of [...new Set(problems)]) console.error(p);
  process.exitCode = 1;
} else {
  console.log("no console errors or warnings.");
}
