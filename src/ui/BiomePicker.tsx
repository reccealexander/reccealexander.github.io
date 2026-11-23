import { useEffect, useRef, useState } from "react";
import { BIOMES, type BiomeId } from "@/lib/biomes";
import { useBiome } from "./BiomeContext";
import Cloud, { CloudBlob } from "./Cloud";

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

function Glyph({ id, big = false }: { id: BiomeId; big?: boolean }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: big ? 1.6 : 1.4,
    strokeLinecap: "round" as const,
    className: big ? "h-5 w-5" : "h-4 w-4",
  };
  // A meadow: a wildflower — five round petals on a stem with two leaves.
  if (id === "meadow")
    return (
      <svg {...common} aria-hidden>
        <circle cx="10.00" cy="3.70" r="1.55" />
        <circle cx="12.57" cy="5.57" r="1.55" />
        <circle cx="11.59" cy="8.58" r="1.55" />
        <circle cx="8.41" cy="8.58" r="1.55" />
        <circle cx="7.43" cy="5.57" r="1.55" />
        <circle cx="10" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
        <path d="M10 10.2v7.6" />
        <path d="M10 15.6c-2.3 0-3.7-1.3-4.1-3.3 2.1-.1 3.5.9 4.1 3.3ZM10 13.6c2 0 3.3-1.1 3.7-2.9-1.9-.1-3.2.8-3.7 2.9Z" />
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
        <>
          {/* A thought bubble: rings up off the button, then the cloud —
              trailing to the right, mirrored, since it opens leftward. */}
          <div
            role="menu"
            aria-label="Biome"
            onKeyDown={onMenuKey}
            // Lined up with the button's right edge, which keeps it on the
            // screen and puts the smallest ring over the button.
            className="absolute bottom-full right-0 mb-0.5 w-max"
          >
            <Cloud
              dots="right"
              bodyClassName="w-36"
            >
              <span className="block px-1.5 pb-1 text-[0.6rem] uppercase tracking-[0.2em] text-void/55">
                Biome
              </span>
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
                    className={`flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[0.8rem] transition-colors ${
                      active ? "bg-void/10 font-semibold" : "hover:bg-void/[0.07] focus-visible:bg-void/[0.07]"
                    }`}
                  >
                    <span className="min-w-0 flex-1">{b.label}</span>
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full bg-ember transition-opacity ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </button>
                );
              })}
            </Cloud>
          </div>
        </>
      )}

      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Biome: ${biome.label}`}
        onClick={() => setOpen((v) => !v)}
        title={`Biome: ${biome.label}`}
        // Just the biome's own mark, in a blob of cloud like the rings a
        // thought trails — the menu bubbles up out of it.
        className="block transition-transform duration-200 hover:scale-105 focus-visible:scale-105"
      >
        <CloudBlob className="h-[42px] w-[46px]">
          <Glyph id={biome.id} big />
        </CloudBlob>
      </button>
    </div>
  );
}
