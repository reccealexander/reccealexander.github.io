import { useRef } from "react";
import { setTimeOfDay, TIMES, useTimeOfDay, type TimeOfDay } from "@/lib/timeOfDay";
import { useJourney } from "./useJourney";

/**
 * Morning, sunset or evening — the light the field is shown in.
 *
 * A three-way switch in the corner opposite the biome picker, in the same
 * shell, and gone over the same stretch of the page: it changes the world
 * behind the copy, and the copy should not have to share the frame with it
 * while it is being read.
 */

function Icon({ id }: { id: TimeOfDay }) {
  const common = {
    viewBox: "0 0 20 20",
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (id === "morning")
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="3.4" />
        <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
      </svg>
    );
  if (id === "sunset")
    return (
      <svg {...common}>
        <path d="M5.5 13a4.5 4.5 0 0 1 9 0" />
        <path d="M2.5 13h15M5 16h10M10 4.5v2M4.6 7.6l1.3 1.3M15.4 7.6l-1.3 1.3" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M15.5 12.4A6 6 0 0 1 7.6 4.5a6 6 0 1 0 7.9 7.9Z" />
    </svg>
  );
}

export default function TimePicker() {
  const time = useTimeOfDay();
  const root = useRef<HTMLDivElement>(null);
  const past = useRef(false);

  useJourney((c) => {
    const gone = c > 0.8 && c < 5.15;
    if (gone === past.current) return;
    past.current = gone;
    const el = root.current;
    if (!el) return;
    el.style.opacity = gone ? "0" : "1";
    el.style.pointerEvents = gone ? "none" : "auto";
    el.inert = gone;
  });

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TIMES.findIndex((t) => t.id === time);
    const next = TIMES[(i + (e.key === "ArrowRight" ? 1 : TIMES.length - 1)) % TIMES.length];
    setTimeOfDay(next.id);
    root.current?.querySelector<HTMLButtonElement>(`[data-time="${next.id}"]`)?.focus();
  };

  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label="Time of day"
      onKeyDown={onKey}
      className="fixed bottom-4 left-4 z-50 flex items-center gap-0.5 rounded-full border border-line bg-void/70 p-1 shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-opacity duration-500 sm:bottom-6 sm:left-6"
    >
      {TIMES.map((t) => {
        const active = t.id === time;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t.label}
            title={t.label}
            data-time={t.id}
            tabIndex={active ? 0 : -1}
            onClick={() => setTimeOfDay(t.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition-colors ${
              active ? "bg-raise text-bloom" : "text-ink/70 hover:text-ink"
            }`}
          >
            <Icon id={t.id} />
            {/* The name of the one that is on; the others are icons. */}
            {active && <span className="pr-0.5">{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
