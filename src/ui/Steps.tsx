import { useRef } from "react";
import { Vector3 } from "three";
import { timeline } from "@/lib/features";
import { leafAt, leafSurfacePoint, worldToScreen } from "@/lib/flowerLayout";
import { LAYOUT, STEP_COUNT, stepChapter } from "@/lib/journey";
import { setLeafHover } from "@/lib/leafHover";
import { hrefFor, onNavigate } from "@/lib/router";
import { useAct } from "@/lib/scroll";
import { clamp } from "@/lib/math";
import { useJourney } from "./useJourney";
import { station } from "./stage";
import BurgersShowcase from "./BurgersShowcase";
import GnrShowcase from "./GnrShowcase";

/**
 * The way down.
 *
 * The camera leaves the bloom and pans down the stem, and an ant comes down it
 * a beat ahead — she is why the cards sit off-centre rather than over the
 * plant: at this range she and the stem hold the middle of the frame, and a
 * card there would be standing on both.
 *
 * The act runs: the title, then the two projects, then the four leaves, one per
 * place I have worked, alternating sides so the stem runs between them.
 *
 * The leaves are the plant's own — real blades on the stem the camera is
 * panning down, not cards floating beside it — and each carries a label pinned
 * to where its tip actually is on screen, with a leader back to it. Clicking
 * either the label or the band of scroll it is read in opens that leaf's page.
 *
 * The projects are figures rather than paragraphs, and they are here rather
 * than up in the bloom for the same reason the petals are not: the bloom act is
 * an index, eight names pinned to eight petals at 62svh a station, and a plot
 * needs a screen of its own to be read in. Putting them first also makes the
 * four positions underneath a record of where the work happened rather than
 * four claims in a row.
 *
 * Everything below is timed as a fraction of its own block rather than in
 * absolute chapters, because the act got two hundred and sixty viewport heights
 * longer to make room and a constant tuned at the old length puts two beats on
 * screen at once at the new one.
 */

/** The whole act, in viewport heights. `LAYOUT` is the source of both. */
const ACT_VH = LAYOUT.stemIntroVh + STEP_COUNT * LAYOUT.stemStepVh;
/** The chapter a point `vh` into the act is read at. */
const chapterAt = (vh: number) => 3 + vh / ACT_VH;

const SHOWCASE_VH = (LAYOUT.stemIntroVh - LAYOUT.stemTitleVh) / 2;
const SHOWCASE_SPAN = SHOWCASE_VH / ACT_VH;
const showcaseChapter = (i: number) =>
  chapterAt(LAYOUT.stemTitleVh + (i + 0.5) * SHOWCASE_VH);

const STEP_SPAN = LAYOUT.stemStepVh / ACT_VH;
/** Where the last card has to be gone by: the FAQ arrives at 4.0 in real flow. */
const EXIT_AT = stepChapter(STEP_COUNT - 1) + STEP_SPAN * 0.04;
/* Short, because what follows is not another overlay it can cross-fade with —
   it is the FAQ, a screen of high-contrast white type in normal flow. A leaf
   label lingering at a third of its opacity next to that does not read as a
   transition, it reads as something that failed to clear. */
const EXIT_OVER = STEP_SPAN * 0.16;

/**
 * Below this the labels stop being pinned and take a fixed slot instead.
 *
 * The same problem the bloom's captions have, one act later: at this range the
 * plant is most of a phone's width, so a label pinned beside a leaf lands on
 * the stem and its leader has nowhere to run. Above the breakpoint the label
 * hangs off the leaf it names; below it, it sits where the old card sat.
 */
const PINNED_FROM = 900;

/**
 * How much of the blade the type is set across, as leaf parameters.
 *
 * Not the whole leaf at either end. The first quarter is stalk and shoulder —
 * narrow, dark, and half of it behind the stem the leaf comes out of — and the
 * last tenth is the point the blade tapers to, which is narrower than a line of
 * type.
 *
 * Narrowed to the middle third, which sounds like less room and is more.
 *
 * The fit is capped by the *narrowest* cross-section anywhere the type runs —
 * a rectangle has to clear its tightest point — and a leaf is a lens, so
 * pushing the run out toward the tip drags that number down fast. At 0.82 the
 * blade is at half its widest, and the whole label was being sized against
 * that half while sitting on a blade three times longer than it needed. Pulled
 * in to 0.70 the tightest cross-section is 43% wider, and the type comes up
 * about that much bigger on the same leaf.
 */
const FROM = 0.34;
const TO = 0.7;
const MID = (FROM + TO) / 2;

/**
 * The label's own size, before it is fitted to a leaf.
 *
 * The block is laid out once at this width and then scaled as a whole, rather
 * than being given the leaf's width in pixels and left to reflow — which is
 * what the first attempt did, and it set the type at screen size on an object a
 * fraction of the screen, so four lines ran off both ends of the blade.
 */
const NATURAL_W = 276;

/**
 * How far the type may be scaled to fit, and how far it may be sheared.
 *
 * A leaf seen nearly edge-on projects its width to almost nothing. Fitted
 * honestly to that, a label is a horizontal line; so past the floor it keeps
 * its own proportions and merely lies along the blade instead of on it — wrong
 * by a few degrees and readable, which is the better of the two failures.
 */
/*
 * The floor is low on purpose.
 *
 * It is a floor on how small the type may be fitted, so it is also a licence to
 * *overhang*: when a blade projects smaller than the block can shrink to, the
 * block stops shrinking and hangs off the edges instead. That is what put the
 * first leaf's date and CTA on the grass beside it at the near end of its
 * window. Nothing is gained by refusing to shrink there — the label is at a
 * fraction of its opacity at the ends of a station anyway, on its way in or
 * out — so it now goes as small as it has to and stays on the leaf. It reaches
 * full size in the middle of the window, which is where it is read.
 */
const MIN_SCALE = 0.42;
/* Was 1.5, which was the cap that left a label sitting in the top-left corner
   of a blade with the other three quarters of the leaf empty. These leaves are
   large and close now, and a label should be able to use one. */
const MAX_SCALE = 2.4;

/**
 * How much of the blade's width the type may use.
 *
 * Not all of it, and the same goes for its length — see ALONG_INSET.
 *
 * The width is measured margin to margin, and the outermost part of each margin
 * is curl: `fold` turns the edge of the sheet down out of the cross-section's
 * plane. Fitted to the full width, the label's first and last lines lie on that
 * curl, where they are both distorted and half in shadow. Fitted to 0.8 of it
 * there is a visible band of leaf above the first line and below the last,
 * which is what makes the type read as printed on the blade rather than as
 * trimmed to it.
 */
const BLADE_INSET = 0.8;

/**
 * How much of the blade's own lean the type takes on.
 *
 * At 1 the label is set exactly in the leaf's two axes, which are not square to
 * each other on screen — a surface turned away from you shears whatever is
 * printed on it, and at these angles that shear runs to thirty or forty degrees
 * of slant on every letterform. It is correct and it is most of the way to
 * unreadable. Blending the across axis back toward square to the baseline keeps
 * the label lying on the leaf, following its lean and its foreshortening, and
 * takes the worst of the slant off the glyphs.
 */
const SHEAR = 0.45;

/**
 * And the same margin along the blade.
 *
 * Without it the block is fitted to exactly the run it is given, so its first
 * and last characters sit on the two cross-sections that defined the fit — no
 * margin at all, and one frame of camera drift puts them over the edge. Several
 * frames were failing by two or three letters, which is all this is.
 */
const ALONG_INSET = 0.86;

const head = new Vector3();
const foot = new Vector3();
const flank = new Vector3();
const tummy = new Vector3();
const hemA = new Vector3();
const hemB = new Vector3();
const hemC = new Vector3();
const hemD = new Vector3();

/**
 * One leaf, and the block of scroll it is read in.
 *
 * This is press.stripe.com's homepage row: a band of the document that exists
 * to give one object a beat of its own, with the object itself drawn in the
 * fixed canvas behind the page and the band carrying the click. Their canvas is
 * `pointer-events: none` and the row is what you actually press; so is this
 * one, which is why the whole band takes the cursor and not just the label.
 */
function Leaf({ index }: { index: number }) {
  const step = timeline[index];
  const at = stepChapter(index);
  // Which half of the frame this label lives in when it cannot be pinned. Taken
  // off the leaf itself rather than from `index % 2`, which was a second
  // opinion on the same question and is now the wrong one — see LEAF_SIDE.
  const side = leafAt(index).side;
  const box = useRef<HTMLDivElement>(null);
  const href = hrefFor(step.id);
  const go = onNavigate(href);

  useJourney((c) => {
    const el = box.current;
    if (!el) return;
    // The last leaf has to be gone before the FAQ, which is a real block of
    // flow content arriving from below rather than another fixed overlay it
    // could cross-fade with.
    /*
     * ...and a tighter window than the showcases use.
     *
     * `station` holds full opacity out to 0.41 of a block either side, which is
     * right for a figure that does not change size. A leaf does: at the ends of
     * its window the camera has not arrived yet, the blade is small and far, and
     * the label has to shrink a long way to stay on it — legibly printed on the
     * leaf and too small to read. Rather than let it hang off the blade to stay
     * big, those frames simply fade: the label is at full size and full strength
     * in the middle third, which is the part anyone stops on.
     */
    /*
     * Full ink across the middle of a station, then a short fall.
     *
     * The ramp used to ease across the whole window, so a third of every
     * station was spent at an ink level where the title survives and the date
     * and the call to action do not — the two smallest lines die first, and a
     * label reading as two lines instead of four looks broken rather than
     * arriving. Flat then fast: it is either being read or it is not there.
     */
    const near = 1 - clamp((Math.abs(c - at) / STEP_SPAN - 0.24) / 0.1);
    const on =
      station(c, at, STEP_SPAN) * near * (1 - clamp((c - EXIT_AT) / EXIT_OVER));
    el.style.opacity = String(on);
    el.style.visibility = on < 0.01 ? "hidden" : "visible";
    if (on < 0.01) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    if (w < PINNED_FROM) {
      // Not on the leaf: a slot on the leaf's own side of the frame. At this
      // width the plant is most of the screen and the blade the type would be
      // set on is a couple of hundred pixels across at best, which is not a
      // page a paragraph can be printed on.
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.maxWidth = "";
      el.style.marginLeft = side === 1 ? "auto" : "";
      el.style.marginRight = side === -1 ? "auto" : "";
      el.style.position = "";
      el.style.textAlign = side === 1 ? "right" : "left";
      el.style.transformOrigin = "";
      el.style.transform = `translate3d(${-side * (1 - on) * 18}px, ${(c - at) * 80}px, 0)`;
      el.classList.remove("on-leaf");
      return;
    }

    /*
     * The blade's own two axes, projected.
     *
     * Three points off the leaf — its near end, its far end, and one half-blade
     * to the side of its middle — give a pair of screen vectors that are what
     * the leaf's surface looks like from here. Setting the type in that basis
     * is what puts it *on* the leaf: it runs along the blade, leans as the
     * blade leans, and narrows as the blade turns away.
     */
    const p0 = worldToScreen(leafSurfacePoint(index, FROM, 0, foot), w, h);
    const p1 = worldToScreen(leafSurfacePoint(index, TO, 0, head), w, h);
    /*
     * The two margins at the middle of the blade.
     *
     * Their midpoint is the centre of what you can actually see, and the vector
     * between them is its width. Taking the centre line for the middle instead
     * — which is the obvious reading of "on the leaf", and what this did — puts
     * the label along the blade's top edge with the whole leaf hanging below
     * it, because `fold` curls both margins down and the spine is therefore the
     * highest line on the surface, not the central one.
     */
    const pl = worldToScreen(leafSurfacePoint(index, MID, -1, flank), w, h);
    const pr = worldToScreen(leafSurfacePoint(index, MID, 1, tummy), w, h);
    /*
     * And the margins at the far end of the type's run, which is where the
     * label actually has to fit.
     *
     * A leaf is a lens, not a ribbon: it is widest in the middle and narrows to
     * a point at both ends. A rectangle of type measured against the middle is
     * therefore too tall for its own corners — the first and last lines run off
     * the edge of the blade well before the middle ones do, which is what the
     * overhang at the ends of these labels was. Measured against the narrower
     * end instead, the whole rectangle is inside the leaf.
     */
    const pe = worldToScreen(leafSurfacePoint(index, TO, -1, hemA), w, h);
    const pf = worldToScreen(leafSurfacePoint(index, TO, 1, hemB), w, h);
    // ...and at the near end too, because perspective is not symmetric. A leaf
    // angled toward the lens projects its far end larger than its middle and
    // its near end smaller, so "the width where the type ends" is only the
    // binding constraint on the half of them that lean away.
    const pg = worldToScreen(leafSurfacePoint(index, FROM, -1, hemC), w, h);
    const ph = worldToScreen(leafSurfacePoint(index, FROM, 1, hemD), w, h);
    if (!p0 || !p1 || !pl || !pr || !pe || !pf || !pg || !ph) {
      // Behind the lens: fall back to the slot rather than to a stale position,
      // which would leave a label sitting where the leaf used to be.
      el.style.position = "";
      el.style.transform = `translate3d(0, ${(c - at) * 80}px, 0)`;
      el.classList.remove("on-leaf");
      return;
    }

    // Along the blade, pointing whichever way keeps the type the right way up.
    const flip = p1.x < p0.x ? -1 : 1;
    let ax = (p1.x - p0.x) * flip;
    let ay = (p1.y - p0.y) * flip;
    const alongPx = Math.hypot(ax, ay) || 1;

    /*
     * The centre of the patch the type sits on, averaged over the three
     * cross-sections rather than taken at the middle one.
     *
     * Same reason as the extra samples: under perspective the middle of a
     * foreshortened blade is not halfway along its projection. Averaging the
     * three puts the block where the visible area actually is, which on the
     * leaves that lean toward the lens is most of a label's width from where
     * the mid-section alone would have put it.
     */
    let cx = (pl.x + pr.x + pe.x + pf.x + pg.x + ph.x) / 6;
    let cy = (pl.y + pr.y + pe.y + pf.y + pg.y + ph.y) / 6;
    // Half the blade's width, as a screen vector — direction from the middle,
    // where the type's baseline actually lies.
    let bx = (pr.x - pl.x) / 2;
    let by = (pr.y - pl.y) / 2;

    const boxW = NATURAL_W;
    // `maxWidth` as well as `width`: the class list carries the phone layout's
    // `max-w-[17rem]`, which silently held the block 68px narrower than the
    // number the fit below was solving with.
    el.style.width = `${boxW}px`;
    el.style.maxWidth = "none";
    const boxH = el.offsetHeight || 120;

    // The direction is the middle's — that is the blade's own across axis where
    // the label sits — but the amount the type is allowed is the end's.
    const acrossPx = Math.hypot(bx, by) || 1;
    // The narrowest the blade gets anywhere the type runs. A rectangle has to
    // clear its tightest cross-section, not its average one.
    const farPx = Math.hypot(pf.x - pe.x, pf.y - pe.y) / 2 || acrossPx;
    const nearPx = Math.hypot(ph.x - pg.x, ph.y - pg.y) / 2 || acrossPx;
    const fitPx = Math.min(acrossPx, farPx, nearPx);
    // Keep the across axis on the same side of the blade as the type's own
    // down direction, or the label comes out mirrored.
    if (ax * by - ay * bx < 0) {
      bx = -bx;
      by = -by;
    }

    /*
     * One scale for both axes, taken from whichever way round the leaf runs out
     * first — its length against the block's width, or its width against the
     * block's height.
     *
     * Uniform, not per-axis. Fitting each axis independently is the obvious
     * thing and it squashes the glyphs: a leaf is roughly twice as long as it
     * is wide and a four-line label is nearly four times as wide as it is tall,
     * so the two ratios are never close, and the difference between them lands
     * entirely on the letterforms.
     */
    /*
     * What the blade can actually hold, before any floor is applied.
     *
     * `MIN_SCALE` is a floor on how small the type may be set, which makes it a
     * licence to overhang: where a blade projects smaller than that, the block
     * stops shrinking and hangs off instead. That is what put the second leaf's
     * date line over the edge and onto the dark leaf behind it — dark ink on
     * dark green, invisible, and indistinguishable to a reader from being
     * occluded.
     *
     * So the raw fit is kept, and where it falls short the label is faded out
     * rather than made to fit by force. A caption that cannot be set on its leaf
     * at a readable size is better not drawn: those frames are the ends of a
     * station, arriving or leaving, and there is nothing there worth showing at
     * a third of its ink.
     */
    const rawFit = Math.min(
      (alongPx * ALONG_INSET) / boxW,
      (fitPx * 2 * BLADE_INSET) / boxH,
    );
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawFit));
    const fits = clamp((rawFit / MIN_SCALE - 0.82) / 0.18);
    if (fits < 0.999) el.style.opacity = String(Number(el.style.opacity) * fits);

    // The across axis, blended back toward square to the baseline — see SHEAR.
    const ux = ax / alongPx;
    const uy = ay / alongPx;
    const vx = bx / acrossPx;
    const vy = by / acrossPx;
    // Square to the baseline, on the same side as the blade's own across axis.
    const sx = -uy * Math.sign(ux * vy - uy * vx || 1);
    const sy = ux * Math.sign(ux * vy - uy * vx || 1);
    const kx = sx + (vx - sx) * SHEAR;
    const ky = sy + (vy - sy) * SHEAR;
    const kLen = Math.hypot(kx, ky) || 1;

    /*
     * Slide the block out along the blade, into whatever room the fit left.
     *
     * The label is usually narrower than the run it is fitted to — the fit is
     * capped by the blade's width, not its length — so there is slack, and the
     * block was spending all of it at the base end. That is the worst place for
     * it: the base is where the leaf above reaches down over this one, and the
     * date line, being the top-left corner of the block, is the first thing to
     * go under it. Pushed out toward the tip the same type sits on open blade.
     *
     * Toward the tip specifically, which is p0 → p1, not the reading direction
     * — those differ whenever the text runs right to left on screen.
     */
    const tipX = (p1.x - p0.x) / alongPx;
    const tipY = (p1.y - p0.y) / alongPx;
    const slack = Math.max(0, alongPx - boxW * scale) * 0.5 * 0.96;
    cx += tipX * slack;
    cy += tipY * slack;

    const ma = ux * scale;
    const mb = uy * scale;
    // The blend is renormalised and then re-foreshortened, so taking the slant
    // off does not also make the label taller than the leaf is wide.
    const squash = Math.abs(vx * sx + vy * sy);
    /*
     * The floor here is 0.88, not the 0.55 it was.
     *
     * `squash` is how foreshortened the blade's across-axis is, and it scales
     * the label's *vertical* axis — so at 0.55 a label was being compressed to
     * a little over half its own height while keeping its width. Type does not
     * survive that: the second line of a two-line title climbed into the
     * descenders of the first and the date and location lines closed onto it,
     * which is the "glyphs touching" that made these read as a rendering fault
     * rather than as a wrap. Honesty about the surface is worth less than
     * leading, so the compression stops at 12%.
     */
    const mc = (kx / kLen) * scale * Math.max(0.88, squash);
    const md = (ky / kLen) * scale * Math.max(0.88, squash);
    // Origin at the box's top-left, and the translation solved so that its
    // centre lands on the middle of the blade. Stacking `translate()`s around
    // the matrix instead would put those offsets in transformed space.
    const tx = cx - ma * (boxW / 2) - mc * (boxH / 2);
    const ty = cy - mb * (boxW / 2) - md * (boxH / 2);

    el.style.position = "absolute";
    el.style.marginLeft = "";
    el.style.marginRight = "";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.textAlign = "left";
    el.style.transformOrigin = "0 0";
    el.style.transform =
      `matrix(${ma.toFixed(4)}, ${mb.toFixed(4)}, ${mc.toFixed(4)}, ` +
      `${md.toFixed(4)}, ${tx.toFixed(1)}, ${(ty + (1 - on) * 10).toFixed(1)})`;
    el.classList.add("on-leaf");
  });

  return (
    <div
      className="relative cursor-pointer"
      style={{ height: `${LAYOUT.stemStepVh}svh` }}
      onClick={(e) => {
        // The band is a click target the way Stripe's book rows are, but it is
        // also a screenful of page: a click that ends a text selection, or one
        // aimed at the link inside it, is not a click on the band.
        if (e.defaultPrevented) return;
        if (!window.getSelection()?.isCollapsed) return;
        go(e);
      }}
    >
      {/* Fixed, not sticky: a leaf's block is deliberately shorter than the
          viewport — that is its pacing — and sticky inside a box smaller than
          the thing being stuck simply never sticks. */}
      <div className="pointer-events-none fixed inset-0 z-10 flex items-center px-5 sm:px-10">
        {/* No panel, and no leader either. The four of these were cards
            floating beside the plant, then bare type with a line drawn to the
            blade — and a line drawn to a thing is still a caption standing
            somewhere else. The type is set on the leaf now, in the leaf's own
            two axes, so the label is not pointing at the object: it is written
            on it.

            Which flips the contrast. Everywhere else on this site near-white
            type is held against a dark field by `type-shadow`; here it is dark
            type on a lit blade, so `on-leaf` in index.css swaps the ink and
            turns the shadow into a pale one. The one-line summary went with the
            box: a leaf is a small page, and the field says what and where while
            the leaf's own page says what the work was. */}
        <div
          ref={box}
          className={`type-shadow pointer-events-auto w-full max-w-[17rem] opacity-0 will-change-transform ${
            side === 1 ? "ml-auto text-right" : "mr-auto text-left"
          }`}
        >
          {/* The hover target is the type, not the band of scroll behind it.
              The band is a whole screen of page and is only the click target;
              a leaf that lifted whenever the cursor was anywhere in that screen
              would be answering something the reader had not done. */}
          <a
            href={href}
            onClick={go}
            onPointerEnter={() => setLeafHover(index, true)}
            onPointerLeave={() => setLeafHover(index, false)}
            onFocus={() => setLeafHover(index, true)}
            onBlur={() => setLeafHover(index, false)}
            className="group block"
          >
            <p className="leaf-eyebrow font-sans text-[0.78rem] uppercase tracking-[0.2em] text-ember">
              {step.when}
            </p>
            <h3 className="leaf-title mt-1.5 font-display text-[1.3rem] leading-[1.22] text-ink transition-colors group-hover:text-bloom">
              {step.leafTitle}
            </h3>
            <p className="mt-3 text-[13.5px] uppercase tracking-[0.08em] text-ink/85">
              {step.leafWhere}
            </p>
            <p className="leaf-cta mt-3 text-[13px] uppercase tracking-[0.14em] text-bloom">
              Open this leaf
              <span
                aria-hidden="true"
                className="ml-1.5 inline-block transition-transform duration-300 group-hover:translate-x-0.5"
              >
                →
              </span>
            </p>
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * A demonstration, given a block of scroll to be read in.
 *
 * Same slot as a step card and the same alternation, only wider — the stem
 * still runs down the gap the two of them leave between each other.
 */
function Demo({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div style={{ height: `${SHOWCASE_VH}svh` }}>
      <div
        className={`pointer-events-none fixed inset-0 z-10 flex items-center px-5 sm:px-10 ${
          index % 2 === 0 ? "justify-end" : "justify-start"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function Steps() {
  const section = useAct("stem");
  const intro = useRef<HTMLDivElement>(null);
  const titleEnd = chapterAt(LAYOUT.stemTitleVh);

  useJourney((c) => {
    const el = intro.current;
    if (!el) return;
    // Starts after the bloom overlay is fully down at 3.0, and is gone by the
    // end of its own block — the first demonstration is directly behind it.
    const t = clamp((c - 3) / (titleEnd - 3));
    const on = clamp(t / 0.17) * (1 - clamp((t - 0.76) / 0.24));
    el.style.opacity = String(on);
    el.style.transform = `translate3d(0, ${(1 - on) * -24}px, 0)`;
    el.style.visibility = on < 0.01 ? "hidden" : "visible";
  });

  return (
    <section
      ref={section as React.RefObject<HTMLElement>}
      aria-label="Projects and experience"
      className="relative"
    >
      <div style={{ height: `${LAYOUT.stemTitleVh}svh` }}>
        <div className="pointer-events-none fixed inset-0 z-10 flex items-end justify-center px-5 pb-[14svh]">
          <div
            ref={intro}
            className="type-shadow max-w-2xl text-center opacity-0 will-change-transform"
          >
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink">
              Projects &amp; experience
            </p>
          </div>
        </div>
      </div>

      <Demo index={0}>
        <BurgersShowcase at={showcaseChapter(0)} span={SHOWCASE_SPAN} />
      </Demo>
      <Demo index={1}>
        <GnrShowcase at={showcaseChapter(1)} span={SHOWCASE_SPAN} />
      </Demo>

      {/* As with #research: on the first station, not on the run-up in front of
          it. */}
      <div id="experience" className="absolute" style={{ top: `${LAYOUT.stemIntroVh}svh` }} />
      {timeline.map((step, i) => (
        <Leaf key={step.id} index={i} />
      ))}
    </section>
  );
}
