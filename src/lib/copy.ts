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
  resumeHref: "/AlexanderRecce_Resume.pdf",
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
  /**
   * What the leaf says under the name once it has been sent off and come back
   * to the middle of the screen. Empty for now; the space for it is kept.
   */
  description: "",
} as const;
