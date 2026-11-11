/** One frame, one crop, for looking at a change quickly. */
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { decodePng, cropPng, encodePng, meanLuminance } from "./zzflw-png.mjs";

const chapter = Number(process.argv[2] ?? 1.3);
const out = process.argv[3] ?? "zzflw-peek";
const query = process.argv[4] ?? "";
const biome = process.argv[5] ?? "";
const crop = (process.argv[6] ?? "500,300,420,320").split(",").map(Number);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "shell",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5178/${query}`, { waitUntil: "networkidle0", timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));
if (biome) {
  await page.evaluate(() => document.querySelector('button[aria-haspopup="menu"]')?.click());
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate((l) => {
    [...document.querySelectorAll('button[role="menuitemradio"]')]
      .find((b) => b.textContent?.includes(l))
      ?.click();
  }, biome);
  await new Promise((r) => setTimeout(r, 2500));
}
await page.evaluate((c) => window.__petal?.seek(c), chapter);
await new Promise((r) => setTimeout(r, 1600));
const buf = await page.screenshot();
const png = decodePng(buf);
await writeFile(`${out}.png`, buf);
await writeFile(`${out}-crop.png`, encodePng(cropPng(png, ...crop)));
console.log("lum", meanLuminance(png).toFixed(4));
await browser.close();
for (const p of [...new Set(problems)]) console.error(p);
