/**
 * Does the blossom still close over a swept lane at ten thousand petals?
 *
 * The pond's one behavioural promise is that a cursor dragged through it pushes
 * the petals aside and the gap then fills back in, evenly, without piling them
 * up anywhere. That is a fact about motion, so it cannot be checked in a still:
 * the frame after the sweep and the frame four seconds later look alike in
 * every way except the one that matters.
 *
 * So this drives the real pointer across the real page and photographs the same
 * strip of water four times — before the sweep, the instant it ends, and twice
 * while it recovers — and counts blossom in it each time. What should come out
 * is a big hole and then most of it back.
 *
 *   node scripts/pond-sweep.mjs [tag]
 */
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const TAG = process.argv[2] ?? "sweep";
const URL = process.env.PROBE_URL ?? "http://localhost:5311/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "shots/sweep";

/** The strip the cursor is dragged along, and the band counted around it. */
const LANE = { y: 470, x0: 240, x1: 1200 };
const BAND = { top: 380, bottom: 580, left: 240, right: 1200 };

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const problems = [];
page.on("pageerror", (e) => problems.push(e.message));

let picked = false;
for (let attempt = 0; attempt < 40 && !picked; attempt++) {
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  await new Promise((r) => setTimeout(r, 3500));
  if (!(await page.evaluate(() => !!document.querySelector('button[aria-haspopup="menu"]')))) {
    await new Promise((r) => setTimeout(r, 4000));
    continue;
  }
  await page.click('button[aria-haspopup="menu"]');
  await new Promise((r) => setTimeout(r, 300));
  picked = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[role="menuitemradio"]')].find((r) =>
      r.textContent.toLowerCase().includes("pond"),
    );
    row?.click();
    return !!row;
  });
}
if (!picked) {
  console.error("no pond row — the tree is probably mid-edit");
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => window.__petal?.seek(0.05));
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const root = document.querySelector("#root") ?? document.body;
  for (const el of [...root.children, ...document.body.children]) {
    if (el.querySelector?.("canvas") || el.tagName === "CANVAS") continue;
    el.style.visibility = "hidden";
  }
});
await new Promise((r) => setTimeout(r, 600));

const frames = [];
const grab = async (label) => {
  const b64 = await page.screenshot({ encoding: "base64" });
  await writeFile(`${OUT}/${TAG}-${label}.png`, Buffer.from(b64, "base64"));
  frames.push([label, b64]);
};

await grab("0-before");

// Two passes along the lane, out and back, at about a metre a second on screen
// — a reader's sweep, not a teleport. `page.mouse.move` with steps sends real
// pointermove events, which is what lib/pointer is listening for; setting the
// position in one jump gives the field one enormous velocity sample and then
// nothing, which is not the thing being tested.
for (const [from, to] of [
  [LANE.x0, LANE.x1],
  [LANE.x1, LANE.x0],
]) {
  const N = 26;
  for (let i = 0; i <= N; i++) {
    await page.mouse.move(from + ((to - from) * i) / N, LANE.y);
    await new Promise((r) => setTimeout(r, 22));
  }
}
await grab("1-swept");
await new Promise((r) => setTimeout(r, 1500));
await grab("2-plus1.5s");
await new Promise((r) => setTimeout(r, 3000));
await grab("3-plus4.5s");
await new Promise((r) => setTimeout(r, 5000));
await grab("4-plus9.5s");

const counts = await page.evaluate(
  async (fs, B) => {
    const out = [];
    for (const [label, b64] of fs) {
      const img = await new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.src = "data:image/png;base64," + b64;
      });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      // The same hue test the probe uses, and three vertical thirds of the
      // band: a lane that refills by dragging the blossom in from one end is
      // not the behaviour being claimed, so where it comes back matters.
      const thirds = [0, 0, 0];
      const tot = [0, 0, 0];
      for (let y = B.top; y < B.bottom; y++) {
        for (let x = B.left; x < B.right; x++) {
          const i = (y * c.width + x) * 4;
          const k = Math.min(2, Math.floor((3 * (x - B.left)) / (B.right - B.left)));
          tot[k]++;
          if (d[i] > 50 && d[i + 2] > d[i + 1] && d[i] > d[i + 2]) thirds[k]++;
        }
      }
      out.push({
        label,
        pct: (100 * (thirds[0] + thirds[1] + thirds[2])) / (tot[0] + tot[1] + tot[2]),
        byThird: thirds.map((v, k) => (100 * v) / tot[k]),
      });
    }
    return out;
  },
  frames,
  BAND,
);

console.log(`\nblossom in the swept band (${BAND.left}..${BAND.right} x ${BAND.top}..${BAND.bottom})`);
for (const c of counts) {
  console.log(
    `  ${c.label.padEnd(12)} ${c.pct.toFixed(1)}%   thirds ${c.byThird.map((v) => v.toFixed(1)).join("  ")}`,
  );
}
const [before, swept, ...back] = counts;
const gap = before.pct - swept.pct;
console.log(`\n  swept away ${gap.toFixed(1)} points of ${before.pct.toFixed(1)}`);
for (const c of back) {
  console.log(
    `  ${(((c.pct - swept.pct) / Math.max(gap, 1e-6)) * 100).toFixed(0)}% back at ${c.label.replace(/^\d-/, "")}`,
  );
}
// The last reading is the loosest: the raft field itself drifts, so by ten
// seconds the band's own target has moved and "back to where it was" is no
// longer the right question. What it does say is that nothing has run away.

await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
}
