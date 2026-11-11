/** Superbloom only, flat against full, in one session. */
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { decodePng, meanLuminance, cropPng, encodePng, zoomPng } from "./zzflw-png.mjs";

const OUT = process.argv[2] ?? "zzflw-bloom";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "shell",
  protocolTimeout: 300000,
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

await page.evaluateOnNewDocument(() => {
  const tally = { tris: 0 };
  window.__gl = tally;
  const p = WebGL2RenderingContext.prototype;
  const dei = p.drawElementsInstanced;
  p.drawElementsInstanced = function (mode, count, type, offset, n) {
    tally.tris += (count / 3) * n;
    return dei.call(this, mode, count, type, offset, n);
  };
  const de = p.drawElements;
  p.drawElements = function (mode, count, type, offset) {
    tally.tris += count / 3;
    return de.call(this, mode, count, type, offset);
  };
});

const CROPS = { 0.05: [200, 620, 480, 270], 1.3: [420, 300, 500, 380], 2.4: [380, 200, 560, 460], 3.4: [400, 200, 600, 480] };

for (const [variant, query] of [["flat", "?flat=1"], ["full", ""]]) {
  await page.goto("http://localhost:5178/" + query, { waitUntil: "networkidle0", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.evaluate(() => document.querySelector('button[aria-haspopup="menu"]')?.click());
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    [...document.querySelectorAll('button[role="menuitemradio"]')]
      .find((b) => b.textContent?.includes("Superbloom"))
      ?.click();
  });
  await new Promise((r) => setTimeout(r, 3000));

  for (const c of [0.05, 1.3, 2.4, 3.4]) {
    await page.evaluate((v) => window.__petal?.seek(v), c);
    await new Promise((r) => setTimeout(r, 1800));
    const tris = await page.evaluate(
      () =>
        new Promise((res) => {
          requestAnimationFrame(() => {
            const a = window.__gl.tris;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => res((window.__gl.tris - a) / 2)),
            );
          });
        }),
    );
    const buf = await page.screenshot();
    const png = decodePng(buf);
    const name = `${variant}-${String(c).replace(".", "_")}`;
    await writeFile(`${OUT}/${name}.png`, buf);
    const [x, y, w, h] = CROPS[c];
    await writeFile(`${OUT}/${name}-crop.png`, encodePng(zoomPng(cropPng(png, x, y, w, h), 2)));
    console.log(
      `${name.padEnd(12)} lum ${meanLuminance(png).toFixed(4)}  tris ${Math.round(tris).toLocaleString()}`,
    );
  }
}

await browser.close();
if (problems.length) {
  console.error("--- console output ---");
  for (const p of [...new Set(problems)]) console.error(p);
} else console.log("\nno console errors or warnings.");
