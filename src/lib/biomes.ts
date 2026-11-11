/*
 * The field has four dressings, and everything they change lives here as data.
 * The renderers own no colours of their own — adding a biome is a new entry in
 * this table.
 *
 * One hard constraint on every palette, inherited from the DOM site and still
 * load-bearing: the hero type is near-white with a tight dark shadow, so no
 * biome may average brighter than the meadow's mid-dark green. It is why the
 * superbloom is pitched at late light rather than noon.
 */

export type BiomeId = "meadow" | "flowers" | "forest" | "pond";

export interface Biome {
  id: BiomeId;
  label: string;
  blurb: string;
  /** Two stops for the picker's swatch: the ground, then what grows on it. */
  swatch: readonly [string, string];

  /** Blade body, from the shaded base of the field to its lit front. */
  deep: string;
  bright: string;
  /** Two tip colours; each blade takes one, which is what stops the field
      reading as a single ramp. */
  litA: string;
  litB: string;
  /** An off-colour body for about one blade in twelve. */
  rare: string;

  /** The soil the canopy stands on, top of frame to bottom. */
  groundFar: string;
  groundNear: string;
  /** What the far field dissolves into — also the fog. */
  haze: string;

  /** Blade geometry, in metres and radians. */
  blade: {
    height: number;
    /** Fatness: height divided by this is the blade's width at the base. */
    slenderness: number;
    /** How far a clump's outermost blades fan off vertical. */
    fan: number;
    /** How much a blade arcs over along its own length. */
    curve: number;
  };

  /** Heads standing over the grass. A superbloom is mostly this. */
  heads?: {
    colors: readonly string[];
    eye: string;
    /** Heads per clump, on average. */
    density: number;
    radius: number;
    /** The grass is cut down to leave the heads standing clear of it. */
    grassScale: number;
  };

  /**
   * A fern understory in place of grass, which is the other kind of biome that
   * is geometry rather than palette: three storeys of frond — tall, short, and
   * a scattering of woody ones that read as small trees — with what they have
   * shed lying on the floor under them. See three/Fronds.tsx.
   */
  fronds?: {
    /**
     * The storeys, each a share of the field's clump budget. Woody ones are a
     * scattering on top of the other two: a stand of nothing but trees stops
     * being an understory.
     */
    storeys: readonly { share: number; height: number; woody: boolean }[];
    /** A bole, and the sliver of light up the middle of it. */
    bark: readonly [string, string];
    /** Last autumn, lying on the floor. */
    litter: readonly string[];
    /** Whether grass grows between them. A forest floor has none. */
    grass: boolean;
  };

  /**
   * Water past the near bank, which is a different kind of biome: the field
   * stops at a waterline instead of running to the fog, and everything past it
   * is one plane. Its presence is what switches that on — see three/pond.ts
   * for where the bank actually is, which is geometry rather than palette.
   */
  pond?: {
    /** The body of the water, and the paler stop a wave face turns up. */
    deep: string;
    surface: string;
    /** What a flat facet gives back. There is no sky, so: the haze. */
    sheen: string;
    /** The colour of the highlights, which is all the sun ever is here. */
    sun: string;
    /**
     * Where that sun is. Only its reflection is ever in frame, so this is
     * chosen for where the glitter lands rather than for the hour.
     */
    sunDir: readonly [number, number, number];
    /**
     * Koi: the white a kohaku is mostly made of, the crimson laid on it, and
     * the black a showa is grounded in. Three, not two, because the whole
     * difference between a koi and an orange fish is that its marking is a
     * hard-edged shape in a named variety — see three/koi.ts.
     */
    koi: readonly [string, string, string];
    /** Blossom on the surface: the wet end, then the dry edge. */
    petal: readonly [string, string];
    /**
     * The bank underfoot: saturated silt at the waterline, then the drier
     * crust further up it. Neither is the soil the other biomes stand on —
     * wet ground is darker, greyer and colder than dry ground, and the whole
     * back half of the journey is spent looking at this from a hand's width
     * away.
     */
    silt: readonly [string, string];
  };

  /**
   * Wildflowers standing in the grass, in stands rather than scattered.
   *
   * The DOM site plants these across the hero in patches (see
   * `FieldFlowers.tsx` there) and they are most of why its meadow reads as a
   * meadow rather than as a lawn. Only a meadow carries them: the superbloom is
   * already nothing but heads, a fern understory is the wrong floor for them,
   * and the pond has a bank instead of a field. See three/Wildflowers.tsx.
   */
  wildflowers?: {
    /**
     * The species, as a colour and a shape each. A stand is one or two of
     * these, never the whole list, which is what makes it a stand.
     */
    species: readonly {
      body: string;
      /** The middle of the head, and how wide it is as a share of the head. */
      eye: string;
      eyeSize: number;
      /** Petals, and how much of its slot each one fills. */
      petals: number;
      width: number;
      /** How often this one comes up, relative to the others. */
      weight: number;
    }[];
    stem: string;
    /**
     * The foliage on that stem: the branches take the stem colour, the leaves
     * take this. Darker than the grass rather than the same green as it, for
     * the same reason the stem is — a leaf pitched inside the blades' own range
     * is a leaf nobody can see is there, and a plant whose leaves cannot be
     * made out is back to being a stick with a disc on the end.
     */
    leaf: string;
    /** Stands in the field, and plants in a stand. */
    stands: number;
    perStand: number;
    /** Half the head, in metres, before the per-plant spread. */
    radius: number;
  };

  /** What drifts above the canopy. */
  accents: readonly string[];
  /**
   * How often each accent comes up in the drift, if not equally.
   *
   * The accents are the biome's flower colours and the drift is what those
   * flowers shed, so the list is right — but the page's brand contract is two
   * accents, gold and orange, and a uniform draw over a five-colour meadow put
   * two petals in five in a lilac or a cornflower blue that the wordmark has no
   * answer for. The cool notes belong in the field; they do not belong in
   * rotation with the warm ones.
   */
  accentMix?: readonly number[];
}

const MEADOW: Biome = {
  id: "meadow",
  label: "Meadow",
  blurb: "Summer grass, in flower.",
  swatch: ["#3d5c19", "#e4813f"],
  /*
   * Olive, not blue-green, and pitched dark.
   *
   * This is the shaded half of a photograph of sunlit meadow grass — the deep
   * yellow-green the reference sits in for most of its frame, from the near
   * black in its corners to the stop where the light starts to arrive. The lit
   * half of the same ramp is not here: it belongs to three/sunlight.ts, because
   * where a blade is standing decides which half it takes, and that is a fact
   * about the field rather than about the biome. `bright` is therefore the top
   * of the *shade*, not the top of the picture.
   */
  deep: "#0b1505",
  bright: "#2e4a15",
  /* The lit sliver up a blade's spine. In shade it barely shows; standing in
     the pool it is what picks the blade out from its neighbours. */
  litA: "#607f1f",
  litB: "#85a534",
  rare: "#26330f",
  groundFar: "#0e1806",
  groundNear: "#1c2a0d",
  haze: "#16200a",
  blade: { height: 0.42, slenderness: 13, fan: 0.52, curve: 0.2 },
  wildflowers: {
    /*
     * The 2D site's five species, as the five colours they are read as: a
     * cream daisy, a gold-eyed one, a warm orange cosmos, a violet lupine and
     * a cornflower blue. Shape carries as much of the difference as colour —
     * eight narrow rays is a daisy and five broad ones is a poppy at any size
     * you can still count them at, and below that the colour is doing all the
     * work anyway.
     *
     * The two cool ones are held to a fifth of the planting between them. They
     * are the note that says a meadow has more than one thing growing in it,
     * and a stand of them every few metres says that; a fifth of the field
     * saying it turns the meadow blue.
     */
    species: [
      // The cream one is held to the smallest share of the five. It is the only
      // near-white thing growing anywhere in this scene, the hero type is also
      // near-white, and a meadow full of them is a meadow the wordmark cannot
      // sit on.
      { body: "#fbf6ea", eye: "#f2c744", eyeSize: 0.3, petals: 8, width: 0.5, weight: 2 },
      { body: "#f2c744", eye: "#8a3b12", eyeSize: 0.26, petals: 6, width: 0.62, weight: 6 },
      { body: "#e4813f", eye: "#f2c744", eyeSize: 0.28, petals: 5, width: 0.7, weight: 6 },
      { body: "#7d5ab8", eye: "#a98ad6", eyeSize: 0.22, petals: 7, width: 0.44, weight: 2 },
      { body: "#5c76c8", eye: "#2b2a4a", eyeSize: 0.2, petals: 8, width: 0.36, weight: 2 },
    ],
    // Darker than the grass rather than the shade a stem "should" be: a stalk
    // pitched between `deep` and `bright` is the exact range the blades occupy
    // and disappears into them. This reads as the shaded side of a stem and
    // gives the head something to visibly stand on — the 2D site's `navFlowers`
    // reasoning, and its colour.
    stem: "#22300f",
    // A shade over the stem and still under the darkest blade body, which is
    // what puts a leaf in front of the grass rather than inside it. The 2D
    // site's own leaf is #254a2d, and against this field's canopy that lands
    // dark enough to read as a hole in the grass instead of as a leaf lying on
    // it — the leaf has its own spine-to-margin ramp to be legible with, and it
    // does not also need to be the darkest thing in the frame.
    leaf: "#35471a",
    /*
     * Half again as many stands, and slightly fewer plants in each.
     *
     * Thirty stands over a nine-metre disc is one every eight square metres,
     * and after the ones behind the lens, the ones lost to the sight corridor
     * and the ones standing in shade too deep to read, the hero came back with
     * a single stand in it. How many species a frame carries is a function of
     * how many stands are in it, so this is the number that had to move. The
     * plants per stand come down a little to pay for it: a stand is a shape and
     * not a headcount, and twelve reads the same as thirteen.
     */
    stands: 84,
    perStand: 9,
    radius: 0.045,
  },
  accents: ["#f2c744", "#e4813f", "#fbf6ea", "#a98ad6", "#5c76c8"],
  accentMix: [6, 6, 3, 1, 1],
};

const FLOWERS: Biome = {
  id: "flowers",
  label: "Superbloom",
  blurb: "Poppies, and a little phacelia.",
  swatch: ["#5a4a1e", "#ec3d1a"],
  deep: "#20401f",
  bright: "#3f6f36",
  litA: "#5c8a45",
  litB: "#7ba354",
  rare: "#4a6b56",
  groundFar: "#1b2f18",
  groundNear: "#2d4a24",
  haze: "#182a16",
  // Understory here, so it is cut short and stands out of the way of the heads.
  blade: { height: 0.3, slenderness: 15, fan: 0.48, curve: 0.18 },
  heads: {
    /*
     * Late light, not noon: a field of heads at full saturation averages
     * brighter than the meadow, and the hero type has to sit on all four
     * biomes.
     *
     * All five of these are actually planted now — see HEAD_COLOURS in
     * three/Heads.tsx, which used to read the first three and drop the rest, so
     * the phacelia this biome's own blurb promises was in the data and in no
     * frame. Order is the order of the bands there, so the first two are the
     * commonest and the list runs warm to cool.
     *
     * The ember red comes first and is a quarter of the field rather than two
     * fifths of it. At the old share it was not a flower colour, it was the
     * wallpaper: the page's warmest brand accent covering more of the frame than
     * the grass did. The bright gold and the lavender are the two new stops.
     * Gold is the risk — it is warm and it is the brightest thing here — so it
     * is pitched at a field marigold rather than at a highlighter and held to a
     * fifth. Lavender is the fix: a fifth of the field in a cool low-luminance
     * flower is a fifth of the field no longer competing with the wordmark, and
     * it is what a real superbloom has between the poppies.
     */
    // Pushed to full bloom: more saturated and brighter across all five, the
    // same warm-to-cool spread — poppy red, orange, marigold, phacelia violet,
    // crimson. Their sunlit twins come off these automatically.
    colors: ["#ec3d1a", "#f5701c", "#ffbe1a", "#9d6bff", "#e0304a"],
    eye: "#2a1608",
    // Heads per clump — and the clump budget went up by a fifth, so this comes
    // down by the same fifth. What a superbloom's brightness rides on is how
    // many heads there are per square metre and not how many clumps they are
    // sown into: leaving this alone put a fifth more poppies in the frame and
    // took the mean luminance up nine percent with them, and the hero type sits
    // on that number. The extra clumps were bought for the grass under the
    // heads, which is where they have gone.
    density: 0.8,
    radius: 0.055,
    grassScale: 0.62,
  },
  // What drifts is what the field sheds, so the lavender comes up here too now
  // that a fifth of the plants are actually carrying it — but at one petal in
  // eight rather than one in four. The brand contract is still two accents, and
  // a drift is read against the wordmark rather than against the field.
  accents: ["#e0562f", "#f2c744", "#fbf6ea", "#8f7ac6"],
  accentMix: [6, 4, 2, 2],
};

const FOREST: Biome = {
  id: "forest",
  label: "Deciduous forest",
  blurb: "Ferns, litter, falling leaves.",
  swatch: ["#3d2c1d", "#c8712f"],
  // Ferns read cooler and more olive than meadow grass, and about a tenth of
  // them have started to turn — that warm `rare` is the turning frond, and
  // without it the whole biome reads as meadow with the lights off.
  deep: "#142a1c",
  bright: "#3e6434",
  litA: "#688442",
  litB: "#849850",
  rare: "#92682a",
  // Leaf litter and loam rather than soil: warm, and much darker than the
  // meadow, because a forest floor sits in the canopy's shade.
  groundFar: "#1a1209",
  groundNear: "#332616",
  haze: "#150f08",
  // Nothing plants a blade here — the field is fronds — but a biome still has
  // to say how tall what grows on it is, and the fern storeys are pitched off
  // this.
  blade: { height: 0.55, slenderness: 9, fan: 0.72, curve: 0.36 },
  fronds: {
    // The 2D site's three storeys, at its own proportions: a scattering of
    // woody ones, then roughly equal numbers of tall and short ferns. The
    // woody storey is taller here than it is there, because a small tree that
    // stands level with the ferns is only a small tree in a flat drawing —
    // in a frame you can move through it has to break the canopy line.
    storeys: [
      { share: 0.03, height: 0.9, woody: true },
      { share: 0.26, height: 0.58, woody: false },
      { share: 0.33, height: 0.34, woody: false },
      // A fourth storey the 2D site has no need of. There it seals the floor
      // with six hundred silhouettes rasterised into the ground, which is a
      // trick only a fixed camera falls for; the last act here is spent lying
      // on that floor, so the thing that closes it has to be a plant.
      { share: 0.38, height: 0.19, woody: false },
    ],
    bark: ["#3f2d1c", "#7c603c"],
    litter: ["#6b3a1c", "#7d4a22", "#5c3218", "#8f5a24", "#4a2d16"],
    grass: false,
  },
  accents: ["#c8712f", "#a8451f", "#d8a03a", "#8f5320", "#c9913a"],
};

const POND: Biome = {
  id: "pond",
  label: "Japanese pond",
  blurb: "Koi under it, blossom on it.",
  swatch: ["#5ea3c4", "#f0603a"],
  // The bank, which is the only planted ground in this biome and is therefore
  // the only green in the frame. Cooler and darker than the meadow's, because
  // it is a couple of hours later and because a warm green beside cold water
  // reads as two photographs. The `rare` is a sedge — the blue-green thing that
  // grows with its feet actually in the water.
  deep: "#1f4d33",
  bright: "#417f57",
  litA: "#68ab7c",
  litB: "#8ac49a",
  rare: "#438f8b",
  // Only the mound the plant is rooted in reads these now — three/Bank.tsx
  // lays silt over the soil everywhere the waterline can be reached from — and
  // that mound is a third of a metre from the lens for the whole of the last
  // act, so it is pitched to the silt around it rather than to soil. A warm
  // brown hummock in a wet grey bank is the one thing in the frame saying this
  // is not a pond.
  groundFar: "#25352e",
  groundNear: "#35473f",
  haze: "#7fadc4",
  // Sedge, not lawn grass: narrower than the meadow's blade and standing
  // straighter, because it is the silhouette that has to read against water.
  // Shorter than any of the others as well — this is the one biome where the
  // grass has a job to stay out of the way of, and every centimetre of blade
  // is a centimetre of pond it stands in front of.
  blade: { height: 0.34, slenderness: 16, fan: 0.44, curve: 0.24 },
  pond: {
    // Two stops far enough apart to draw a ripple with. They average out to
    // about what one stop would have been, but a pond whose crests and troughs
    // are the same colour is a dark hole, and the whole surface has to read as
    // water in the two thirds of the frame the sun never touches.
    //
    // Both stops lifted, and the deep one hardest. This water is meant to be
    // clear, and clear water is not dark water — what makes a pond read as
    // *deep* rather than as *opaque* is that you can see something in it, so
    // the body colour has to be a colour and not a floor. At the old #071419
    // the deep stop sat four levels off black after the tone curve, which meant
    // every koi more than a hand's width under the surface was mixed toward
    // black by the veil and the bottom was not there at all. The trough of a
    // wave is now a dark teal you could still read a fish through.
    deep: "#1f5a72",
    surface: "#5ea3c4",
    // What a flat facet gives back, which in a scene with no sky is the only
    // sky there is. Lifted well clear of the haze it used to be a copy of: the
    // reflection is the second thing this biome is being asked for, and a
    // mirror the colour of the water it lies on is not a mirror.
    sheen: "#a8cfdd",
    sun: "#ffbe45",
    // The rest of the scene's sun sits nine degrees up, which is behind the far
    // fog and would put its reflection out of frame entirely. This one keeps
    // that bearing and is lifted to twenty-six, which is where the road it
    // draws lands in the water the hero actually shows. Nothing else reads it,
    // because the sun itself is never visible from anywhere in this scene.
    sunDir: [-1.05, 0.19, -1],
    koi: ["#f2ece0", "#e2661d", "#463a2e"],
    /**
     * Blossom on the surface: the wet end, then the dry edge.
     *
     * Pitched down about a third from the pink these were, and it is the same
     * decision as the canopy's autumn leaves — hue, not light. The pond is now
     * half under this stuff rather than lightly scattered with it, which makes
     * the blossom the single biggest colour in the hero, and the hero's copy
     * sits on it with no scrim. Measured with scripts/hero-measure.mjs at the
     * colour they were, a paragraph over the water dropped from 15:1 to 7:1 and
     * its worst twentieth to 2.2:1 — the covering was legible and the sentence
     * on top of it was not. These land at a dusk rose that still reads pink
     * against cold water and gives the type back its stop.
     */
    petal: ["#c4657f", "#e8a4bb"],
    // Read these against the tone curve rather than as swatches: the scene
    // tonemaps at 0.85 and ACES crushes the bottom of the ramp hard, so a
    // #101a1c that looks like a plausible wet grey in a picker lands on screen
    // at three levels above black — which is to say invisible. It was, and the
    // only thing giving this bank any value at all was the sun coming off the
    // water, which is why it read as ribbons of brown on nothing. These land at
    // a dark cool grey and a drier olive crust, and leave the water light with
    // something to be a light *on*.
    silt: ["#8b7b5e", "#a4926f"],
  },
  // Blossom, going over the bank and onto the water. What falls has to be what
  // is on the surface already, or the two read as unrelated weather — which is
  // why these came down with the surface blossom rather than staying where they
  // were. Held one stop over it, because a petal in the air is catching what
  // little light there is on both faces and one lying in water is not; the two
  // near-whites in particular were the brightest thing left in the frame once
  // the pond's own covering was pitched to dusk, and four bright specks over a
  // dark pond do not read as blossom, they read as dust on the lens.
  accents: ["#c39aa7", "#a8798a", "#d0b5bd", "#d6c8c4"],
};

export const BIOMES: readonly Biome[] = [MEADOW, FLOWERS, FOREST, POND];

export const DEFAULT_BIOME: BiomeId = "meadow";

export function biomeById(id: BiomeId): Biome {
  return BIOMES.find((b) => b.id === id) ?? MEADOW;
}
