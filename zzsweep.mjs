/** Temporary: sweeps the cursor over the pond and counts blossom. Deleted. */
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const OUT = "zzsweep";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  protocolTimeout: 240000,
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
  if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
});
page.on("pageerror", (e) => problems.push(e.message));

await page.goto("http://localhost:5178/", { waitUntil: "networkidle0", timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));
await page.click('button[aria-haspopup="menu"]');
await page.waitForSelector('[role="menuitemradio"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  [...document.querySelectorAll('[role="menuitemradio"]')]
    .find((b) => b.textContent.includes("Japanese pond"))
    .click();
});
await new Promise((r) => setTimeout(r, 5000));
await page.evaluate(() => window.__petal?.seek(0.6));
await new Promise((r) => setTimeout(r, 3000));

const lab = await browser.newPage();
await lab.goto("about:blank");

/**
 * Blossom in a band, as a pixel count. Petals are the only pink in this biome
 * — the leaves are orange and read as blue below green, which is the test that
 * separates them.
 */
const countPink = async (src, box) => {
  const img = new Image();
  img.src = "data:image/png;base64," + src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(box.x, box.y, box.w, box.h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const gg = d[i + 1];
    const b = d[i + 2];
    if (r > 70 && r - gg > 22 && b - gg > 8) n++;
  }
  return n;
};

// The corridor the cursor is dragged along, and a band well clear of it that
// nothing touches — the control, because the whole surface drifts and a raw
// count in one box measures the drift as much as the gap.
const GAP = { x: 300, y: 415, w: 860, h: 90 };
const REF = { x: 300, y: 640, w: 860, h: 90 };
const shot = async (name) => {
  await page.bringToFront();
  const b64 = await page.screenshot({ encoding: "base64" });
  await writeFile(`${OUT}/${name}.png`, Buffer.from(b64, "base64"));
  await lab.bringToFront();
  const gap = await lab.evaluate(countPink, b64, GAP);
  const ref = await lab.evaluate(countPink, b64, REF);
  return { gap, ref, r: gap / ref };
};

const say = (label, m) =>
  console.log(
    `${label.padEnd(18)} swept band ${String(m.gap).padStart(5)}   control ${String(m.ref).padStart(5)}   ratio ${m.r.toFixed(3)}`,
  );

say("before", await shot("0-before"));

await page.bringToFront();
await page.mouse.move(300, 460);
for (let pass = 0; pass < 2; pass++) {
  const [a, b] = pass === 0 ? [300, 1160] : [1160, 300];
  const step = pass === 0 ? 14 : -14;
  for (let x = a; pass === 0 ? x <= b : x >= b; x += step) {
    await page.mouse.move(x, 460 + Math.sin(x / 110) * 10);
    await new Promise((r) => setTimeout(r, 12));
  }
}
say("just after sweep", await shot("1-swept"));

await page.bringToFront();
// The cursor parked well clear, so nothing is being held out of the gap.
await page.mouse.move(1400, 870);
await new Promise((r) => setTimeout(r, 2000));
say("two seconds on", await shot("2-two-seconds"));

await new Promise((r) => setTimeout(r, 4000));
say("six seconds on", await shot("3-six-seconds"));

await browser.close();
console.log(problems.length ? [...new Set(problems)].slice(0, 10).join("\n") : "clean console");
