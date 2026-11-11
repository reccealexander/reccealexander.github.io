import type { GlyphId } from "@/lib/features";

/**
 * Hand-drawn glyphs, one per petal.
 *
 * Each one is the thing itself rather than a metaphor for it: two lattices at
 * an angle, a flake coming off gold, a tube furnace, a cantilever over a
 * surface. They live inside a fixed, `pointer-events-none` overlay that is not
 * a `group`, so nothing here is interactive — a hover state on any of them
 * would be styled and unreachable.
 */
export default function Glyph({ id }: { id: GlyphId }) {
  const common = {
    viewBox: "0 0 28 28",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    strokeLinecap: "round" as const,
    className: "h-7 w-7",
  };
  // One hexagon of a honeycomb, drawn about the origin — the unit both the
  // stacking and growth glyphs are built out of.
  const HEX = "M6 0 L3 5.2 L-3 5.2 L-6 0 L-3 -5.2 L3 -5.2 Z";

  switch (id) {
    // Two lattices, one turned a few degrees against the other.
    case "stacking":
      return (
        <svg {...common} aria-hidden>
          <g transform="translate(14 14) scale(0.8)">
            <path d={HEX} opacity={0.45} />
            <path d={HEX} transform="rotate(16)" className="stroke-ember" />
          </g>
          <path d="M4 25h20" opacity={0.3} />
        </svg>
      );
    // A single sheet lifting off the stack it was cleaved from.
    case "exfoliation":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 22h20M4 18.5h20" opacity={0.45} />
          <path d="M5 13.5 L14 9 L23 13.5 L14 18 Z" opacity={0.45} />
          <path
            d="M6 7.5 L15 3 L24 7.5 L15 12 Z"
            className="fill-ember/25 stroke-ember"
          />
        </svg>
      );
    // A tube furnace: gas in at the left, film growing on the substrate.
    case "growth":
      return (
        <svg {...common} aria-hidden>
          <rect x="4" y="8" width="20" height="12" rx="3" opacity={0.45} />
          <path d="M1 14h3M24 14h3" opacity={0.45} />
          <path d="M9 17h10" className="stroke-ember" strokeWidth={1.6} />
          <g transform="translate(14 12) scale(0.34)" className="stroke-ember">
            <path d={HEX} />
          </g>
        </svg>
      );
    // A lattice pulled out of square, with the tension it is held under.
    case "strain":
      return (
        <svg {...common} aria-hidden>
          <path
            d="M8 9 L20 7.5 L21 19 L9 20.5 Z"
            opacity={0.45}
          />
          <path d="M11 12.2 L17.6 11.4M11.4 16.3 L18 15.5" opacity={0.3} />
          <path d="M2.5 14h3.5M25.5 14H22" className="stroke-ember" />
          <path d="M4.6 12.2 2.5 14l2.1 1.8M23.4 12.2 25.5 14l-2.1 1.8" className="stroke-ember" />
        </svg>
      );
    // Photolithography: light through a mask onto a patterned resist.
    case "fabrication":
      return (
        <svg {...common} aria-hidden>
          <path d="M8 2v4M14 2v4M20 2v4" className="stroke-ember" />
          <path d="M4 8h20" opacity={0.6} />
          <path d="M9 8v2M19 8v2" opacity={0.45} />
          <path d="M4 21h20" opacity={0.45} />
          <path d="M7 21v-4h5v4M16 21v-4h5v4" className="fill-ember/20 stroke-ember" />
        </svg>
      );
    // An AFM cantilever, tip down over a surface.
    case "microscopy":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 4 L17 14.5" opacity={0.6} />
          <path d="M17 14.5 L15.2 18.5 L19.4 18.2 Z" className="fill-ember/25 stroke-ember" />
          <path d="M3 22c3.5 0 3.5-3 7-3s3.5 3 7 3 3.5-3 7-3" opacity={0.45} />
          <path d="M20 4 L15.5 9" opacity={0.3} />
        </svg>
      );
    // A flake under inspection: the crystal, and the net's read of it.
    case "vision":
      return (
        <svg {...common} aria-hidden>
          <path d="M6 17 L9.5 7 L20 5.5 L23 15 L14.5 22 Z" opacity={0.45} />
          <rect
            x="9"
            y="8"
            width="7"
            height="7"
            rx="0.8"
            className="fill-ember/20 stroke-ember"
          />
          <rect x="15" y="13" width="5" height="5" rx="0.8" className="stroke-ember" opacity={0.7} />
          <path d="M3 3h2.5M3 3v2.5M25 25h-2.5M25 25v-2.5" opacity={0.5} />
        </svg>
      );
    // A band structure: two bands and the gap between them.
    case "simulation":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 24V4M4 24h20" opacity={0.45} />
          <path d="M7 8.5C10 8.5 11.5 11 14 11s4-2.5 7-2.5" className="stroke-ember" />
          <path d="M7 20.5C10 20.5 11.5 18 14 18s4 2.5 7 2.5" className="stroke-ember" />
          <path d="M14 11v7" strokeDasharray="1.6 1.8" opacity={0.6} />
        </svg>
      );
  }
}
