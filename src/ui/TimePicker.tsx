import { useRef } from "react";
import { setTimeOfDay, TIMES, useTimeOfDay, type TimeOfDay } from "@/lib/timeOfDay";

/**
 * Morning, sunset or evening — the light the field is shown in.
 *
 * A three-way switch in the corner opposite the biome picker, gone over the
 * same stretch of the page: it changes the world behind the copy, and the copy
 * should not have to share the frame with it while it is being read.
 *
 * Its panel is a piece of the sky it sets — blue going gold in the morning,
 * plum into orange at sunset, deep indigo in the evening — cross-faded as the
 * light changes, with the one that is on lit up like the sun or moon in it.
 */
const SKY: Record<TimeOfDay, string> = {
  morning: "linear-gradient(150deg, #2f5f80 0%, #6f8f8a 55%, #c99a3e 100%)",
  sunset: "linear-gradient(150deg, #4a2550 0%, #9a3f4a 55%, #e07a36 100%)",
  evening: "linear-gradient(150deg, #0b1230 0%, #18245a 60%, #2f3f84 100%)",
};
const GLOW: Record<TimeOfDay, string> = {
  morning: "0 0 14px rgba(255, 214, 120, 0.75)",
  sunset: "0 0 14px rgba(255, 150, 80, 0.8)",
  evening: "0 0 14px rgba(170, 190, 255, 0.7)",
};

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
      className="fixed bottom-4 left-4 z-50 isolate flex items-center gap-1 overflow-hidden rounded-lg border border-white/15 p-1 text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-opacity duration-500 sm:bottom-6 sm:left-6"
    >
      {/* The sky, one layer per time, cross-faded. */}
      {TIMES.map((t) => (
        <span
          key={`sky-${t.id}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700"
          style={{ background: SKY[t.id], opacity: t.id === time ? 1 : 0 }}
        />
      ))}
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
            className={`grid h-8 w-8 place-items-center rounded-md transition-[background-color,color,box-shadow] duration-300 ${
              active ? "bg-white/20 text-white ring-1 ring-white/45" : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
            style={active ? { boxShadow: GLOW[t.id] } : undefined}
          >
            <Icon id={t.id} />
          </button>
        );
      })}
    </div>
  );
}
