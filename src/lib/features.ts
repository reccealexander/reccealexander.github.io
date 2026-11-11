// Content data for the eight petals and the four stations down the stem.
// Everything here comes off the résumé — no invented results, no work I have
// not actually done.

export type GlyphId =
  | "stacking"
  | "exfoliation"
  | "growth"
  | "strain"
  | "fabrication"
  | "microscopy"
  | "vision"
  | "simulation";

export interface FeatureCard {
  id: string;
  glyph: GlyphId;
  title: string;
  body: string;
}

export const featureCards: FeatureCard[] = [
  {
    id: "stacking",
    glyph: "stacking",
    title: "Deterministic stacking",
    body: "Transition-metal dichalcogenide flakes picked up and laid down one at a time, at a chosen twist angle, to build a lattice that exists in neither layer alone. The current stack is a twisted quadrilayer WSe₂ in which the moiré lattice has been demonstrated.",
  },
  {
    id: "exfoliation",
    glyph: "exfoliation",
    title: "Gold-template exfoliation",
    body: "Large-area monolayers lifted from bulk crystals against an evaporated gold film, which adheres to the top layer strongly enough to cleave a single sheet clean. It is the step that decides whether anything downstream has material worth stacking.",
  },
  {
    id: "growth",
    glyph: "growth",
    title: "CVD & epitaxial growth",
    body: "Plasma-enhanced chemical vapor deposition of high-quality graphene on copper and nickel-coated substrates — novel epitaxial growth aimed at films flat and continuous enough to hold engineered strain.",
  },
  {
    id: "strain",
    glyph: "strain",
    title: "Strain engineering",
    body: "Semiconductor and optoelectronic devices built from graphene and TMDs whose band structure is tuned by the strain they are held under, rather than by their chemistry.",
  },
  {
    id: "fabrication",
    glyph: "fabrication",
    title: "Device fabrication",
    body: "Low-contact-resistance MXene and TMD devices by film deposition, photolithography, and both routes of transfer: wet chemistry in FeCl₃ and distilled NaOH baths, and dry polymer pickup.",
  },
  {
    id: "microscopy",
    glyph: "microscopy",
    title: "Microscopy & spectroscopy",
    body: "Atomic force microscopy, Raman and photoluminescence spectroscopy, X-ray diffraction, vibrating-sample magnetometry, and a mechanical probe station — the instruments that say whether the thing on the chip is the thing you meant to make.",
  },
  {
    id: "vision",
    glyph: "vision",
    title: "Computer vision for materials",
    body: "A per-crystal yield inspection pipeline for gold-template-exfoliated TMDs, including a U-Net wrinkle counter, in Python, PyTorch, and SAM. Inspection that used to be an afternoon at an optical scope is now a pass over the scan.",
  },
  {
    id: "simulation",
    glyph: "simulation",
    title: "Simulation & numerics",
    body: "Density functional theory for band structure, OpenFOAM for flow, and hand-written solvers for nonlinear PDEs — including an adjoint data-assimilation scheme for Burgers' equation where no closed form exists.",
  },
];

export interface TimelineStep {
  id: string;
  when: string;
  /** The short form, used on the leaf's label in the field. */
  title: string;
  where: string;
  /* The same two things, short enough to be printed on a leaf. `title` and
     `where` are lines of a card; these are lines of type across a blade a few
     hundred pixels long.

     `leafTitle` also has to *distinguish*. Two of these four roles carry the
     same job title on the résumé — both Yeh and Hone are "Condensed Matter
     Physics Researcher" — which is correct on a CV and useless on a leaf: half
     the plant read as the same label twice, told apart only by a location line
     too small to read. So the leaf says what the work is, and the leaf's own
     page says what the post was called. */
  leafTitle: string;
  leafWhere: string;
  body: string;
  /** Everything below is only ever read on the leaf's own page. */
  detail: {
    /** The institution alone, for the page's eyebrow. */
    institution: string;
    place: string;
    kind: string;
    /** One sentence, set large under the title. */
    lede: string;
    /** The long form. One string per paragraph. */
    paragraphs: string[];
    /** The résumé's own bullets, kept verbatim in substance. */
    highlights: string[];
    /** What the work was done with. */
    tools: string[];
  };
}

export const timeline: TimelineStep[] = [
  {
    id: "caltech",
    when: "Present",
    title: "B.S. Physics, B.S. Computer Science",
    where: "California Institute of Technology · Pasadena, CA",
    leafTitle: "Physics & Computer Science",
    leafWhere: "Caltech",
    body: "Two degrees, taken together on purpose: fabrication and solid-state on one side, computing systems and software design on the other.",
    detail: {
      institution: "California Institute of Technology",
      place: "Pasadena, California",
      kind: "Undergraduate",
      lede: "Two degrees taken together, because the instruments and the code that reads them are the same problem.",
      paragraphs: [
        "I am reading for a Bachelor of Science in Physics and a Bachelor of Science in Computer Science at Caltech, at the same time and on purpose. The two halves are not a hedge. Nearly everything I do in a lab ends as a measurement that has to be interpreted, and nearly everything I write is a tool for interpreting one.",
        "The physics side is aimed squarely at condensed matter and the making of devices: micro/nanofabrication, solid-state electronics, quantum mechanics, waves and statistical mechanics, and classical and quantum photonics. That coursework is the vocabulary for the work I do at Columbia and at Caltech — what a band structure is, what strain does to one, and what it takes to pattern any of it onto a chip.",
        "The computer science side is the other half of the same job: computing systems, software design, discrete math, complex analysis, and probability and statistics. It is what makes a yield-inspection pipeline a piece of engineering rather than a script, and what makes a PDE solver something I can trust the output of.",
      ],
      highlights: [
        "B.S. Physics and B.S. Computer Science, read concurrently.",
        "Physics coursework: micro/nanofabrication, solid-state electronics, quantum mechanics, waves and statistical mechanics, classical and quantum photonics.",
        "Computer science coursework: computing systems, software design, discrete math, complex analysis, probability and statistics.",
      ],
      tools: ["Python", "C", "Java", "DFT", "OpenFOAM"],
    },
  },
  {
    id: "njit",
    when: "2024, 2025",
    title: "Applied Physics Research Intern",
    where: "NJIT — Low-Dimensional Materials Lab · Newark, NJ",
    leafTitle: "Applied Physics Intern",
    leafWhere: "NJIT · LDM Lab",
    body: "MXene and TMD devices with low contact resistance, by film deposition — wet chemistry and dry polymer transfer both.",
    detail: {
      institution: "New Jersey Institute of Technology",
      place: "Newark, New Jersey",
      kind: "Low-Dimensional Materials (LDM) Lab",
      lede: "Two summers on the contact problem: getting current into an atomically thin material without ruining it on the way in.",
      paragraphs: [
        "A two-dimensional semiconductor is only as good as the metal you put on it. Contact resistance dominates almost every measurement you would want to make on a monolayer device, and it is set by chemistry and process, not by the crystal you started with. Both of my summers at NJIT's Low-Dimensional Materials Lab were spent on that problem.",
        "The work was MXene- and TMD-based low-contact-resistance semiconductor fabrication using film deposition. That meant learning both routes materials take onto a substrate. Wet chemical processing with liquid solutions — FeCl₃ to etch a growth substrate out from under a film, distilled NaOH to release and clean — and dry transfer with polymer stamps, where the film is picked up and laid down without ever meeting a liquid.",
        "The two routes are not interchangeable, and knowing which one a given stack can survive is most of the craft. It is also the direct ancestor of the deterministic stacking I do now: a dry polymer pickup at NJIT and a gold-template exfoliation at Columbia are the same gesture at different levels of control.",
      ],
      highlights: [
        "MXene and TMD-based low contact resistance semiconductor fabrication using film deposition.",
        "Wet chemical processing with liquid solutions, including FeCl₃ and distilled NaOH.",
        "Dry transfer using polymers for device fabrication.",
      ],
      tools: ["Film deposition", "Wet chemical transfer", "Dry polymer transfer", "Probe station"],
    },
  },
  {
    id: "yeh",
    when: "Present",
    title: "Condensed Matter Physics Researcher",
    where: "Caltech — Yeh Group · Pasadena, CA",
    leafTitle: "Strain Engineering",
    leafWhere: "Caltech · Yeh Group",
    body: "Strain-engineered graphene and TMD devices, on graphene grown in-house by plasma-enhanced CVD.",
    detail: {
      institution: "California Institute of Technology",
      place: "Pasadena, California",
      kind: "Yeh Group",
      lede: "Growing the graphene, then bending it — tuning a band structure with mechanics instead of chemistry.",
      paragraphs: [
        "In the Yeh Group I work on strain-engineered semiconductor and optoelectronic fabrication with graphene and transition-metal dichalcogenides. Strain engineering is an attractive idea for a simple reason: it changes what a material does electronically without changing what it is made of. Hold a crystal under a controlled deformation and you move its bands.",
        "The catch is that it demands a film good enough to hold the strain uniformly. A polycrystalline sheet full of grain boundaries relieves stress at its defects and gives you nothing. So a large part of this work happens upstream of the device, in the furnace: novel epitaxial growth by plasma-enhanced chemical vapor deposition of high-quality graphene on copper and on nickel-coated substrates.",
        "Plasma-enhanced CVD is the interesting choice there. Cracking the precursor in a plasma rather than purely thermally lets the growth run colder and gives another handle on nucleation density — which is to say, on how large and how continuous the resulting grains are. Larger grains, fewer boundaries, and a film that actually transmits the strain you apply to it.",
      ],
      highlights: [
        "Strain-engineered semiconductor and optoelectronic fabrication with graphene and TMDs.",
        "Novel epitaxial growth by plasma-enhanced chemical vapor deposition of high-quality graphene on copper and nickel-coated substrates, for strain-engineered devices.",
      ],
      tools: [
        "Plasma-enhanced CVD",
        "Photolithography",
        "Raman spectroscopy",
        "Photoluminescence spectroscopy",
        "Atomic force microscopy",
      ],
    },
  },
  {
    id: "hone",
    when: "Present",
    title: "Condensed Matter Physics Researcher",
    where: "Columbia University — Hone Group · New York, NY",
    leafTitle: "Twisted WSe₂ Stacking",
    leafWhere: "Columbia · Hone Group",
    body: "Deterministic stacking of gold-template-exfoliated TMDs — and the vision pipeline that grades the crystals going in.",
    detail: {
      institution: "Columbia University",
      place: "New York, New York",
      kind: "Hone Group",
      lede: "Building a lattice that exists in neither layer alone, and teaching a network to judge the crystals that go into it.",
      paragraphs: [
        "The work at the Hone Group is deterministic stacking of gold-template-exfoliated transition-metal dichalcogenides: picking monolayers up one at a time and setting them down at a chosen angle. Where the layers are misaligned by a small twist, the two lattices beat against one another and produce a moiré superlattice with a period far longer than either crystal's — a new length scale, and with it new electronic structure, in a material whose chemistry has not changed at all. We demonstrated the moiré lattice in a twisted quadrilayer WSe₂.",
        "Four layers is meaningfully harder than two. Every pickup is a chance to trap a bubble, tear a corner, or lose the angle, and errors do not average out — they compound down the stack. The yield problem is therefore upstream: which flakes are worth using at all.",
        "That is what the second half of this work is. I built a computer-vision pipeline for per-crystal yield inspection of gold-template-exfoliated TMDs, in Python and PyTorch, using SAM to segment individual crystals out of a scan and a U-Net to count wrinkles in each one. Wrinkle density is a good proxy for how cleanly a flake came off the gold, and it is exactly the kind of judgment that is slow, subjective, and inconsistent between people when it is made by eye at an optical scope. A model that scores every crystal on a chip is faster and, more importantly, says the same thing twice.",
      ],
      highlights: [
        "Deterministic stacking of gold-template-exfoliated TMDs; demonstrated moiré lattice in twisted quadrilayer WSe₂.",
        "Computer-vision pipeline for per-crystal yield inspection of gold-template-exfoliated TMDs, including a U-Net wrinkle counter (Python, PyTorch, SAM).",
      ],
      tools: ["Python", "PyTorch", "SAM", "U-Net", "Atomic force microscopy", "Raman spectroscopy"],
    },
  },
];

export const honors = [
  {
    id: "jshs",
    when: "2024",
    title: "Finalist Oral Presenter",
    body: "Northern Jersey Science and Humanities Symposium (JSHS)",
  },
  {
    id: "isef",
    when: "2024",
    title: "Yale Science & Engineering Association Research Award",
    body: "International Science & Engineering Fair (ISEF)",
  },
] as const;
