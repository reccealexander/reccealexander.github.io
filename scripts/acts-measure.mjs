/**
 * How much light each act of the journey actually has in it.
 *
 * hero-measure.mjs answers the legibility question at one beat and costs four
 * screenshots to do it. This is the other question — whether an act has any
 * range at all — asked of the whole journey in one pass. The first act was
 * measured at a mean linear luminance of 0.064 with a 95th percentile of 0.24,
 * and the last three at a mean of 0.014 with a 95th of 0.03: a frame whose
 * brightest pixel is 0.03 has no bright pixel in it, which is a different
 * failure from being dark and does not show up in a mean.
 *
 * The nav bar is excluded because it is opaque, it is the same in every frame,
 * and sixty-five rows of it at the top of a nine-hundred-row picture moves
 * every number here by more than the changes being measured.
 *
 *   node scripts/acts-measure.mjs [url]
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] ?? "http://localhost:5178/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [W, H] = (process.env.VIEWPORT ?? "1440x900").split("x").map(Number);
const NAV = 66;

const STOPS = [
  ["hero", 0.05],
  ["hero-leaving", 0.7],
  ["approach", 1.3],
  ["bloom", 2.05],
  ["stem-step-01", 3.36],
  ["stem-step-03", 3.66],
  ["stem-foot", 4.0],
  ["soil-faq", 4.4],
  ["soil-late", 4.9],
  ["back-out", 5.3],
];

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

console.log("act              mean     p05      p50      p95      p999");
for (const [name, c] of STOPS) {
  await page.evaluate((v) => window.__petal?.seek(v), c);
  await new Promise((r) => setTimeout(r, 1300));
  const shot = (await page.screenshot({ encoding: "base64" })).toString();
  const s = await page.evaluate(
    async (data, nav) => {
      const img = await new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.src = "data:image/png;base64," + data;
      });
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, nav, cv.width, cv.height - nav).data;
      const lin = (v) => {
        const u = v / 255;
        return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
      };
      const vals = [];
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
        sum += l;
        vals.push(l);
      }
      vals.sort((a, b) => a - b);
      const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
      return { mean: sum / vals.length, p05: q(0.05), p50: q(0.5), p95: q(0.95), p999: q(0.999) };
    },
    shot,
    NAV,
  );
  const f = (v) => v.toFixed(4).padEnd(8);
  console.log(
    `${name.padEnd(16)} ${f(s.mean)} ${f(s.p05)} ${f(s.p50)} ${f(s.p95)} ${f(s.p999)}`,
  );
}

await browser.close();
if (problems.length) {
  console.error("\n--- console output ---");
  for (const p of [...new Set(problems)]) console.error(p);
  process.exitCode = 1;
}
