import { useEffect, useRef, useState } from "react";
import { BIOMES, type BiomeId } from "@/lib/biomes";
import { useBiome } from "./BiomeContext";
import { useJourney } from "./useJourney";

/**
 * Changes what the field is made of.
 *
 * It is a control over the field, so it is on screen at the two points where
 * the field is the subject — the hero and the closing shot — and out of the way
 * for the whole of the flower in between, where there is nothing on screen for
 * it to change and a menu stranded at the edge of an unrelated section is worse
 * than no menu. Coming back at the end matters: it is the site's one piece of
 * interaction, and a reader who only notices it as it fades has no way back to
 * it short of scrolling to the top.
 *
 * While it is out of the way it is `inert`, not merely transparent. An
 * invisible control that still takes focus is worse than a hidden one: the
 * focus ring is drawn on something nobody can see, and a keyboard reader loses
 * their place with no way to know why.
 */

function Glyph({ id }: { id: BiomeId }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    className: "h-4 w-4",
  };
  if (id === "meadow")
    return (
      <svg {...common} aria-hidden>
        <path d="M4 17c0-4 1.2-7 3-9M10 17c0-5 .6-8 1.6-10M16 17c0-3.4-.8-6-2.2-8" />
      </svg>
    );
  if (id === "flowers")
    return (
      <svg {...common} aria-hidden>
        <path d="M5 17c0-3.5.7-6 2-8M14 17c0-3 .5-5.4 1.4-7" />
        <circle cx="7" cy="7" r="2.2" />
        <circle cx="15.4" cy="9" r="1.6" />
      </svg>
    );
  if (id === "forest")
    return (
      <svg {...common} aria-hidden>
        <path d="M10 17V5M10 8.5c-2-1.6-3.6-2-5.4-2M10 8.5c2-1.6 3.6-2 5.4-2M10 12.5c-1.7-1.4-3-1.8-4.6-1.8M10 12.5c1.7-1.4 3-1.8 4.6-1.8" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <ellipse cx="11.6" cy="7.6" rx="3.4" ry="1.9" />
      <path d="M8.2 7.6 5 5.5v4.2z" />
      <path d="M3 13.4c1.2-1 2.1-1 3.3 0s2.1 1 3.3 0 2.1-1 3.3 0 2.1 1 3.3 0M3 16.4c1.2-1 2.1-1 3.3 0s2.1 1 3.3 0 2.1-1 3.3 0 2.1 1 3.3 0" />
    </svg>
  );
}

export default function BiomePicker() {
  const { biome, setBiome } = useBiome();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const pastRef = useRef(false);

  useJourney((c) => {
    const gone = c > 0.8 && c < 5.15;
    if (gone === pastRef.current) return;
    pastRef.current = gone;
    const el = root.current;
    if (!el) return;
    el.style.opacity = gone ? "0" : "1";
    el.style.pointerEvents = gone ? "none" : "auto";
    el.inert = gone;
    if (gone) setOpen(false);
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Open onto the current choice, so the keyboard lands where the eye does.
  useEffect(() => {
    if (!open) return;
    const i = BIOMES.findIndex((b) => b.id === biome.id);
    items.current[i < 0 ? 0 : i]?.focus();
  }, [open, biome.id]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? at + 1 : at - 1;
    list[(next + list.length) % list.length]?.focus();
  };

  const choose = (id: BiomeId) => {
    setBiome(id);
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div
      ref={root}
      className="fixed bottom-4 right-4 z-50 transition-opacity duration-500 sm:bottom-6 sm:right-6"
    >
      {open && (
        <div
          role="menu"
          aria-label="Biome"
          onKeyDown={onMenuKey}
          className="absolute bottom-full right-0 mb-2 w-[13rem] origin-bottom-right overflow-hidden rounded-lg border border-line bg-void/90 shadow-[0_18px_40px_rgba(0,0,0,0.5)] backdrop-blur-md [animation:biome-menu-in_160ms_cubic-bezier(0.2,0.9,0.3,1)]"
        >
          <p className="px-3.5 pb-1.5 pt-3 text-[0.625rem] uppercase tracking-[0.2em] text-muted">
            Biome
          </p>
          {BIOMES.map((b, i) => {
            const active = b.id === biome.id;
            return (
              <button
                key={b.id}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(b.id)}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                  active ? "bg-raise" : "hover:bg-shell focus-visible:bg-shell"
                }`}
              >
                <span className={`min-w-0 flex-1 text-sm ${active ? "text-ink" : "text-ink/85"}`}>
                  {b.label}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full bg-bloom transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}

      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Biome: ${biome.label}`}
        onClick={() => setOpen((v) => !v)}
        // The button is a patch of the biome itself: its ground going into
        // what grows on it, the swatch's two colours, darkened for the type.
        className="flex items-center gap-2.5 rounded-lg border border-white/15 py-1.5 pl-2.5 pr-2 text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-[background,border-color] duration-500 hover:border-white/40"
        style={{
          background: `linear-gradient(rgba(0,0,0,0.28), rgba(0,0,0,0.38)), linear-gradient(140deg, ${biome.swatch[0]} 0%, ${biome.swatch[0]} 45%, ${biome.swatch[1]} 130%)`,
        }}
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-white/15 ring-1 ring-white/25">
          <Glyph id={biome.id} />
        </span>
        <span className="flex flex-col items-start leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-white/70">Biome</span>
          <span className="max-w-[9rem] truncate text-[0.85rem] font-medium">{biome.label}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`ml-0.5 h-3.5 w-3.5 text-white/70 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 12l4-4 4 4" />
        </svg>
      </button>
    </div>
  );
}
