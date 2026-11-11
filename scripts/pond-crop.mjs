/**
 * A magnified crop of a shot, so the koi and the reflection can be *looked* at.
 *
 * Both are small, low-contrast things read through a surface; downsampled to
 * fit a page they are a smudge either way, which makes "is it legible" an
 * unanswerable question. Chrome is already here for the shooting, so it does
 * the cropping too.
 *
 *   node scripts/pond-crop.mjs shots/probe/water-v2.png 850,380,420,320 3
 */
import { readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const [file, box, zoomArg] = process.argv.slice(2);
const [x, y, w, h] = box.split(",").map(Number);
const zoom = Number(zoomArg ?? 2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const b64 = (await readFile(file)).toString("base64");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const out = await page.evaluate(
  (src, x, y, w, h, z) =>
    new Promise((done) => {
      const i = new Image();
      i.onload = () => {
        const c = document.createElement("canvas");
        c.width = w * z;
        c.height = h * z;
        const g = c.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.drawImage(i, x, y, w, h, 0, 0, w * z, h * z);
        done(c.toDataURL("image/png").split(",")[1]);
      };
      i.src = "data:image/png;base64," + src;
    }),
  b64,
  x,
  y,
  w,
  h,
  zoom,
);
const dest = file.replace(/\.png$/, `-crop-${x}-${y}.png`);
await writeFile(dest, Buffer.from(out, "base64"));
console.log(dest);
await browser.close();
