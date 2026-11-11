// src/lib/math.ts
function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
function hermite(keys, x) {
  const n = keys.length;
  if (n === 0) return 0;
  if (x <= keys[0].at) return keys[0].v;
  if (x >= keys[n - 1].at) return keys[n - 1].v;
  let i = 0;
  while (i < n - 2 && x > keys[i + 1].at) i++;
  const h = keys[i + 1].at - keys[i].at;
  const slope = (j) => {
    if (j === 0) return (keys[1].v - keys[0].v) / (keys[1].at - keys[0].at);
    if (j === n - 1)
      return (keys[n - 1].v - keys[n - 2].v) / (keys[n - 1].at - keys[n - 2].at);
    const hPrev = keys[j].at - keys[j - 1].at;
    const hNext = keys[j + 1].at - keys[j].at;
    const dPrev = (keys[j].v - keys[j - 1].v) / hPrev;
    const dNext = (keys[j + 1].v - keys[j].v) / hNext;
    if (dPrev * dNext <= 0) return 0;
    const w1 = 2 * hNext + hPrev;
    const w2 = hNext + 2 * hPrev;
    return (w1 + w2) / (w1 / dPrev + w2 / dNext);
  };
  const m0 = slope(i);
  const m1 = slope(i + 1);
  const t = (x - keys[i].at) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * keys[i].v + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * keys[i + 1].v + (t3 - t2) * h * m1;
}

// src/three/soil.ts
import {
  BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry
} from "three";

// src/lib/flowerLayout.ts
import { Matrix4, Vector3 } from "three";
var FLOWER = {
  x: 0.3,
  /**
   * Just past the bottom edge of the hero frame — a metre in front of the
   * camera and below it.
   *
   * Hiding an upward-facing bloom from a bird's eye by piling grass on it does
   * not work: you are looking straight down into the canopy, and no plausible
   * amount of grass roofs it over. Putting it below the bottom of the frame
   * does, and it is also the more honest version of the same idea — the flower
   * is in the near grass at your feet the whole time, and the approach is the
   * camera tipping down to find what it has been standing over.
   */
  z: 0.8,
  /**
   * Stem height — deliberately shorter than the grass around it.
   *
   * A plant that stands proud of the canopy is a thing in the background of
   * the hero, and then the approach is just a dolly toward something you have
   * been looking at the whole time. Tucked an inch under the canopy line it is
   * genuinely not there until the camera comes down into the field and parts
   * it, which is the moment the whole first act is built around.
   */
  height: 0.34,
  /**
   * Barely cleared at all. The grass has to grow right up to the stem or the
   * bare ring around it is itself the thing that gives the plant away from
   * above — a hole in a field reads from much further off than a flower does.
   */
  clearing: 0.12
};
var PHASE = -Math.PI / 2 + 0.22;
var view = {
  matrix: new Matrix4(),
  ready: false
};
var _p = new Vector3();

// src/three/pond.ts
var f = (n) => n.toFixed(5);
var BANK = {
  /**
   * The waterline, in metres of z.
   *
   * Fixed by the two cameras that care. The hero is pitched down past half its
   * field of view and frames the ground from about z 0.44 at the bottom of the
   * frame out to z -4.3 at the top, so a waterline here is a fifth of the way
   * up it — and once the sedge standing on the bank is counted, about a third,
   * which is as much bank as "only the near edge has grass" will bear. And
   * every camera below the hero reads the plant at z 0.8 from about z 1.0, so
   * the bank still has three quarters of a metre of run-up in front of the
   * plant and two metres behind it.
   */
  z: -0.12,
  /** How far the edge wanders either side of that, so it is not a ruled line. */
  meander: 0.2,
  /**
   * The bay, and the whole reason the pond survives the second half of the
   * journey.
   *
   * From the bloom onward the camera is under half a metre off the ground and
   * pointed at the plant, and a bank of any depth is a wall from down there:
   * with the waterline a metre out there is no angle at which open water is in
   * the shot, so the biome quietly became a meadow at chapter two. A bay
   * curling in behind the plant puts the water's edge back within sixty
   * centimetres of it, which is close enough that the frames over the bloom
   * look across it rather than into the grass in front of it.
   *
   * It is one lobe rather than a nearer waterline everywhere, because the hero
   * is composed on a full band of bank along the bottom of the frame and
   * pulling the whole edge in would take that away. Where the lobe is is the
   * only place it costs anything, and there it reads as what it is.
   */
  bay: { x: 0.45, reach: 0.3, width: 0.62 },
  /**
   * How far back from the water the planting runs, and how far along it.
   *
   * Nothing in the journey ever frames ground past z 1.3 — the camera is
   * standing on it by then — so a strip under three metres deep covers every
   * shot, and the clumps that would have gone behind the lens go into the bank
   * you can actually see instead.
   */
  depth: 2.8,
  halfWidth: 6,
  /**
   * A bank is about an eighth of the meadow's area, so a field's worth of
   * clumps planted into it is a hedge rather than a bank. Somewhat over half
   * again the meadow's density, which is dense enough to read as a fringe from
   * the hero and open enough that the silt shows between the clumps from the
   * four chapters spent lying on it.
   */
  clumpShare: 0.22
};
function bankEdgeZ(x) {
  const d = (x - BANK.bay.x) / BANK.bay.width;
  return BANK.z + Math.sin(x * 1.13 + 0.7) * BANK.meander * 0.62 + Math.sin(x * 0.41 - 1.9) * BANK.meander * 0.38 + Math.sin(x * 6.1 + 2.4) * 0.046 + Math.sin(x * 9.7 - 0.8) * 0.024 + Math.sin(x * 21.3 + 1.1) * 9e-3 + BANK.bay.reach * Math.exp(-d * d);
}
var BANK_GLSL = (
  /* glsl */
  `
float bankEdgeZ(float x) {
  float d = (x - ${f(BANK.bay.x)}) / ${f(BANK.bay.width)};
  return ${f(BANK.z)}
    + sin(x * 1.13 + 0.7) * ${f(BANK.meander * 0.62)}
    + sin(x * 0.41 - 1.9) * ${f(BANK.meander * 0.38)}
    + sin(x * 6.1 + 2.4) * 0.046
    + sin(x * 9.7 - 0.8) * 0.024
    + sin(x * 21.3 + 1.1) * 0.009
    + ${f(BANK.bay.reach)} * exp(-d * d);
}
`
);
var MARGIN = 0.16;
var SHORE_GLSL = (
  /* glsl */
  `
float shoreMargin(vec2 p) {
  // One field at the scale of the shelf of silt that lies out under the
  // surface, with a finer one riding on it to take bites out of the edge \u2014
  // summed and cut once, rather than two thresholds multiplied together. The
  // product of two thresholds is islands: it does not break an edge, it
  // dissolves it into confetti, which is a different thing from a shore.
  float shelf = fbm3(p * 3.4 + 3.7) * 0.74 + fbm3(p * 15.0 - 1.3) * 0.26;
  return ${f(MARGIN)} * smoothstep(0.30, 0.64, shelf);
}
`
);
var SHORE = 0.34;

// src/three/soil.ts
var f2 = (n) => n.toFixed(5);
var SOIL = {
  /**
   * Half the side of the square of ground that is modelled rather than flat.
   *
   * Big enough that its rim is never in shot. The soil act reads the ground
   * from twelve centimetres up, and at that height the floor fills the frame
   * for several metres — a patch that stopped at 1.3 m put its own straight
   * edge across the picture with untextured plane beyond it.
   */
  patchHalf: 2.7,
  /**
   * Cells across it — a shade under two and a half centimetres each. Finer
   * than the crumbs the field carries, and where the budget stops: this is
   * twenty-nine square metres, not the hundred the flat plane covers. It went
   * up from three centimetres when the clods did: a lump the mesh cannot
   * resolve is a slope, and a floor of slopes is the flat sheet this was.
   */
  segments: 216,
  /** The throw of earth around the stem — see moundHeight. */
  moundRadius: 0.15,
  moundHeight: 0.034,
  /**
   * How far the whole patch stands over the flat floor it is laid on.
   *
   * The relief only ever heaps, never digs. Every blade in the field is rooted
   * at y = 0 by three/field.ts, and ground that drops below that leaves the
   * near grass standing on air — whereas ground that rises buries a centimetre
   * of a forty-centimetre blade and reads as the blade being rooted in it.
   */
  bed: 5e-3
};
function moundHeight(dx, dz) {
  const r = Math.hypot(dx, dz);
  const a = Math.atan2(dz, dx);
  const wob = 0.68 + 0.44 * (0.5 + 0.5 * Math.sin(a * 3 + 0.6)) + 0.24 * (0.5 + 0.5 * Math.sin(a * 7 - 1.4));
  const rr = r / (SOIL.moundRadius * wob);
  if (rr >= 1) return 0;
  const m = 1 - rr;
  return SOIL.moundHeight * m * m * (3 - 2 * m) * (0.78 + 0.3 * Math.sin(a * 5 - 0.9));
}
var SOIL_GLSL = (
  /* glsl */
  `
${BANK_GLSL}

float soilHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float soilNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(soilHash(i), soilHash(i + vec2(1.0, 0.0)), f.x),
    mix(soilHash(i + vec2(0.0, 1.0)), soilHash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

float soilFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * soilNoise(p);
    p *= 2.13;
    amp *= 0.52;
  }
  return sum;
}

/** Three octaves, for the relief \u2014 the fourth is under a millimetre of height. */
float soilFbm3(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * soilNoise(p);
    p *= 2.13;
    amp *= 0.52;
  }
  return sum;
}

float soilMound(vec2 d) {
  float r = length(d);
  float a = atan(d.y, d.x);
  float wob = 0.68
    + 0.44 * (0.5 + 0.5 * sin(a * 3.0 + 0.6))
    + 0.24 * (0.5 + 0.5 * sin(a * 7.0 - 1.4));
  float rr = r / (${f2(SOIL.moundRadius)} * wob);
  if (rr >= 1.0) return 0.0;
  float m = 1.0 - rr;
  return ${f2(SOIL.moundHeight)} * m * m * (3.0 - 2.0 * m) * (0.78 + 0.3 * sin(a * 5.0 - 0.9));
}

/**
 * Ground height at p, and the two parts of it the shading wants back: how deep
 * into a hollow this point is, and how far up the mound.
 */
float soilHeightFull(vec2 p, float pond, out float crumb, out float mound) {
  // How much relief the patch is allowed here. It goes to nothing at the rim so
  // the modelled square and the flat plane meet without a step, and \u2014 in a pond
  // biome \u2014 again at the waterline, because a bank standing two centimetres
  // proud of the water it runs into is a kerb.
  // Radial, and gone well before the rim. A Chebyshev falloff fades the
  // relief to nothing along four straight lines, and four straight lines is
  // exactly what you see: a two-and-a-half metre brown square sitting on a
  // green floor with its corners showing.
  vec2 q = (p - vec2(${f2(FLOWER.x)}, ${f2(FLOWER.z)})) / ${f2(SOIL.patchHalf)};
  float edge = 1.0 - smoothstep(0.52, 0.94, length(q));
  if (pond > 0.5) edge *= smoothstep(-0.02, 0.34, p.y - bankEdgeZ(p.x));

  float swell = soilFbm3(p * 1.6);
  float clod  = soilFbm3(p * 7.0);
  // Clods cubed, so the field is mostly flat ground with lumps standing out
  // of it rather than a swell that never settles anywhere.
  //
  // ...and a ridge over the top of them. Summed noise only ever makes blobs,
  // and a floor of blobs is bubblewrap: the thing that reads as broken ground
  // is a crease, which is what you get from the ridged form \u2014 the noise folded
  // about its own midline so its zero crossings become edges instead of
  // inflections.
  float crease = 1.0 - abs(soilNoise(p * 3.7) * 2.0 - 1.0);
  float bed = ${f2(SOIL.bed)}
    + 0.010 * swell
    + 0.026 * clod * clod * clod
    + 0.008 * crease * crease;

  mound = soilMound(p - vec2(${f2(FLOWER.x)}, ${f2(FLOWER.z)}));

  // Crumbs are signed, and signed height is only safe inside the clearing the
  // field leaves around the plant \u2014 outside it a hollow would strand a blade in
  // mid air, so out there the crumbs are allowed to heap and not to dig.
  crumb = (soilFbm3(p * 21.0) - 0.44) * 0.024 + (soilFbm3(p * 62.0) - 0.46) * 0.008;
  float bare = smoothstep(0.006, 0.022, mound);
  float crumbed = mix(max(crumb, 0.0), crumb, bare);

  // A bank is not broken ground. three/Bank.tsx lays a sheet of wet silt a
  // couple of millimetres over the soil wherever there is water, and that sheet
  // is flat, so everything but the mound ducks under it and lets it read \u2014 the
  // stones still stand out of it, which is what a silt bank looks like anyway.
  float dug = mix(1.0, 0.045, step(0.5, pond));

  return edge * (bed * dug + mound + crumbed * dug);
}

float soilHeight(vec2 p, float pond) {
  float crumb;
  float mound;
  return soilHeightFull(p, pond, crumb, mound);
}
`
);
var LITTER_VERT = (
  /* glsl */
  `
attribute vec3  iPos;    // where it lies, and how far it is sunk
attribute vec3  iScale;
attribute vec2  iRot;    // yaw, then tip
attribute float iTone;

uniform float uPond;

varying vec3  vNrm;
varying vec3  vWorld;
varying float vTone;

#include <fog_pars_vertex>

${SOIL_GLSL}

vec3 spin(vec3 v, vec2 r) {
  float ct = cos(r.y);
  float st = sin(r.y);
  v = vec3(v.x, ct * v.y - st * v.z, st * v.y + ct * v.z);
  float cy = cos(r.x);
  float sy = sin(r.x);
  return vec3(cy * v.x + sy * v.z, v.y, -sy * v.x + cy * v.z);
}

void main() {
  vec3 v = spin(position * iScale, iRot);
  // Squashing a lump flat turns its normals with it the other way round, which
  // is the difference between a slab that reads as lying down and one lit as
  // though it were still a ball.
  vNrm = normalize(spin(normal / iScale, iRot));
  vTone = iTone;

  // The ground height is looked up once per stone, not once per vertex: a lump
  // that followed the field across its own width would shear.
  vec3 world = v + iPos + vec3(0.0, soilHeight(iPos.xz, uPond), 0.0);
  vWorld = world;

  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`
);
var LITTER_FRAG = (
  /* glsl */
  `
uniform vec3 uDark;
uniform vec3 uLit;
uniform vec3 uMoss;

varying vec3  vNrm;
varying vec3  vWorld;
varying float vTone;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

${SOIL_GLSL}

void main() {
  // Flat fill, in the same spirit as the field: a stone's colour is decided
  // when it is dropped and the only thing that varies across it is which way
  // the facet points \u2014 a top stop for the faces the last of the light reaches
  // and a much darker one for the sides, which is what gives twenty flat
  // triangles a shape.
  vec3 body = mix(uDark, uLit, vTone * vTone);
  // One stone in seven has something growing on it, which is the cheapest way
  // to say that this ground is alive rather than swept.
  body = mix(body, uMoss, smoothstep(0.86, 1.0, vTone));

  vec3 N = normalize(vNrm);
  float up = clamp(N.y, 0.0, 1.0);
  // Held under the floor it lies in, not over it. A stone reads as a stone
  // because it has an edge and a shadow; one lighter than the soil around it
  // reads as a chip of crockery, and once the ground got its crumb back the
  // few big ones near the lens were the brightest things in the soil act.
  vec3 col = body * mix(0.34, 0.9, up * up);
  // A facet turned into the low sun keeps a rim of dust on it.
  col += uLit * smoothstep(0.55, 0.95, dot(N, normalize(vec3(-0.4, 0.55, -0.73)))) * 0.06;
  // Grain, off the same fields the floor around it is drawn from \u2014 one at the
  // size of the stone and one well under it. Twenty flat triangles at a hand's
  // width from the lens are twenty flat *colours*, however well shaped.
  col *= 0.74 + 0.5 * soilFbm(vWorld.xz * 190.0);
  col *= 0.82 + 0.34 * soilNoise(vWorld.xz * 42.0);

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`
);

// src/lib/journey.ts
import { Vector3 as Vector32 } from "three";
function overBloom(deg, radius, height) {
  const a = deg * Math.PI / 180;
  return [
    FLOWER.x + Math.cos(a) * radius,
    FLOWER.height + height,
    FLOWER.z + Math.sin(a) * radius
  ];
}
function besideStem(deg, radius, y) {
  const a = deg * Math.PI / 180;
  return [FLOWER.x + Math.cos(a) * radius, y, FLOWER.z + Math.sin(a) * radius];
}
var BLOOM = [FLOWER.x, FLOWER.height, FLOWER.z];
var FRAMES = [
  // ---- 0 · the field, from above ---------------------------------------
  //
  // High and tipped hard down. Two things fall out of that: the horizon is
  // above the top of the frame, so the canopy is the whole picture and there
  // is no sky anywhere in this scene; and the plant, which stands an inch
  // under the canopy line in the near grass, is not merely small — it is
  // behind the grass at the bottom of the frame, and cannot be picked out
  // until the camera drops into it.
  { at: 0, pos: [0, 2.95, 1.75], target: [0, 0.02, -1.05], fov: 40 },
  { at: 0.6, pos: [0.04, 2.88, 1.66], target: [0, 0.02, -1.15], fov: 40 },
  // ---- 1 · the approach. The camera tips down and drops into the grass at
  // its own feet, and the flower it has been standing over the whole time
  // comes up into frame. -----------------------------------------------
  { at: 1, pos: [0.08, 2.66, 1.78], target: [0.12, 0.04, -0.65], fov: 41 },
  { at: 1.35, pos: [0.2, 1.94, 1.66], target: [0.28, 0.14, 0.3], fov: 41 },
  { at: 1.65, pos: [0.32, 1.26, 1.5], target: [FLOWER.x, 0.28, FLOWER.z], fov: 42 },
  { at: 1.86, pos: [0.4, 0.96, 1.33], target: BLOOM, fov: 42 },
  { at: 2, pos: overBloom(72, 0.34, 0.6), target: BLOOM, fov: 42 },
  // ---- 2 · the bloom. Eight petals, eight things it does. The camera is
  // nearly still here and only turns — the labels are pinned to the petals,
  // and a moving frame makes eight of them chase their own anchors. -----
  { at: 2.35, pos: overBloom(84, 0.35, 0.61), target: BLOOM, fov: 42 },
  { at: 2.7, pos: overBloom(97, 0.36, 0.605), target: BLOOM, fov: 42 },
  { at: 3, pos: overBloom(110, 0.4, 0.53), target: [FLOWER.x, FLOWER.height - 0.02, FLOWER.z], fov: 43 },
  // ---- 3 · down the stem. Out of the bloom, onto the stem, and then the
  // pan down it with the ant going first. Heights are fractions of the
  // stem rather than metres, so shortening the plant does not strand the
  // camera above it. ----------------------------------------------------
  { at: 3.15, pos: besideStem(118, 0.34, FLOWER.height * 1.14), target: [FLOWER.x, FLOWER.height * 0.95, FLOWER.z], fov: 44 },
  { at: 3.4, pos: besideStem(126, 0.3, FLOWER.height * 0.83), target: [FLOWER.x, FLOWER.height * 0.72, FLOWER.z], fov: 44 },
  { at: 3.7, pos: besideStem(134, 0.28, FLOWER.height * 0.53), target: [FLOWER.x, FLOWER.height * 0.43, FLOWER.z], fov: 44 },
  { at: 4, pos: besideStem(142, 0.3, FLOWER.height * 0.24), target: [FLOWER.x, FLOWER.height * 0.14, FLOWER.z], fov: 44 },
  // ---- 4 · the soil. The camera stops going down and sits on the ground
  // the whole plant is standing in. -------------------------------------
  //
  // Both of these sit *inside* the plant's clearing. Outside it, at half a
  // metre, a single clump can root a couple of centimetres from the lens and
  // fill the frame edge to edge — chapter 4.95 was three green gradients and
  // nothing else. In here the nearest blade is behind the plant rather than in
  // front of it, so the mound, the roots and the stem's foot are the shot and
  // the field is what frames them.
  // Aimed at the plant's foot rather than at the ground beside it: the act is
  // about what it is standing in, which needs the thing that is standing.
  // Aimed left of the plant so it stands in the right-hand third, clear of
  // the reading column the FAQ lays over this act.
  { at: 4.4, pos: besideStem(152, 0.32, 0.15), target: [FLOWER.x - 0.11, 0.115, FLOWER.z], fov: 43 },
  { at: 5, pos: besideStem(172, 0.36, 0.135), target: [FLOWER.x - 0.12, 0.1, FLOWER.z], fov: 42 },
  // ---- 5 · back out, to the bird's eye again.
  //
  // The move is finished by 5.5, not 6: an act's local progress reaches 1
  // when its last pixel leaves the top of the screen, so the back half of
  // this one plays to a reader already looking at the footer. -----------
  { at: 5.25, pos: [FLOWER.x + 0.4, 0.62, FLOWER.z + 0.95], target: [FLOWER.x, 0.3, FLOWER.z], fov: 42 },
  // Aimed off the plant rather than at it, so the centred closing copy has
  // the middle of the frame and the flower stands to one side of it.
  { at: 5.5, pos: [FLOWER.x + 2.1, 1.7, FLOWER.z + 1.6], target: [FLOWER.x - 1.85, 0.1, FLOWER.z - 0.5], fov: 41 },
  { at: 6, pos: [FLOWER.x + 1.9, 2.9, FLOWER.z + 2.1], target: [FLOWER.x - 1.9, 0.02, FLOWER.z - 1.2], fov: 40 }
];
var channel = (pick) => FRAMES.map((f3) => ({ at: f3.at, v: pick(f3) }));
var CHANNELS = {
  px: channel((f3) => f3.pos[0]),
  py: channel((f3) => f3.pos[1]),
  pz: channel((f3) => f3.pos[2]),
  tx: channel((f3) => f3.target[0]),
  ty: channel((f3) => f3.target[1]),
  tz: channel((f3) => f3.target[2]),
  fov: channel((f3) => f3.fov)
};
var _pos = new Vector32();
var _target = new Vector32();
function sampleCamera(c, out) {
  const o = out ?? { pos: _pos, target: _target, fov: 42 };
  o.pos.set(hermite(CHANNELS.px, c), hermite(CHANNELS.py, c), hermite(CHANNELS.pz, c));
  o.target.set(hermite(CHANNELS.tx, c), hermite(CHANNELS.ty, c), hermite(CHANNELS.tz, c));
  o.fov = hermite(CHANNELS.fov, c);
  return o;
}
var LAYOUT = {
  heroVh: 100,
  approachVh: 128,
  bloomIntroVh: 120,
  bloomPetalVh: 62,
  stemIntroVh: 110,
  stemStepVh: 88,
  outVh: 200
};
var FEATURE_COUNT = 8;
var STEP_COUNT = 4;
var BLOOM_TOTAL = LAYOUT.bloomIntroVh + FEATURE_COUNT * LAYOUT.bloomPetalVh;
var STEM_TOTAL = LAYOUT.stemIntroVh + STEP_COUNT * LAYOUT.stemStepVh;

// src/three/field.ts
var FIELD_RADIUS = 9;
var FOCUS_Z = -1.5;
var GROUND_EYE = (() => {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const p = sampleCamera(3.9 + i / 24 * 1.25).pos;
    pts.push([p.x, p.z]);
  }
  return pts;
})();
var EYE_CLEAR = 0.16;
var SIGHT_CLEAR = 0.075;
function rootHeight(x, z) {
  return SOIL.bed + moundHeight(x - FLOWER.x, z - FLOWER.z);
}
function nearGroundEye(x, z) {
  for (const [ex, ez] of GROUND_EYE) {
    const dx = x - ex;
    const dz = z - ez;
    if (dx * dx + dz * dz < EYE_CLEAR * EYE_CLEAR) return true;
    const sx = FLOWER.x - ex;
    const sz = FLOWER.z - ez;
    const len = sx * sx + sz * sz;
    if (len < 1e-6) continue;
    let t = (dx * sx + dz * sz) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = dx - sx * t;
    const cz = dz - sz * t;
    if (cx * cx + cz * cz < SIGHT_CLEAR * SIGHT_CLEAR) return true;
  }
  return false;
}
function plantField(clumps, biome, seed = 20260806) {
  const rnd = makeRandom(seed);
  const blades = [];
  const heads = [];
  const grassScale = biome.heads?.grassScale ?? 1;
  const bank = biome.pond ? BANK : null;
  const n = bank ? Math.round(clumps * bank.clumpShare) : clumps;
  for (let c = 0; c < n; c++) {
    let x;
    let z;
    if (bank) {
      x = (rnd() * 2 - 1) * bank.halfWidth;
      z = bankEdgeZ(x) + rnd() * bank.depth;
    } else {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * FIELD_RADIUS;
      x = Math.cos(a) * r;
      z = FOCUS_Z + Math.sin(a) * r;
    }
    const fromFlower = Math.hypot(x - FLOWER.x, z - FLOWER.z);
    if (fromFlower < FLOWER.clearing) continue;
    if (nearGroundEye(x, z)) continue;
    const ashore = bank ? Math.min(1, Math.max(0, (z - bankEdgeZ(x)) / SHORE)) : 1;
    if (ashore < 1 && rnd() > 0.2 + 0.8 * ashore) continue;
    const shore = ashore < 1 && rnd() < 0.22 ? 1.1 : 0.4 + 0.6 * ashore;
    const nest = Math.max(0, 1 - fromFlower / 0.95);
    const shelter = 1 + 0.55 * nest * nest;
    const near = 0.35 + 0.65 * rnd();
    const h = biome.blade.height * (0.72 + 0.3 * near) * (1 + (rnd() * 2 - 1) * 0.16) * shelter * shore * grassScale;
    const facing = rnd() * Math.PI * 2;
    const towardFlower = Math.atan2(FLOWER.x - x, FLOWER.z - z) + Math.PI / 2;
    const tone = 0.12 + 0.62 * near + (rnd() * 2 - 1) * 0.22;
    const n2 = 4 + (rnd() * 3 | 0);
    for (let k = 0; k < n2; k++) {
      const u = n2 > 1 ? k / (n2 - 1) * 2 - 1 : 0;
      const bx = x + u * h * 0.075;
      const bz = z + (rnd() * 2 - 1) * h * 0.08;
      blades.push({
        x: bx,
        y: rootHeight(bx, bz),
        z: bz,
        height: h * (0.78 + rnd() * 0.3),
        halfWidth: h / biome.blade.slenderness * (0.5 + rnd() * 0.28),
        // Inside the tussock the blades also arch inward over the plant, so it
        // is roofed as well as walled. Leaning them is what closes the last of
        // the gaps you can otherwise still see straight down through.
        facing: nest > 0.05 ? towardFlower + u * 0.4 : facing + u * 0.5,
        lean: u * biome.blade.fan + (rnd() * 2 - 1) * 0.08 - nest * 0.3,
        curve: (u === 0 ? rnd() * 2 - 1 : u) * biome.blade.curve,
        phase: rnd() * Math.PI * 2,
        tone: Math.max(0.05, Math.min(0.95, tone + Math.abs(u) * 0.06)),
        litB: rnd() < 0.45 ? 0 : 1,
        rare: rnd() < 0.08 ? 1 : 0
      });
    }
    const under = 4 + (rnd() * 4 | 0) + (nest > 0.25 ? 4 : 0);
    for (let k = 0; k < under; k++) {
      const a2 = rnd() * Math.PI * 2;
      const d2 = Math.pow(rnd(), 0.6) * h * 0.5;
      const ux = x + Math.cos(a2) * d2;
      const uz = z + Math.sin(a2) * d2;
      blades.push({
        x: ux,
        y: rootHeight(ux, uz),
        z: uz,
        height: h * (0.24 + rnd() * 0.3),
        halfWidth: h / biome.blade.slenderness * (0.42 + rnd() * 0.3),
        facing: rnd() * Math.PI * 2,
        lean: (rnd() * 2 - 1) * (biome.blade.fan + 0.45),
        curve: (rnd() * 2 - 1) * biome.blade.curve * 1.4,
        phase: rnd() * Math.PI * 2,
        // Darker: this storey is in the shade of the one above it.
        tone: Math.max(0.02, Math.min(0.6, tone * 0.55 + (rnd() * 2 - 1) * 0.12)),
        litB: rnd() < 0.45 ? 0 : 1,
        rare: rnd() < 0.05 ? 1 : 0
      });
    }
    if (biome.heads && rnd() < biome.heads.density) {
      heads.push({
        x: x + (rnd() * 2 - 1) * 0.03,
        z: z + (rnd() * 2 - 1) * 0.03,
        // Standing clear of the grass it grew out of.
        height: h / grassScale + rnd() * 0.06,
        radius: biome.heads.radius * (0.6 + 0.6 * near) * (0.8 + rnd() * 0.4),
        tone: rnd(),
        phase: rnd() * Math.PI * 2
      });
    }
  }
  return { blades, heads };
}
function plantFronds(clumps, biome, seed = 771103) {
  const rnd = makeRandom(seed);
  const fronds = [];
  const spec = biome.fronds;
  if (!spec) return fronds;
  for (const storey of spec.storeys) {
    const n = Math.round(clumps * storey.share);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * FIELD_RADIUS;
      const x = Math.cos(a) * r;
      const z = FOCUS_Z + Math.sin(a) * r;
      const fromFlower = Math.hypot(x - FLOWER.x, z - FLOWER.z);
      if (fromFlower < FLOWER.clearing) continue;
      if (nearGroundEye(x, z)) continue;
      if (storey.woody && fromFlower < 0.75) continue;
      const nest = Math.max(0, 1 - fromFlower / 0.95);
      const near = 0.35 + 0.65 * rnd();
      const h = storey.height * (0.74 + 0.34 * near) * (1 + 0.55 * nest * nest);
      const towardFlower = Math.atan2(FLOWER.x - x, FLOWER.z - z);
      fronds.push({
        x,
        y: rootHeight(x, z),
        z,
        height: h,
        facing: nest > 0.05 ? towardFlower + (rnd() * 2 - 1) * 0.5 : rnd() * Math.PI * 2,
        // A sideways lean on top of the arch, by different amounts — without
        // the spread they line up as a picket fence.
        lean: (rnd() * 2 - 1) * 0.34,
        curve: (rnd() < 0.5 ? -1 : 1) * 0.3 * (0.6 + rnd() * 0.8),
        phase: rnd() * Math.PI * 2,
        tone: Math.max(0.04, Math.min(0.95, 0.16 + 0.62 * near + (rnd() * 2 - 1) * 0.12)),
        litB: rnd() < 0.45 ? 0 : 1,
        rare: rnd() < 0.1 ? 1 : 0,
        woody: storey.woody ? 1 : 0,
        trunk: 0.022 + rnd() * 0.012,
        // True ferns are more finely divided than the woody ones, and at this
        // leaflet count the only way to say so is to make theirs shorter.
        pinna: storey.woody ? 1 : 0.78 + rnd() * 0.22,
        // How far over it hangs. A fern arches most of the way to horizontal
        // and is why a fern understory has no floor showing through it; a
        // woody one holds itself up, which is what makes it read as a tree
        // rather than as a big fern.
        arch: storey.woody ? 0.16 + rnd() * 0.26 : 0.35 + rnd() * 0.75
      });
    }
  }
  return fronds;
}
function plantLitter(count, biome, seed = 419002) {
  const rnd = makeRandom(seed);
  const leaves = [];
  if (!biome.fronds) return leaves;
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * FIELD_RADIUS;
    const lx = Math.cos(a) * r;
    const lz = FOCUS_Z + Math.sin(a) * r;
    leaves.push({
      x: lx,
      y: rootHeight(lx, lz),
      z: lz,
      facing: rnd() * Math.PI * 2,
      // How far one end is propped on whatever it came down on. Most of the
      // year's fall lands on the year before it, so almost none of it is
      // actually flat, and from the soil act — which is a camera lying in
      // this — flat is the same as absent.
      tilt: (rnd() * 2 - 1) * 0.55,
      size: 0.07 + rnd() * 0.1,
      tone: rnd()
    });
  }
  return leaves;
}
export {
  plantField,
  plantFronds,
  plantLitter
};
