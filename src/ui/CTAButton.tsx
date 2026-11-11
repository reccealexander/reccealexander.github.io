import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";
type Size = "md" | "sm";

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
};

export type CTAButtonProps =
  | (BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string })
  | (BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined });

/*
 * `[text-shadow:none]` is load-bearing, not tidiness.
 *
 * Every button on this site sits inside copy that carries `type-shadow`, and
 * text-shadow inherits. That utility exists to hold near-white type against a
 * field with no scrim under it — a dark shadow behind a light glyph. The
 * primary button is the one piece of type on the page that is the other way
 * round: near-black on the brand's gold. A dark shadow behind a dark label on a
 * light ground is not legibility, it is a halo, and at the 5px blur that
 * utility uses the label reads as genuinely out of focus next to the crisp
 * ghost link beside it.
 *
 * The button carries its own background and therefore needs no help from a
 * shadow at all, so the inheritance is simply cut here for both variants.
 */
const base =
  "inline-flex select-none items-center justify-center rounded-full font-medium tracking-tight [text-shadow:none] transition-all duration-300 ease-out";

const sizes: Record<Size, string> = {
  md: "px-7 py-3 text-sm",
  sm: "px-4 py-2 text-sm",
};

/* Primary hover is a gold underglow — the light comes from beneath the
   button, not a color swap, so the accent stays scarce. */
const variants: Record<Variant, string> = {
  primary:
    "bg-bloom text-void hover:-translate-y-px hover:brightness-110 hover:shadow-[0_10px_36px_-10px_rgba(242,199,68,0.6)] active:translate-y-0 active:brightness-100",
  ghost:
    "border border-line bg-transparent text-ink hover:border-bloom/60 hover:bg-raise",
};

export default function CTAButton(props: CTAButtonProps) {
  const { variant = "primary", size = "md", className = "", ...rest } = props;
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${className}`.trim();

  if (typeof rest.href === "string") {
    return <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={cls} />;
  }
  return (
    <button
      type="button"
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      className={cls}
    />
  );
}
