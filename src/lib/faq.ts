export type FAQItem = {
  id: string;
  question: string;
  answer: string;
};

export const faqItems: FAQItem[] = [
  {
    id: "now",
    question: "What are you working on right now?",
    answer:
      "Two things at once. At Columbia's Hone Group I stack gold-template-exfoliated transition-metal dichalcogenides by hand and characterize what comes out — most recently a twisted quadrilayer WSe₂ in which we demonstrated a moiré lattice. At Caltech's Yeh Group I grow graphene by plasma-enhanced CVD on copper and nickel-coated substrates and use it for strain-engineered semiconductor and optoelectronic devices.",
  },
  {
    id: "moire",
    question: "Why twisted layers?",
    answer:
      "Stack two atomically thin crystals with a small angle between them and their lattices beat against each other, producing a moiré superlattice with a period far longer than either crystal's. That long period is a new knob: it changes the electronic structure of a material without changing its chemistry. Getting there means placing each layer deterministically, at a chosen angle, without trapping anything between them.",
  },
  {
    id: "code",
    question: "Where does the computer science come in?",
    answer:
      "Most directly in a computer-vision pipeline for per-crystal yield inspection of gold-template-exfoliated TMDs — Python, PyTorch, and SAM, including a U-Net that counts wrinkles in a flake. Judging exfoliation yield by eye at a scope does not scale and is not reproducible between people; a model that scores every crystal on a chip is both. The rest of it is simulation: DFT, OpenFOAM, and solvers written from scratch.",
  },
  {
    id: "hands",
    question: "What do you actually do in a lab?",
    answer:
      "Exfoliate and transfer flakes, both wet — FeCl₃ and distilled NaOH baths — and dry, with polymer stamps. Deposit films, pattern them by photolithography, spin-coat, clean with UV-ozone, and run growths in a CVD furnace. Then measure: atomic force microscopy, Raman and photoluminescence spectroscopy, X-ray diffraction, vibrating-sample magnetometry, and a mechanical probe station.",
  },
  {
    id: "published",
    question: "Have you published?",
    answer:
      "Yes — Recce, A. (2024), \"Evaluating graphene nanoribbons for miniaturization of field effect transistors: A density functional theory study,\" Theoretical and Natural Science, 39, 50–59. It measures the band structure of modeled graphene nanoribbon unit cells with DFT and shows how their electronic properties depend on edge topography.",
  },
  {
    id: "burgers",
    question: "What is the Burgers' equation project?",
    answer:
      "A computational physics project on getting high-accuracy approximations to nonlinear PDEs that have no closed-form solution. It uses adjoint data assimilation — gradient descent on a cost function measuring the gap between the numerical and exact solutions — to pull the approximation back onto the truth as it evolves.",
  },
  {
    id: "honors",
    question: "Any awards?",
    answer:
      "Two, both in 2024: finalist oral presenter at the Northern Jersey Science and Humanities Symposium (JSHS), and the Yale Science & Engineering Association Research Award at the International Science & Engineering Fair (ISEF).",
  },
  {
    id: "coursework",
    question: "What have you studied?",
    answer:
      "Micro/nanofabrication, solid-state electronics, quantum mechanics, waves and statistical mechanics, and classical and quantum photonics on the physics side; computing systems, software design, discrete math, complex analysis, and probability and statistics on the computer science side.",
  },
  {
    id: "next",
    question: "What are you looking for?",
    answer:
      "Work where fabrication and computation are the same job — building 2D-material devices and writing the tools that measure them. If that is what you are doing, email me at arecce@caltech.edu.",
  },
];
