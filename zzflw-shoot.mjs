/**
 * Meadow and superbloom, before and after, in one browser session.
 *
 * `?flat=1` puts both flowering families back to bare vertical stems (the
 * temporary switch in Wildflowers.tsx and Heads.tsx), so the two passes differ
 * by exactly this change and by nothing four other agents did to the dev server
 * in between. Full frames, zoomed crops on a single plant, frame mean luminance
 * and a per-frame tally of draw calls and triangles off the GL context.
 *
 *   node zzflw-shoot.mjs <outDir>
 */
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { decodePng, meanLuminance, cropPng, encodePng, zoomPng } from "./zzflw-png.mjs";

const OUT = process.argv[2] ?? "zzflw-ab";
const BASE = "http://localhost:5178/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const STOPS = [0.05, 0.65, 1.3, 2.4, 3.4];
/** Where to cut a tight crop, per chapter: a patch with plants in it. */
const CROPS = {
  0.05: [430, 0, 400, 260],
  0.65: [440, 60, 380, 240],
  1.3: [420, 300, 500, 380],
  2.4: [380, 200, 560, 460],
  3.4: [400, 200, 600, 480],
};

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
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
  const t = m.type();
  if (t === "error" || t === "warning") problems.push(`[${t}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

await page.evaluateOnNewDocument(() => {
  const tally = { tris: 0, calls: 0 };
  window.__gl = tally;
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const de = proto.drawElements;
    proto.drawElements = function (mode, count, type, offset) {
      tally.tris += count / 3;
      tally.calls += 1;
      return de.call(this, mode, count, type, offset);
    };
    const dei = proto.drawElementsInstanced;
    if (dei) {
      proto.drawElementsInstanced = function (mode, count, type, offset, n) {
        tally.tris += (count / 3) * n;
        tally.calls += 1;
        return dei.call(this, mode, count, type, offset, n);
      };
    }
    const da = proto.drawArrays;
    proto.drawArrays = function (mode, first, count) {
      tally.tris += count / 3;
      tally.calls += 1;
      return da.call(this, mode, first, count);
    };
    const dai = proto.drawArraysInstanced;
    if (dai) {
      proto.drawArraysInstanced = function (mode, first, count, n) {
        tally.tris += (count / 3) * n;
        tally.calls += 1;
        return dai.call(this, mode, first, count, n);
      };
    }
  }
});

async function pickBiome(label) {
  await page.evaluate(() => document.querySelector('button[aria-haspopup="menu"]')?.click());
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate((l) => {
    [...document.querySelectorAll('button[role="menuitemradio"]')]
      .find((b) => b.textContent?.includes(l))
      ?.click();
  }, label);
  await new Promise((r) => setTimeout(r, 2500));
}

/** One frame's worth of draw calls, sampled across a rAF. */
async function frameCost() {
  return page.evaluate(
    () =>
      new Promise((res) => {
        requestAnimationFrame(() => {
          const a = { ...window.__gl };
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const b = { ...window.__gl };
              res({ tris: (b.tris - a.tris) / 2, calls: (b.calls - a.calls) / 2 });
            });
          });
        });
      }),
  );
}

const rows = [];

for (const [variant, query] of [["flat", "?flat=1"], ["full", ""]]) {
  await page.goto(BASE + query, { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 3000));

  for (const [id, label] of [
    ["meadow", "Meadow"],
    ["bloom", "Superbloom"],
  ]) {
    if (label !== "Meadow") await pickBiome(label);
    for (const c of STOPS) {
      await page.evaluate((v) => window.__petal?.seek(v), c);
      await new Promise((r) => setTimeout(r, 1600));
      const cost = await frameCost();
      const buf = await page.screenshot();
      const png = decodePng(buf);
      const lum = meanLuminance(png);
      const name = `${variant}-${id}-${String(c).replace(".", "_")}`;
      await writeFile(`${OUT}/${name}.png`, buf);
      const [x, y, w, h] = CROPS[c];
      await writeFile(`${OUT}/${name}-crop.png`, encodePng(zoomPng(cropPng(png, x, y, w, h), 2)));
      rows.push({ variant, id, c, lum, ...cost });
      console.log(
        `${name.padEnd(22)} lum ${lum.toFixed(4)}  tris ${Math.round(cost.tris)
          .toLocaleString()
          .padStart(10)}  calls ${cost.calls}`,
      );
    }
  }

  // The cursor sweeping the hero, to watch the field bend and to check that
  // nothing comes off the plant it grew on while it does.
  if (variant === "full") {
    await pickBiome("Meadow");
    await page.evaluate(() => window.__petal?.seek(0.05));
    await new Promise((r) => setTimeout(r, 1400));
    for (const [i, x] of [200, 520, 700, 900, 1200].entries()) {
      await page.mouse.move(x, 300, { steps: 12 });
      await new Promise((r) => setTimeout(r, 450));
      const png = decodePng(await page.screenshot());
      await writeFile(`${OUT}/sweep-${i}.png`, encodePng(png));
      await writeFile(
        `${OUT}/sweep-${i}-crop.png`,
        encodePng(zoomPng(cropPng(png, 430, 0, 400, 250), 2)),
      );
    }
  }
}

await writeFile(`${OUT}/numbers.json`, JSON.stringify(rows, null, 2));
await browser.close();

if (problems.length) {
  console.error("\n--- console output ---");
  for (const p of [...new Set(problems)]) console.error(p);
  process.exitCode = 1;
} else {
  console.log("\nno console errors or warnings.");
}
