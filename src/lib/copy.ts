/** Shared site copy — one source of truth for strings used across shell + hero. */

export const siteTitle = "Alexander Recce — Condensed matter physics & computer science";

export const siteDescription =
  "Alexander Recce is a physics and computer science undergraduate at Caltech working on two-dimensional materials — deterministic stacking of twisted TMDs at Columbia's Hone Group, and strain-engineered graphene devices at Caltech's Yeh Group.";

export const contact = {
  email: "arecce@caltech.edu",
  phone: "908-873-5639",
  phoneHref: "tel:+19088735639",
  linkedin: "linkedin.com/in/alexanderrecce",
  linkedinHref: "https://www.linkedin.com/in/alexanderrecce",
} as const;

/**
 * The hero, which is now one line long.
 *
 * The eyebrow, tagline, body, two calls to action and credentials line that
 * used to sit under the name have all been taken out — the first screen is the
 * name and the field, and everything those lines asserted is said a screen
 * further down by the eight petals, the four leaves and the contact panel.
 */
export const hero = {
  wordmark: "Alexander Recce",
  /** The paragraphs under the name, on the clearing. */
  description: [
    "I study physics at Caltech, with a particular interest in condensed matter. My research spans atomically-thin materials including 3R-stacked TMDs, as well as PECVD-grown graphene. I've also pursued personal computational projects including CNN-based crystal quality assessment, DFT simulation of graphene nanoribbons, and adjoint data assimilation for NLPDEs. Also acutely interested in a variety of other fields like quantum information and mechanistic interpretability.",
    "I also enjoy running mid-distance (800-meter) for the Caltech track and field team, playing guitar, and drawing.",
  ],
  /** Where to find me, under it. */
  linkedin: "https://www.linkedin.com/in/alexander-recce-27344b31a",
  email: "arecce@caltech.edu",
} as const;

/** The recordings behind "playing guitar" in the description (ui/GuitarMenu). */
export const guitar = [
  { id: "onde-ande-voce", title: "Onde Anda Voc\u00ea", src: "/audio/onde-ande-voce.m4a" },
  { id: "cannock-chase", title: "Cannock Chase", src: "/audio/cannock-chase.m4a" },
  { id: "isnt-she-lovely", title: "Isn’t She Lovely", src: "/audio/isnt-she-lovely.m4a" },
  { id: "dont-know-why", title: "Don’t Know Why", src: "/audio/dont-know-why.m4a" },
  { id: "misty", title: "Misty", src: "/audio/misty.m4a" },
] as const;

/** The drawing behind "drawing" in the description (ui/DrawingMenu). */
export const drawing = {
  title: "What I\u2019m currently working on... my family:",
  alt: "A pencil drawing in progress of my family: my mother and father behind, my two younger brothers in front.",
  small: "/media/family-drawing-small.jpg",
  large: "/media/family-drawing.jpg",
} as const;
