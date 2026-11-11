import { forwardRef, useEffect, useRef, useState } from "react";
import { hero } from "@/lib/copy";
import { LAYOUT } from "@/lib/journey";
import { useAct } from "@/lib/scroll";
import { clamp } from "@/lib/math";
import { useJourney } from "./useJourney";
import { reducedMotion } from "@/three/quality";
import Wordmark from "./Wordmark";
import { useTimeOfDay, type TimeOfDay } from "@/lib/timeOfDay";

/*
 * The leaf is a picture in the page, not part of the scene, so the grade that
 * changes the field's light cannot reach it — left alone it stays morning-green
 * over a field at dusk. This is the same change, approximately, in CSS.
 */
const LEAF_LIGHT: Record<TimeOfDay, string> = {
  morning: "none",
  sunset: "sepia(0.35) saturate(1.3) hue-rotate(-14deg) brightness(0.9)",
  evening: "brightness(0.5) saturate(0.55) hue-rotate(28deg)",
};

/**
 * Standing in the field, at your own height.
 *
 * One line of type on a field of grass, and a leaf. There was an eyebrow, a
 * tagline, a paragraph, two buttons and a credentials line under it — all of it
 * gone. What is left is the name, the leaf that flies in behind it, and
 * the field they are standing in: everything the copy used to assert up here
 * is said properly a screen further down, by the eight petals and the four
 * leaves, and said with the plant rather than at the reader.
 *
 * The leaf is the one thing on the first screen you can touch. It leans up
 * into the cursor, and pressed, it catches the wind again and leaves off the
 * right of the screen, leaving the name on the grass.
 *
 * The scene is pitched dark enough to carry near-white copy, and the mark wears
 * a tight outline of its own rather than sitting on a scrim. On the way out it
 * outruns the field and tips back into the page, which clears the frame before
 * the camera starts closing on the flower.
 */

/** How long the leaf takes to cross, in seconds. */
const FLIGHT = 2.6;
const LEAD_IN = 0.55;
/** How long it takes to clear the right edge once pressed, in seconds. */
const LEAVE = 1.25;
/** Where the leaf comes to rest, in degrees. */
const REST_ROT = -7;
/** What a hover adds: a little more size, and the tip lifted. */
const HOVER_SCALE = 0.14;
const HOVER_ROT = -9;
/** Below this alpha the leaf image is background, not leaf. */
const SOLID = 40;

export default function Hero() {
  const section = useAct("hero");
  const mark = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const time = useTimeOfDay();
  /*
   * After the leaf has been sent off it comes back, bigger, and settles in the
   * middle of the screen as a card: the name across the top and room for a
   * description under it, the field still showing either side.
   */
  const [returned, setReturned] = useState<"no" | "entering" | "in">("no");
  const comeBack = useRef<() => void>(() => {});
  comeBack.current = () => {
    setReturned("entering");
    // Two frames at the start pose, so the browser has something to
    // transition from.
    requestAnimationFrame(() => requestAnimationFrame(() => setReturned("in")));
  };

  useJourney((c) => {
    const t = clamp(c);
    const fade = String(1 - clamp((t - 0.22) / 0.7));
    const lift = `translate3d(0, ${-t * 46}%, 0) rotateX(${t * 14}deg)`;
    if (mark.current) {
      mark.current.style.opacity = fade;
      mark.current.style.transform = lift;
    }
    // The card leaves the way the name did, as the page scrolls on.
    if (card.current) {
      card.current.style.opacity = fade;
      card.current.style.transform = lift;
    }
  });

  /*
   * The leaf: in, at rest, and away — one loop, so each hands over to the next
   * from wherever the last one actually left it rather than from where it was
   * supposed to be.
   *
   * The flight in is driven by a continuous function rather than by keyframes.
   * A polyline of eased segments forces velocity to zero at every node, so the
   * leaf visibly stops eight times on the way in; that stutter is what reads
   * as mechanical, not the shape of the path. Summing two sine waves whose
   * frequencies are not integer multiples gives motion that never repeats,
   * never stalls, and has continuous velocity everywhere. The flight away is
   * the same wind, run the other way: it starts gentle and gathers.
   *
   * The flight hangs off the fonts resolving, because the wordmark cannot
   * settle until it has been measured, and starting the flight on mount would
   * drift by however long the font took.
   */
  useEffect(() => {
    const el = leaf.current;
    const img = el?.querySelector("img");
    if (!el || !img) return;
    const still = reducedMotion();

    // Phases are jittered per load so no two arrivals are identical, and
    // bounded so a bad draw can only look different, never broken.
    const jitter = () => (Math.random() * 2 - 1) * 0.55;
    const phaseA = 1.05 + jitter();
    const phaseB = 0.45 + jitter();
    const F_SLOW = 3.3; // lifts and drops per flight
    const F_FAST = 5.6; // the flutter riding on top; deliberately not a multiple

    const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const inOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
    // Everything the wind does fades out on this curve. It holds near full
    // strength for most of the crossing and only lets go near the end — a
    // plain (1-t) decay strands the last third as a dead straight glide.
    const gust = (t: number) => Math.pow(1 - Math.pow(t, 2.4), 1.2);
    const wave = (t: number, lead: number) =>
      Math.sin(2 * Math.PI * F_SLOW * t + phaseA + lead) +
      0.5 * Math.sin(2 * Math.PI * F_FAST * t + phaseB + lead * 2.2);

    type Phase = "waiting" | "in" | "rest" | "away" | "gone";
    let phase: Phase = still ? "rest" : "waiting";
    let t0 = 0;
    let last = 0;
    let raf = 0;
    let cancelled = false;
    // The pose as last drawn, which is also what the hit test inverts.
    let rot = REST_ROT;
    let scale = 1;
    let hoverTarget = 0;
    let hover = 0;
    // Where it was when pressed, so the way out starts from there.
    let leaveFrom = { rot: REST_ROT, scale: 1, dist: 0 };

    const draw = (xPct: number, yPct: number, dx: number, dy: number, opacity: number) => {
      el.style.opacity = String(opacity);
      el.style.transform =
        `translate(-50%, -50%) translate(${xPct}%, ${yPct}%) translate(${dx}px, ${dy}px) ` +
        `rotate(${rot}deg) scale(${scale})`;
    };

    const step = (now: number) => {
      if (cancelled) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      let again = false;

      if (phase === "in") {
        const p = clamp((now - t0) / 1000 / FLIGHT);
        const g = gust(p);
        const x = -260 * (1 - inOutSine(p)) + 7 * g * wave(p, 2.4);
        const y = -110 * (1 - outCubic(p)) + 26 * g * wave(p, 0);
        // One motion, so the tilt is driven by the same wave a beat later: the
        // leaf tips as it falls and rights itself as it lifts.
        rot = REST_ROT * outCubic(p) + 34 * g * wave(p, 0.5);
        scale = 0.1 + 0.9 * Math.pow(p, 1.7);
        draw(x, y, 0, 0, 0.95 * outCubic(Math.min(1, p / 0.14)));
        if (p < 1) again = true;
        else {
          phase = "rest";
          el.disabled = false;
          // A cursor already parked where it landed is a hover, even though it
          // has not moved since.
          if (pointer) hoverTarget = onLeaf(pointer.x, pointer.y) ? 1 : 0;
          if (hoverTarget) el.style.cursor = "pointer";
          again = hoverTarget !== hover;
        }
      } else if (phase === "rest") {
        // A critically damped follow rather than a CSS transition, so a hover
        // that lands mid-lean picks up from the lean instead of restarting.
        hover += (hoverTarget - hover) * (1 - Math.exp(-dt * 11));
        if (Math.abs(hoverTarget - hover) < 0.002) hover = hoverTarget;
        rot = REST_ROT + HOVER_ROT * hover;
        scale = 1 + HOVER_SCALE * hover;
        draw(0, 0, 0, 0, 0.95);
        again = hover !== hoverTarget;
      } else if (phase === "away") {
        const p = clamp((now - t0) / 1000 / LEAVE);
        // Gathers rather than fades: the wind is picking up, not letting go.
        const g = 1 - gust(p);
        const run = Math.pow(p, 2.1);
        const dx = leaveFrom.dist * run + 18 * g * wave(p, 2.4);
        const dy = -window.innerHeight * 0.22 * outCubic(p) + 30 * g * wave(p, 0);
        rot = leaveFrom.rot + 70 * run + 26 * g * wave(p, 0.5);
        scale = leaveFrom.scale * (1 + 0.25 * run);
        draw(0, 0, dx, dy, 0.95);
        if (p < 1) again = true;
        else {
          phase = "gone";
          el.style.visibility = "hidden";
          comeBack.current();
        }
      }

      if (again) raf = requestAnimationFrame(step);
      else last = 0;
    };

    const kick = () => {
      if (!raf || !last) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(step);
      }
    };

    /*
     * Hover follows the leaf, not the box it is drawn in.
     *
     * The image is a long tapering blade in a rectangle that is half empty,
     * and a cursor in an empty corner growing the leaf reads as a misfire.
     * So the pointer is carried back into the image's own unrotated frame —
     * the pose is ours, so the inverse is exact — and checked against the
     * alpha of a small copy of it.
     */
    const mask = document.createElement("canvas");
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    let maskData: ImageData | null = null;
    const buildMask = async () => {
      if (!mctx || !img.naturalWidth) return;
      const w = 240;
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      // Resized by the browser off the main thread; drawn here it was a 15 ms
      // downscale of the full image in the middle of startup.
      const small = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h }).catch(
        () => null,
      );
      if (cancelled) return;
      mask.width = w;
      mask.height = h;
      mctx.drawImage(small ?? img, 0, 0, w, h);
      small?.close();
      // A host that serves the image cross-origin taints the canvas; the box
      // is a worse hit area than the leaf but a much better one than none.
      try {
        maskData = mctx.getImageData(0, 0, w, h);
      } catch {
        maskData = null;
      }
    };
    // Not at startup: reading the image back is a decode and a copy on the main
    // thread, and the first second is when the field is growing in. Until it is
    // built the hit area is the box, and nobody can hover a leaf that is still
    // three seconds from landing.
    const whenIdle =
      (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ??
      ((cb: () => void) => window.setTimeout(cb, 200));
    void img
      .decode()
      .catch(() => {})
      .then(() => !cancelled && whenIdle(() => !cancelled && void buildMask()));

    const onLeaf = (cx: number, cy: number) => {
      if (!maskData) return true;
      const box = el.getBoundingClientRect();
      const a = (-rot * Math.PI) / 180;
      const px = cx - (box.left + box.width / 2);
      const py = cy - (box.top + box.height / 2);
      const u = (px * Math.cos(a) - py * Math.sin(a)) / scale / el.offsetWidth + 0.5;
      const v = (px * Math.sin(a) + py * Math.cos(a)) / scale / el.offsetHeight + 0.5;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
      const i = (Math.floor(v * maskData.height) * maskData.width + Math.floor(u * maskData.width)) * 4;
      return maskData.data[i + 3] > SOLID;
    };

    const setHover = (on: boolean) => {
      if (phase === "away" || phase === "gone") return;
      el.style.cursor = on && phase === "rest" ? "pointer" : "";
      const target = on ? 1 : 0;
      if (target === hoverTarget) return;
      hoverTarget = target;
      if (still) {
        hover = target;
        rot = REST_ROT + HOVER_ROT * hover;
        scale = 1 + HOVER_SCALE * hover;
        draw(0, 0, 0, 0, 0.95);
      } else if (phase === "rest") kick();
    };

    /*
     * Hover is read off the window, not the button. The button hears nothing
     * while it is disabled for the flight in, and anything that ever ends up
     * layered over the hero would swallow its events too; the hit test above
     * is exact on its own, so it needs nothing from the DOM but coordinates.
     */
    let pointer: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointer = { x: e.clientX, y: e.clientY };
      setHover(onLeaf(e.clientX, e.clientY));
    };
    const onLeave = () => {
      pointer = null;
      setHover(false);
    };
    const onFocus = () => el.matches(":focus-visible") && setHover(true);
    const onBlur = () => setHover(false);

    const onClick = (e: MouseEvent) => {
      if (phase !== "rest") return;
      // A real click has to land on the leaf; a keyboard press (detail 0)
      // has no position and is always meant.
      if (e.detail > 0 && !onLeaf(e.clientX, e.clientY)) return;
      el.style.cursor = "";
      el.disabled = true;
      if (still) {
        phase = "gone";
        el.style.visibility = "hidden";
        comeBack.current();
        return;
      }
      // Far enough that the whole leaf, at its largest and most turned, is
      // past the edge: from its left side to the screen's right, plus its own
      // diagonal again.
      const box = el.getBoundingClientRect();
      leaveFrom = {
        rot,
        scale,
        dist: window.innerWidth - box.left + Math.hypot(box.width, box.height) * 1.4,
      };
      phase = "away";
      t0 = performance.now();
      kick();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    el.addEventListener("click", onClick);

    let timer = 0;
    if (still) {
      el.disabled = false;
      draw(0, 0, 0, 0, 0.95);
    } else {
      timer = window.setTimeout(() => {
        const ready = document.fonts?.ready ?? Promise.resolve();
        void ready.then(() => {
          if (cancelled) return;
          phase = "in";
          t0 = performance.now();
          kick();
        });
      }, LEAD_IN * 1000);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <section
      id="top"
      ref={section as React.RefObject<HTMLElement>}
      aria-label="Introduction"
      className="relative flex flex-col items-center justify-center px-6 text-center"
      style={{ perspective: "1100px", minHeight: `${LAYOUT.heroVh}svh` }}
    >
      <div
        ref={mark}
        className="relative will-change-transform"
        // One width for the leaf, and the name sized off it, so the two stay
        // locked together at every viewport instead of drifting apart between
        // two independent clamps.
        style={{ "--leaf": "clamp(15rem,30vw,25rem)" } as React.CSSProperties}
      >
        {/* The leaf flies in behind the wordmark and rests there. It is
            inside the mark group, so the parallax carries the two off
            together rather than leaving it hanging over the field. Offset so
            the name lands centred on the blade, along the midrib, rather than
            on the stalk side, in units of the leaf's own width. It sits under the name by
            document order alone; a negative z-index inside the hero's 3D tilt
            is exactly where browsers disagree about hit-testing. Disabled until
            it has landed, so it cannot be sent off mid-arrival. */}
        <button
          ref={leaf}
          type="button"
          disabled
          aria-label="Send the leaf off"
          style={{ left: "calc(50% - var(--leaf) * 0.05)", top: "calc(50% + var(--leaf) * 0.012)" }}
          className="absolute block w-[var(--leaf)] cursor-default opacity-0 outline-none will-change-transform disabled:cursor-default"
        >
          <img
            src="/media/leaf.svg"
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ filter: LEAF_LIGHT[time], transition: "filter 1.5s ease" }}
            className="pointer-events-none block w-full max-w-none drop-shadow-[0_10px_24px_rgba(6,16,9,0.32)]"
          />
        </button>
        {/* Sized to sit on the leaf: the line runs about two-thirds of the
            leaf's width, which is the band of the blade wide enough to carry
            it clear of the stalk and the narrowing tip. Regular weight, not
            bold. It lets the pointer through, so hovering the name is hovering
            the leaf. */}
        <h1
          className="mark-shadow pointer-events-none relative z-10 whitespace-nowrap font-display font-normal leading-[0.98] tracking-tight transition-opacity duration-500"
          // Once the leaf is back as the card, the name is read off the card;
          // this one stays in the document for anything reading the page.
          style={{ fontSize: "calc(var(--leaf) * 0.085)", opacity: returned === "no" ? 1 : 0 }}
        >
          <Wordmark text={hero.wordmark} />
        </h1>
      </div>

      {returned !== "no" && (
        <LeafCard ref={card} settled={returned === "in"} light={LEAF_LIGHT[time]} />
      )}
    </section>
  );
}

/**
 * The leaf come back: the middle of the screen, the field showing either side.
 *
 * Lying across a wide screen; standing up, stalk uppermost, on a tall one,
 * where lying down it would be a strip too thin to write on. Stalk up rather
 * than tip up because the blade is widest a third of the way from the stalk,
 * and that is where the name goes. The slot is the card's
 * final box and never moves — the groundhog reads it to keep out from behind
 * the card (see three/Groundhog.tsx) — and the leaf inside it is what flies.
 */
const LeafCard = forwardRef<HTMLDivElement, { settled: boolean; light: string }>(function LeafCard(
  { settled, light },
  ref,
) {
  const calm = reducedMotion();
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 flex items-center justify-center will-change-transform"
      style={{ perspective: "1100px" }}
    >
      <div
        data-leaf-panel=""
        className="relative aspect-[1200/560] w-[min(68vw,135svh)] portrait:aspect-[560/1200] portrait:w-[min(64vw,38svh)]"
      >
        <div
          className="absolute inset-0"
          style={{
            transform: settled
              ? "translate3d(0,0,0) rotate(0deg) scale(1)"
              : "translate3d(calc(50vw + 75%), -6vh, 0) rotate(16deg) scale(0.7)",
            // Swung in rather than slid: a touch past and back.
            transition: calm ? "none" : "transform 1.15s cubic-bezier(0.2, 1.08, 0.32, 1)",
          }}
        >
          {/* Across a wide screen as drawn; turned stalk-up on a tall one. */}
          <img
            src="/media/leaf.svg"
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ filter: light, transition: "filter 1.5s ease" }}
            className="absolute left-1/2 top-1/2 h-full w-full max-w-none -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_18px_36px_rgba(6,16,9,0.38)] portrait:h-[min(64vw,38svh)] portrait:w-[calc(min(64vw,38svh)*2.1429)] portrait:rotate-90"
          />
          {/* The writing, kept on the blade: clear of the stalk end and the
              narrowing tip. The name across the top; the rest of the space
              is the description's. */}
          <div className="absolute bottom-[18%] left-[22%] right-[10%] top-[21%] flex flex-col items-center text-center portrait:bottom-[18%] portrait:left-[14%] portrait:right-[14%] portrait:top-[22%]">
            <p
              aria-hidden="true"
              className="mark-shadow whitespace-nowrap text-balance font-display font-normal leading-none tracking-tight text-[calc(min(68vw,135svh)*0.062)] portrait:whitespace-normal portrait:text-[calc(min(64vw,38svh)*0.13)] portrait:leading-[1.05]"
            >
              {hero.wordmark}
            </p>
            <p className="type-shadow mt-[4%] w-full flex-1 text-balance text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed text-ink">
              {hero.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
