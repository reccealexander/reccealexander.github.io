import { useRef, useState } from "react";
import { Vector3 } from "three";
import { featureCards } from "@/lib/features";
import { featureChapter, LAYOUT, stationGlow } from "@/lib/journey";
import { petalLabel, petalTip, worldToScreen } from "@/lib/flowerLayout";
import { useAct } from "@/lib/scroll";
import { clamp } from "@/lib/math";
import { useJourney } from "./useJourney";
import Glyph from "./Glyph";

/**
 * The flower reading of the research: the bloom in the scene behind the page
 * has eight petals, and each of them is one of the eight things I work on.
 *
 * The labels are a fixed overlay rather than flow content, because the thing
 * they annotate is fixed too. They are positioned by running the live camera
 * over each petal's tip — the same numbers the mesh was built from — so a label
 * sits on its petal at any window size and through the whole slow turn the
 * camera makes around the bloom. Nothing here was measured once and written
 * down.
 *
 * Petals light up in turn and stay lit, so the bloom fills in as you read.
 */

const tip = new Vector3();
const anchor = new Vector3();

/** Clearance kept between a label and the edge of the frame. */
const PAD = 20;
/** And between a label and the lit petal it is pointing at. */
const LABEL_CLEARANCE = 30;
/**
 * Clearance kept at the top of the frame.
 *
 * This used to be the height of the fixed nav, which a label had to stay out
 * from under. There is no nav any more, so it is just a margin — but not zero:
 * a caption whose first line touches the top edge of the window reads as
 * something that has been cut off.
 */
const NAV = 24;

/**
 * Below this the labels come off entirely and the card at the foot of the
 * frame carries the act on its own.
 *
 * Eight captions pinned around a bloom need somewhere to be pinned to. On a
 * phone the bloom is most of the width, so every label lands on top of the
 * flower it is annotating and its leader has nowhere to run — the DOM site
 * solves the same problem by not drawing the flower at all under a certain
 * width. The card is already carrying the copy; this stops the labels fighting
 * it.
 *
 * It has to be exactly Tailwind's `lg`, because that is the breakpoint the
 * card's own title is hidden at. Any gap between the two is a band of widths
 * showing the same five words twice in one frame.
 */
const LABELS_FROM = 1024;

export default function Features() {
  const section = useAct("bloom");
  const overlay = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const leaders = useRef<(HTMLDivElement | null)[]>([]);
  const card = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);

  useJourney((c) => {
    // The overlay is only up while the bloom is the subject.
    // Held back until the first label is legible. Before, the card arrived a
    // screenful earlier than the caption naming it, so feature one was a glyph,
    // an "01 / 08" and an unattributed paragraph for 750px of scroll.
    const up = clamp((c - 2.16) / 0.07) * (1 - clamp((c - 2.94) / 0.06));
    if (overlay.current) {
      overlay.current.style.opacity = String(up);
      overlay.current.style.visibility = up < 0.01 ? "hidden" : "visible";
    }
    if (up < 0.01) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const wide = w >= LABELS_FROM;
    // Labels must clear the card at the foot of the frame. Guessing its height
    // put the lowest one twelve pixels *inside* it, which at that petal's own
    // station hid the one label that was supposed to be at full brightness and
    // left its leader running down into nothing.
    const cardTop = card.current?.getBoundingClientRect().top ?? h;
    const floor = Math.min(h - PAD, cardTop) - 28;
    let nearest = 0;
    let best = Infinity;

    featureCards.forEach((_, i) => {
      const at = featureChapter(i);
      const d = Math.abs(c - at);
      if (d < best) {
        best = d;
        nearest = i;
      }

      const label = labels.current[i];
      const leader = leaders.current[i];
      if (!label || !leader) return;
      if (!wide) {
        label.style.opacity = "0";
        leader.style.opacity = "0";
        return;
      }

      const a = worldToScreen(petalLabel(i, anchor), w, h);
      const t = worldToScreen(petalTip(i, tip), w, h);
      if (!a || !t) {
        label.style.opacity = "0";
        leader.style.opacity = "0";
        return;
      }

      /*
       * Pushed clear of the petal it names.
       *
       * The layout's anchor sits just outside a tip, which at this range is
       * still on the lit part of the bloom — near-white type on a cream petal,
       * and it used to need a backdrop of its own to survive there. Moving it
       * is the cheaper fix and the honest one: another thirty pixels along the
       * line the leader is already drawing puts every caption on grass, the
       * leader simply gets longer, and nothing about which petal is being
       * pointed at changes.
       */
      const outX = a.x - t.x;
      const outY = a.y - t.y;
      const reach = Math.hypot(outX, outY) || 1;
      a.x += (outX / reach) * LABEL_CLEARANCE;
      a.y += (outY / reach) * LABEL_CLEARANCE;

      // A label reads outward from its petal, so the ones on the left of the
      // bloom are set flush right and vice versa — and then the whole box is
      // pushed back inside the viewport, because a petal pointing at the edge
      // of the frame would otherwise hang its caption off it.
      const left = a.x < t.x - 12;
      const centred = Math.abs(a.x - t.x) <= 12;
      const boxW = label.offsetWidth || 176;
      const rawX = left ? a.x - boxW : centred ? a.x - boxW / 2 : a.x;
      const x = Math.max(PAD, Math.min(w - PAD - boxW, rawX));
      // Clamped on the box's own top edge, not its centre: these are
      // translateY(-50%), so a two-line label clamped by its middle can put
      // its first line ten pixels behind an opaque nav bar.
      const half = label.offsetHeight / 2 || 12;
      const y = Math.max(NAV + half + 10, Math.min(floor, a.y));
      label.style.textAlign = left ? "right" : "left";
      label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`;

      // The leader is drawn to wherever the label actually ended up, not to
      // where it was asked to go, or clamping would leave it pointing at air.
      const endX = left ? x + boxW : x;
      const dx = endX - t.x;
      const dy = y - t.y;
      leader.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
      leader.style.width = `${Math.max(0, Math.hypot(dx, dy) - 10).toFixed(1)}px`;

      // Lit once reached, brightest as it is read.
      const reached = c > at - 0.03 ? 1 : 0;
      const glow = stationGlow(c, at, 0.05);
      /*
       * A read label stays up, but only just — and never below the point
       * where it is legible.
       *
       * At 0.3 it measured 1.4:1 against the lit bloom it was sitting on,
       * which is not faint, it is not there: six illegible strings scattered
       * over a flower, reading as visual noise pretending to be an index. The
       * floor here is what keeps them as an index, and the clearance above is
       * what keeps them off the petals while they wait.
       */
      label.style.opacity = String(0.62 * reached + 0.38 * clamp(glow * 1.6));
      label.style.filter = `blur(${(1 - reached) * 2}px)`;
      // A one-pixel hairline at a quarter opacity over variegated grass is not
      // a connector, it is nothing — and without a visible connector eight
      // captions scattered round a bloom are not attached to anything.
      leader.style.opacity = String(0.5 * reached + 0.5 * clamp(glow * 1.6));
      leader.style.backgroundColor = glow > 0.4 ? "var(--color-ember)" : "var(--color-ink)";
    });

    if (nearest !== activeRef.current) {
      activeRef.current = nearest;
      setActive(nearest);
    }
    if (card.current) card.current.style.opacity = String(up);
  });

  const current = featureCards[active];

  return (
    <>
      <section
        ref={section as React.RefObject<HTMLElement>}
        aria-label="Research"
        className="relative"
      >
        {/* Pure scroll length: the bloom is drawn by the fixed canvas behind
            the page, and these blocks are what give it eight beats to be read
            in. */}
        <div style={{ height: `${LAYOUT.bloomIntroVh}svh` }} />
        {/* The anchor sits here rather than on the act that precedes it. A
            section's top edge is where its *scroll length* begins, which for
            these is a screenful or more before there is anything to read; a
            pasted `#research` used to land on a frame of grass two thousand
            pixels short of the first feature. */}
        <div id="research" className="absolute" style={{ top: `${LAYOUT.bloomIntroVh}svh` }} />
        {featureCards.map((c) => (
          <div key={c.id} style={{ height: `${LAYOUT.bloomPetalVh}svh` }} />
        ))}
      </section>

      {/* The labels, and the petal being read spelled out at the foot of the
          frame so the copy never chases a label around the bloom. */}
      <div
        ref={overlay}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-20 opacity-0"
      >
        {featureCards.map((c, i) => (
          <div key={c.id}>
            <div
              ref={(el) => {
                leaders.current[i] = el;
              }}
              className="absolute left-0 top-0 h-px origin-left bg-ink/60 opacity-0"
            />
            <div
              ref={(el) => {
                labels.current[i] = el;
              }}
              className="type-shadow absolute left-0 top-0 w-[13.5rem] opacity-0"
            >
              <p className="font-display text-[0.95rem] leading-snug text-ink">
                <span className="mr-2 font-sans text-[0.6rem] tracking-[0.2em] text-ember">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {c.title}
              </p>
            </div>
          </div>
        ))}

        <div ref={card} className="absolute inset-x-0 bottom-8 flex justify-center px-6">
          <div
            key={current.id}
            className="pane max-w-[54ch] rounded-lg px-6 py-5 motion-safe:animate-[station-in_380ms_cubic-bezier(0.32,0.72,0,1)]"
          >
            <div className="mb-3 flex items-center gap-3 text-muted">
              <Glyph id={current.glyph} />
              <span className="font-sans text-[0.62rem] tracking-[0.26em] text-ember/90">
                {String(active + 1).padStart(2, "0")} / 08
              </span>
            </div>
            {/* No title here on wide viewports: the label pinned to the petal
                being read is already carrying it, and the same five words
                twice in one frame is two things competing for one glance. The
                first attempt at this deleted the words from the *label*
                instead, which left the one annotation at full brightness as a
                bare two-digit number pointing at nothing. Under the label
                threshold there are no labels, so the card takes it back. */}
            <p className="font-display text-lg text-ink lg:hidden">{current.title}</p>
            <p className="text-[13px] leading-relaxed text-muted max-lg:mt-2">
              {current.body}
            </p>
          </div>
        </div>
      </div>

      {/* The same eight, in flow and readable without the scene — the résumé
          the flower is an enhancement over. */}
      <div className="sr-only">
        <h2>Research</h2>
        <dl>
          {featureCards.map((c) => (
            <div key={c.id}>
              <dt>{c.title}</dt>
              <dd>{c.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
