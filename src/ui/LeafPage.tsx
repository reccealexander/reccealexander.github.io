import { useEffect } from "react";
import { timeline } from "@/lib/features";
import { contact } from "@/lib/copy";
import { hrefFor, navigate, onNavigate } from "@/lib/router";
import { useBiome } from "./BiomeContext";
import LeafStage from "./LeafStage";

/**
 * One leaf, on its own page.
 *
 * The shape is press.stripe.com's book page: the object held on one side and
 * pinned there while the reading column scrolls past it, the long copy in a
 * single measure under a large lede, and the rest of the collection offered at
 * the bottom rather than in a nav bar. What is different is that this page has
 * a way home in it, because this site has no persistent header to be a way home
 * — the banner is gone, so the page has to carry its own exit.
 */
export default function LeafPage({ id }: { id: string }) {
  const { biome } = useBiome();
  const index = timeline.findIndex((s) => s.id === id);
  const step = timeline[index];

  // A page is a page: it opens at the top, whatever the field was doing.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [id]);

  useEffect(() => {
    if (!step) return;
    const previous = document.title;
    document.title = `${step.title} — ${step.detail.institution} · Alexander Recce`;
    return () => {
      document.title = previous;
    };
  }, [step]);

  // Escape goes back, the way it closes an overlay on the site this is copied
  // from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!step) {
    return (
      <main className="mx-auto flex min-h-[100svh] max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.24em] text-ember">Nothing here</p>
        <h1 className="mt-4 font-display text-4xl text-ink">No leaf by that name.</h1>
        <a
          href="/"
          onClick={onNavigate("/")}
          className="mt-8 text-sm text-ink underline decoration-ink/40 underline-offset-4 transition-colors hover:decoration-ember"
        >
          Back to the field
        </a>
      </main>
    );
  }

  const others = timeline.filter((s) => s.id !== id);

  return (
    <div className="relative min-h-[100svh]">
      {/* The one thing on this page that is not flat: a low glow under the
          leaf, so the stage does not read as a hole cut in the page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[80svh] opacity-[0.16]"
        style={{
          background:
            "radial-gradient(60% 50% at 30% 30%, #F2C744 0%, transparent 70%)",
        }}
      />

      <a
        href="/"
        onClick={onNavigate("/")}
        className="group fixed left-5 top-5 z-30 inline-flex items-center gap-2 rounded-full border border-line bg-void/70 px-4 py-2 text-sm text-ink backdrop-blur-md transition-colors hover:border-bloom/60 sm:left-8 sm:top-8"
      >
        <span
          aria-hidden="true"
          className="transition-transform duration-300 group-hover:-translate-x-0.5"
        >
          ←
        </span>
        Back to the field
      </a>

      <main className="mx-auto max-w-6xl px-5 pb-28 pt-24 sm:px-8 sm:pt-28">
        <div className="grid gap-x-14 gap-y-8 md:grid-cols-2">
          {/* Held on screen while the column beside it scrolls — the one
              behaviour of the original page that is structural rather than
              decorative. It cannot be sticky on a phone, where it would be
              parked on top of the thing it is illustrating. */}
          <div className="md:sticky md:top-0 md:h-[100svh] md:self-start">
            <div className="flex h-full flex-col justify-center">
              <LeafStage biome={biome} />
              <p className="mt-2 text-center text-[11px] uppercase tracking-[0.22em] text-muted md:mt-0">
                Leaf {String(index + 1).padStart(2, "0")} of{" "}
                {String(timeline.length).padStart(2, "0")} · move the cursor
              </p>
            </div>
          </div>

          {/* Top padding only, and a fraction of the viewport so the title
              starts level with the leaf beside it. Matching padding at the
              bottom left a screenful of nothing between the last line and the
              other leaves, because the sticky column is already holding the
              grid open to a full viewport. */}
          <article className="md:pt-[17svh] md:pb-[6svh]">
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-ember">
              {step.when} · {step.detail.kind}
            </p>
            <h1 className="mt-5 font-display text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[1.06] text-ink">
              {step.title}
            </h1>
            <p className="mt-4 text-sm uppercase tracking-[0.14em] text-ink/70">
              {step.detail.institution}
              <span className="text-ink/40"> · </span>
              {step.detail.place}
            </p>

            <p className="mt-10 font-display text-[clamp(1.25rem,2.2vw,1.6rem)] italic leading-[1.35] text-ink">
              {step.detail.lede}
            </p>

            <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-muted">
              {step.detail.paragraphs.map((p) => (
                <p key={p.slice(0, 32)}>{p}</p>
              ))}
            </div>

            <h2 className="mt-14 text-xs font-medium uppercase tracking-[0.2em] text-ink">
              In short
            </h2>
            <ul className="mt-5 space-y-4">
              {step.detail.highlights.map((h) => (
                <li key={h.slice(0, 32)} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                  <span aria-hidden="true" className="mt-[0.55em] h-px w-4 shrink-0 bg-ember/70" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>

            <h2 className="mt-14 text-xs font-medium uppercase tracking-[0.2em] text-ink">
              Worked with
            </h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {step.detail.tools.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-ink/80"
                >
                  {t}
                </li>
              ))}
            </ul>

            <div className="mt-16 border-t border-line pt-8">
              <p className="text-sm leading-relaxed text-muted">
                Questions about any of this are welcome —{" "}
                <a
                  href={`mailto:${contact.email}`}
                  className="text-ink underline decoration-ink/40 underline-offset-4 transition-colors hover:decoration-ember"
                >
                  {contact.email}
                </a>
                .
              </p>
            </div>
          </article>
        </div>

        {/* The rest of the collection, offered at the foot of the page. */}
        <nav aria-label="The other leaves" className="mt-10 border-t border-line pt-10">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            The other leaves
          </h2>
          <ul className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-3">
            {others.map((s) => (
              <li key={s.id}>
                <a
                  href={hrefFor(s.id)}
                  onClick={onNavigate(hrefFor(s.id))}
                  className="group block"
                >
                  <p className="text-[0.62rem] uppercase tracking-[0.24em] text-ember/90">
                    {s.when}
                  </p>
                  <p className="mt-2.5 font-display text-lg leading-snug text-ink transition-colors group-hover:text-bloom">
                    {s.title}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{s.where}</p>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
