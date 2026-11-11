// src/lib/biomes.ts
var MEADOW = {
  id: "meadow",
  label: "Meadow",
  blurb: "Summer grass, in flower.",
  swatch: ["#2f7a4a", "#e4813f"],
  deep: "#1c4c31",
  bright: "#37875c",
  litA: "#549e75",
  litB: "#76ba8f",
  rare: "#2c7466",
  groundFar: "#163a24",
  groundNear: "#235c31",
  haze: "#12301e",
  blade: { height: 0.42, slenderness: 13, fan: 0.52, curve: 0.2 },
  accents: ["#f2c744", "#e4813f", "#fbf6ea", "#a98ad6", "#5c76c8"]
};
var FLOWERS = {
  id: "flowers",
  label: "Superbloom",
  blurb: "Poppies, and a little phacelia.",
  swatch: ["#5a4a1e", "#e0562f"],
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
    // Late light, not noon: a field of heads at full saturation averages
    // brighter than the meadow, and the hero type has to sit on all three.
    colors: ["#c2431f", "#c9622b", "#cfa235", "#b03f3f", "#63478f"],
    eye: "#2a1608",
    density: 1.15,
    radius: 0.055,
    grassScale: 0.62
  },
  accents: ["#e0562f", "#f2c744", "#fbf6ea", "#7d5ab8"]
};
var FOREST = {
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
      { share: 0.38, height: 0.19, woody: false }
    ],
    bark: ["#3f2d1c", "#7c603c"],
    litter: ["#6b3a1c", "#7d4a22", "#5c3218", "#8f5a24", "#4a2d16"],
    grass: false
  },
  accents: ["#c8712f", "#a8451f", "#d8a03a", "#8f5320", "#c9913a"]
};
var POND = {
  id: "pond",
  label: "Japanese pond",
  blurb: "Koi under it, blossom on it.",
  swatch: ["#16323e", "#e2a6b8"],
  // The bank, which is the only planted ground in this biome and is therefore
  // the only green in the frame. Cooler and darker than the meadow's, because
  // it is a couple of hours later and because a warm green beside cold water
  // reads as two photographs. The `rare` is a sedge — the blue-green thing that
  // grows with its feet actually in the water.
  deep: "#122c1e",
  bright: "#28553a",
  litA: "#417351",
  litB: "#5b8a66",
  rare: "#2a5a5e",
  // Only the mound the plant is rooted in reads these now — three/Bank.tsx
  // lays silt over the soil everywhere the waterline can be reached from — and
  // that mound is a third of a metre from the lens for the whole of the last
  // act, so it is pitched to the silt around it rather than to soil. A warm
  // brown hummock in a wet grey bank is the one thing in the frame saying this
  // is not a pond.
  groundFar: "#0f1a17",
  groundNear: "#16211f",
  haze: "#0c1a22",
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
    deep: "#071419",
    surface: "#1d4351",
    sheen: "#101f28",
    sun: "#f0b878",
    // The rest of the scene's sun sits nine degrees up, which is behind the far
    // fog and would put its reflection out of frame entirely. This one keeps
    // that bearing and is lifted to twenty-six, which is where the road it
    // draws lands in the water the hero actually shows. Nothing else reads it,
    // because the sun itself is never visible from anywhere in this scene.
    sunDir: [-0.42, 0.52, -1],
    koi: ["#b0a89a", "#bf4a19", "#2a221c"],
    petal: ["#b8748d", "#efc7d5"],
    // Read these against the tone curve rather than as swatches: the scene
    // tonemaps at 0.85 and ACES crushes the bottom of the ramp hard, so a
    // #101a1c that looks like a plausible wet grey in a picker lands on screen
    // at three levels above black — which is to say invisible. It was, and the
    // only thing giving this bank any value at all was the sun coming off the
    // water, which is why it read as ribbons of brown on nothing. These land at
    // a dark cool grey and a drier olive crust, and leave the water light with
    // something to be a light *on*.
    silt: ["#2c3a3c", "#43483c"]
  },
  // Blossom, going over the bank and onto the water. What falls has to be what
  // is on the surface already, or the two read as unrelated weather.
  accents: ["#e2a6b8", "#c9788f", "#f2d9e0", "#f6ece6"]
};
var BIOMES = [MEADOW, FLOWERS, FOREST, POND];
var DEFAULT_BIOME = "meadow";
function biomeById(id) {
  return BIOMES.find((b) => b.id === id) ?? MEADOW;
}
export {
  BIOMES,
  DEFAULT_BIOME,
  biomeById
};
