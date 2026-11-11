import { Color } from "three";

/**
 * The scene's colours, in the same key as the CSS tokens in index.css. Two
 * rules hold the whole thing together: nothing in the field may average
 * brighter than a mid-dark green, because the type is near-white and sits
 * directly on it; and the only saturated warmth in the frame belongs to the
 * flower — the gold is scarce on purpose.
 */

export const HEX = {
  void: "#0a120d",
  ink: "#f5f2ed",
  bloom: "#f2c744",
  ember: "#e4813f",
  cream: "#fbf6ea",

  // Grass, from the shaded base of a blade to a tip with the last of the sun
  // coming through it.
  grassDeep: "#12331f",
  grassBody: "#1c4c31",
  grassBright: "#37875c",
  grassLit: "#76ba8f",
  grassRare: "#2c7466",

  // Soil is the one place the palette is allowed to go warm and dead — at ant
  // scale you are standing on it, and a green floor under green grass reads as
  // a single flat sheet.
  soilDark: "#150f0a",
  soil: "#2a2017",
  soilLit: "#4a3a26",
  moss: "#1d3b26",

  // Dusk. The sun is on the horizon behind the field, which is what gives the
  // blades their backlight and keeps the frame dark enough for the copy.
  skyHigh: "#0a1410",
  skyLow: "#23241a",
  sun: "#ffcf7a",
  fogHuman: "#20211a",
  fogAnt: "#101a13",
} as const;

export const COLOR = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, new Color(v)]),
) as Record<keyof typeof HEX, Color>;

/** Where the light comes from: low, behind the field, warm. */
export const SUN_DIRECTION: [number, number, number] = [-0.42, 0.18, -1];
