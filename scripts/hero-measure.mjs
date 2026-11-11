/**
 * What the hero costs the type.
 *
 * The hero's wordmark, tagline and body copy sit dead centre over the field,
 * with no scrim under them — so anything done to the light in the middle of
 * the frame is a legibility change, and "it looks fine" is not a measurement.
 *
 * This takes three frames of the same beat: the page as it ships, the same
 * page with every glyph made transparent, and the page again. Differencing
 * the first against the second isolates exactly which pixels sit under type;
 * differencing the first against the third finds the pixels the scene's own
 * animation moved between the shots, which are thrown away. What is left is
 * the real backdrop under the real glyphs, and the contrast ratio at every one
 * of them.
 *
 * It also reports the frame's mean luminance with the whole document hidden,
 * because the palette's hard rule is about the field and not about the copy.
 *
 *   node scripts/hero-measure.mjs [chapter] [url]
 */
import { writeFile, mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const CHAPTER = Number(process.argv[2] ?? 0.05);
const URL = process.argv[3] ?? "http://localhost:5178/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [W, H] = (process.env.VIEWPORT ?? "1440x900").split("x").map(Number);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

// `BIOME=pond` drives the picker the way a reader would. The other three
// dressings put nothing new over the copy; the pond puts a pond under it, and
// a surface half covered in pale blossom is a legibility question this script
// is the only honest answer to.
if (process.env.BIOME) {
  await page.click('button[aria-haspopup="menu"]');
  await new Promise((r) => setTimeout(r, 300));
  const ok = await page.evaluate((want) => {
    const row = [...document.querySelectorAll('[role="menuitemradio"]')].find((r) =>
      r.textContent.toLowerCase().includes(want),
    );
    row?.click();
    return !!row;
  }, process.env.BIOME.toLowerCase());
  if (!ok) {
    console.error("no such biome row:", process.env.BIOME);
    await browser.close();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2500));
}

await page.evaluate((c) => window.__petal?.seek(c), CHAPTER);
await new Promise((r) => setTimeout(r, 1800));

const shot = async () => (await page.screenshot({ encoding: "base64" })).toString();

const A = await shot();

await page.evaluate(() => {
  const s = document.createElement("style");
  s.id = "__noglyph";
  // The glyphs go; their shadows stay. The shadow is part of how the type is
  // presented, so the honest backdrop is the field with the shadow already on
  // it — which is what a reader's eye actually has to separate the stroke from.
  s.textContent = `*, *::before, *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-decoration-color: transparent !important;
  }`;
  document.head.appendChild(s);
});
await new Promise((r) => setTimeout(r, 700));
const B = await shot();

await page.evaluate(() => document.getElementById("__noglyph")?.remove());
await new Promise((r) => setTimeout(r, 700));
const A2 = await shot();

// ...and the field on its own, with the whole document out of the way.
const typeBoxes = await page.evaluate(() => {
  const out = [];
  // Every run of type on screen, not just the hero's: the nav sits in the top
  // left corner, which is exactly where a pool of sun placed "above and left"
  // wants to go.
  for (const el of document.querySelectorAll("h1, h2, h3, p, a, button, span, li")) {
    if (el.querySelector("h1,h2,h3,p,a,button,span,li")) continue;
    const t = (el.textContent ?? "").trim();
    if (!t) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    // ...but only what is actually being shown. Every act's copy is in the
    // document the whole way down and faded on the chapter, so at the hero
    // there are a dozen invisible blocks lying across the frame whose
    // rectangles would otherwise claim the pixels the visible copy is on.
    let vis = true;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (Number(s.opacity) < 0.9 || s.visibility !== "visible" || s.display === "none") {
        vis = false;
        break;
      }
    }
    if (!vis) continue;
    const cs = getComputedStyle(el);
    // Through a canvas, because the design system is authored in oklch and
    // Chrome hands `color` back as `oklab(...)` — read as three numbers that
    // is a pure red, and every link in the nav measured 1.07:1.
    const cv = document.createElement("canvas");
    cv.width = 1;
    cv.height = 1;
    const probe = cv.getContext("2d", { willReadFrequently: true });
    probe.fillStyle = cs.color;
    probe.fillRect(0, 0, 1, 1);
    const m = Array.from(probe.getImageData(0, 0, 1, 1).data.slice(0, 3), String);
    out.push({
      label: `${el.tagName.toLowerCase()} "${t.slice(0, 18)}"`,
      // The colour the glyph is *specified* as, not the colour a given pixel
      // came out. Half-covered edge pixels are a blend of ink and field, and
      // taking those at face value reports a contrast ratio of two for type
      // that is perfectly legible — it is measuring antialiasing.
      ink: [Number(m[0]), Number(m[1]), Number(m[2])],
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      area: r.width * r.height,
    });
  }
  // Everything the canvas is not inside goes, so the field is measured alone.
  const canvas = document.querySelector("canvas");
  for (const el of document.querySelectorAll("body > *, body > * > *")) {
    if (canvas && !el.contains(canvas)) el.style.visibility = "hidden";
  }
  return out;
});
await new Promise((r) => setTimeout(r, 700));
const S = await shot();

const stats = await page.evaluate(
  async (a, b, a2, s, boxes) => {
    const load = (d) =>
      new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.src = "data:image/png;base64," + d;
      });
    const px = async (d) => {
      const img = await load(d);
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    };

    const lin = (v) => {
      const u = v / 255;
      return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    };
    const lum = (r, g, bl) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);

    const A = await px(a);
    const B = await px(b);
    const A2 = await px(a2);
    const S = await px(s);

    // Mean luminance of the field, and of the page as shipped.
    let fieldSum = 0;
    let pageSum = 0;
    const n = S.w * S.h;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      fieldSum += lum(S.d[o], S.d[o + 1], S.d[o + 2]);
      pageSum += lum(A.d[o], A.d[o + 1], A.d[o + 2]);
    }

    // The glyph mask. A pixel counts if the two shots disagree hard (a stroke
    // was painted there) and the two shots *with* type agree (the scene did
    // not move under it between frames).
    // Which run of type owns each pixel: smallest box wins, so a link inside a
    // paragraph is measured against its own colour and not the paragraph's.
    const perBox = boxes
      .map((bx, i) => ({ ...bx, i, r: [] }))
      .sort((x, y) => y.area - x.area);
    const owner = new Int16Array(S.w * S.h).fill(-1);
    for (const bx of perBox) {
      for (let py = Math.max(0, bx.y); py < Math.min(S.h, bx.y + bx.h); py++) {
        const row = py * S.w;
        for (let px = Math.max(0, bx.x); px < Math.min(S.w, bx.x + bx.w); px++) {
          owner[row + px] = bx.i;
        }
      }
    }
    const byIndex = [];
    for (const bx of perBox) byIndex[bx.i] = bx;

    const ratios = [];
    const backs = [];
    let stable = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const move =
        Math.abs(A.d[o] - A2.d[o]) +
        Math.abs(A.d[o + 1] - A2.d[o + 1]) +
        Math.abs(A.d[o + 2] - A2.d[o + 2]);
      if (move > 12) continue;
      stable++;
      const diff =
        Math.abs(A.d[o] - B.d[o]) +
        Math.abs(A.d[o + 1] - B.d[o + 1]) +
        Math.abs(A.d[o + 2] - B.d[o + 2]);
      // Any coverage at all counts: what is being measured is which pixels of
      // the field a glyph lands on, not how solidly it lands on them.
      if (diff < 90) continue;
      const bx = byIndex[owner[i]];
      if (!bx) continue;
      const lf = lum(bx.ink[0], bx.ink[1], bx.ink[2]);
      const lb = lum(B.d[o], B.d[o + 1], B.d[o + 2]);
      const cr = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
      ratios.push(cr);
      backs.push(lb);
      bx.r.push(cr);
    }
    ratios.sort((x, y) => x - y);
    backs.sort((x, y) => x - y);
    const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN);

    // What the field actually is, as colour: the palette on screen rather than
    // the palette in the source. Sixteen buckets of the field's own luminance
    // histogram, and the hex at a few of them.
    const sample = [];
    for (let i = 0; i < n; i += 7) {
      const o = i * 4;
      sample.push([lum(S.d[o], S.d[o + 1], S.d[o + 2]), S.d[o], S.d[o + 1], S.d[o + 2]]);
    }
    sample.sort((x, y) => x[0] - y[0]);
    const hex = (p) => {
      const c = sample[Math.min(sample.length - 1, Math.floor(p * sample.length))];
      return "#" + [c[1], c[2], c[3]].map((v) => v.toString(16).padStart(2, "0")).join("");
    };
    const fieldRamp = {
      p01: hex(0.01),
      p10: hex(0.1),
      p25: hex(0.25),
      p50: hex(0.5),
      p75: hex(0.75),
      p90: hex(0.9),
      p98: hex(0.98),
      p999: hex(0.999),
    };

    return {
      width: S.w,
      height: S.h,
      fieldRamp,
      fieldMeanLuminance: fieldSum / n,
      pageMeanLuminance: pageSum / n,
      typePixels: ratios.length,
      stableShare: stable / n,
      contrast: {
        min: ratios[0],
        p05: q(ratios, 0.05),
        p25: q(ratios, 0.25),
        median: q(ratios, 0.5),
        p95: q(ratios, 0.95),
      },
      byBlock: perBox
        .filter((bx) => bx.r.length > 40)
        .map((bx) => {
          bx.r.sort((x, y) => x - y);
          return {
            label: bx.label,
            at: `${bx.x},${bx.y}`,
            px: bx.r.length,
            ink: `#${bx.ink.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`,
            p05: +q(bx.r, 0.05).toFixed(2),
            median: +q(bx.r, 0.5).toFixed(2),
          };
        })
        .sort((x, y) => x.p05 - y.p05),
      backdropLuminance: {
        p05: q(backs, 0.05),
        median: q(backs, 0.5),
        p95: q(backs, 0.95),
        max: backs[backs.length - 1],
      },
    };
  },
  A,
  B,
  A2,
  S,
  typeBoxes,
);

await mkdir("shots", { recursive: true });
await writeFile(`shots/measure-${CHAPTER}-page.png`, Buffer.from(A, "base64"));
await writeFile(`shots/measure-${CHAPTER}-field.png`, Buffer.from(S, "base64"));

console.log(JSON.stringify({ chapter: CHAPTER, typeBoxes, ...stats }, null, 2));
await browser.close();

if (problems.length) {
  console.error("\n--- console output ---");
  for (const p of [...new Set(problems)]) console.error(p);
  process.exitCode = 1;
}
