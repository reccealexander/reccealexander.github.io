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
  /** The paragraphs under the name, on the clearing. */
  description: [
    "I study physics at Caltech, and am interested in condensed matter research, particularly on atomically thin materials. In the Hone Group at Columbia, I stacked TMDs into moiré and nonlinear-optical structures up to 5 monolayers in thickness and developed a computer vision pipeline for evaluating crystal quality; with the Yeh Group, I grew graphene using PECVD for strain-engineered devices. In the past, I've conducted personal computational projects in studying graphene nanoribbons and adjoint data assimilation for NLPDEs.",
    "I also enjoy running mid-distance (800-meter) for the Caltech track and field team, playing guitar, and drawing.",
  ],
  /** Where to find me, under it. */
  linkedin: "https://www.linkedin.com/in/alexander-recce-27344b31a",
  email: "arecce@caltech.edu",
} as const;
