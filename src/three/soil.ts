import {
  BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
} from "three";
import { FLOWER } from "@/lib/flowerLayout";
import { sampleCamera } from "@/lib/journey";
import { makeRandom } from "@/lib/math";
import { BANK, BANK_GLSL, bankEdgeZ, SILT_Y, siltRelief } from "./pond";

/**
 * What the ground is made of where the reader is standing on it.
 *
 * The soil act puts the camera a hand's width off the floor beside the stem,
 * which is the closest this page ever gets to any surface, and a plane with a
 * noise fill painted on it has nothing to give at that range: no silhouette, no
 * occlusion, no sense that anything is lying on anything else. So the last two
 * and a half metres around the plant are modelled instead — a height field, the
 * throw of earth the stem comes out of, and a scatter of stones and clods lying
 * in it. Everything past that stays the one flat plane it has always been,
 * because at that range it is edge-on and fogged and nobody can tell.
 *
 * The height field lives here as GLSL and, where the CPU has to agree with it,
 * as the same arithmetic in TypeScript. The stones dodge the duplication
 * entirely by looking their own ground height up in the vertex shader.
 */

/** GLSL has no integer-to-float promotion, so every constant is emitted long. */
const f = (n: number) => n.toFixed(5);

export const SOIL = {
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
  bed: 0.005,
};

/**
 * The mound, without its crumbs: a smooth lobed cap centred on the stem.
 *
 * The lobes are the point. A circular dome is a primitive at any range and it
 * is exactly what the sphere this replaces read as; earth thrown up around a
 * stem piles unevenly, and three lobes with a smaller ripple over them is
 * enough for the silhouette to stop looking generated.
 *
 * The GLSL twin below is generated from these same numbers, and the roots in
 * three/Flower.tsx follow this function so they surface where the soil does.
 */
export function moundHeight(dx: number, dz: number): number {
  const r = Math.hypot(dx, dz);
  const a = Math.atan2(dz, dx);
  const wob =
    0.68 + 0.44 * (0.5 + 0.5 * Math.sin(a * 3 + 0.6)) + 0.24 * (0.5 + 0.5 * Math.sin(a * 7 - 1.4));
  const rr = r / (SOIL.moundRadius * wob);
  if (rr >= 1) return 0;
  const m = 1 - rr;
  return SOIL.moundHeight * m * m * (3 - 2 * m) * (0.78 + 0.3 * Math.sin(a * 5 - 0.9));
}

/**
 * Value noise and the height field over it.
 *
 * Both stages of both materials include this, which is what keeps a stone's
 * idea of where the ground is and the ground's idea of where the ground is from
 * ever drifting apart.
 */
export const SOIL_GLSL = /* glsl */ `
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

/** Three octaves, for the relief — the fourth is under a millimetre of height. */
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
  float rr = r / (${f(SOIL.moundRadius)} * wob);
  if (rr >= 1.0) return 0.0;
  float m = 1.0 - rr;
  return ${f(SOIL.moundHeight)} * m * m * (3.0 - 2.0 * m) * (0.78 + 0.3 * sin(a * 5.0 - 0.9));
}

/**
 * Ground height at p, and the two parts of it the shading wants back: how deep
 * into a hollow this point is, and how far up the mound.
 */
float soilHeightFull(vec2 p, float pond, out float crumb, out float mound) {
  // How much relief the patch is allowed here. It goes to nothing at the rim so
  // the modelled square and the flat plane meet without a step, and — in a pond
  // biome — again at the waterline, because a bank standing two centimetres
  // proud of the water it runs into is a kerb.
  // Radial, and gone well before the rim. A Chebyshev falloff fades the
  // relief to nothing along four straight lines, and four straight lines is
  // exactly what you see: a two-and-a-half metre brown square sitting on a
  // green floor with its corners showing.
  vec2 q = (p - vec2(${f(FLOWER.x)}, ${f(FLOWER.z)})) / ${f(SOIL.patchHalf)};
  float edge = 1.0 - smoothstep(0.52, 0.94, length(q));
  if (pond > 0.5) edge *= smoothstep(-0.02, 0.34, p.y - bankEdgeZ(p.x));

  float swell = soilFbm3(p * 1.6);
  float clod  = soilFbm3(p * 7.0);
  // Clods cubed, so the field is mostly flat ground with lumps standing out
  // of it rather than a swell that never settles anywhere.
  //
  // ...and a ridge over the top of them. Summed noise only ever makes blobs,
  // and a floor of blobs is bubblewrap: the thing that reads as broken ground
  // is a crease, which is what you get from the ridged form — the noise folded
  // about its own midline so its zero crossings become edges instead of
  // inflections.
  float crease = 1.0 - abs(soilNoise(p * 3.7) * 2.0 - 1.0);
  float bed = ${f(SOIL.bed)}
    + 0.010 * swell
    + 0.026 * clod * clod * clod
    + 0.008 * crease * crease;

  mound = soilMound(p - vec2(${f(FLOWER.x)}, ${f(FLOWER.z)}));

  // Crumbs are signed, and signed height is only safe inside the clearing the
  // field leaves around the plant — outside it a hollow would strand a blade in
  // mid air, so out there the crumbs are allowed to heap and not to dig.
  crumb = (soilFbm3(p * 21.0) - 0.44) * 0.024 + (soilFbm3(p * 62.0) - 0.46) * 0.008;
  float bare = smoothstep(0.006, 0.022, mound);
  float crumbed = mix(max(crumb, 0.0), crumb, bare);

  // A bank is not broken ground. three/Bank.tsx lays a sheet of wet silt a
  // couple of millimetres over the soil wherever there is water, and that sheet
  // is flat, so everything but the mound ducks under it and lets it read — the
  // stones still stand out of it, which is what a silt bank looks like anyway.
  float dug = mix(1.0, 0.045, step(0.5, pond));

  return edge * (bed * dug + mound + crumbed * dug);
}

float soilHeight(vec2 p, float pond) {
  float crumb;
  float mound;
  return soilHeightFull(p, pond, crumb, mound);
}
`;

// ---------------------------------------------------------------------------
// Litter
// ---------------------------------------------------------------------------

/**
 * Stones, clods and husks lying on the soil.
 *
 * These do the job the height field cannot: a crumb modelled into a two
 * centimetre cell is a swell, and what makes a floor read as a floor at this
 * range is small hard silhouettes with shadow under them and other things
 * partly behind them. They are a couple of hundred twenty-face lumps in one
 * draw, they only exist within a metre of the plant, and each one is sunk far
 * enough into the ground that no mismatch between the shader's height field and
 * anything else could ever float one.
 */
export type Litter = {
  geometry: InstancedBufferGeometry;
  count: number;
};

/** One lump: an icosahedron with its corners pulled about, flat shaded. */
function lumpGeometry(): { position: BufferAttribute; normal: BufferAttribute } {
  const source = new IcosahedronGeometry(1, 0);
  const src = source.attributes.position as BufferAttribute;
  const out = new Float32Array(src.count * 3);
  // PolyhedronGeometry hands back separate triangles, so one corner appears in
  // several of them: the jitter is keyed off the corner's own coordinates so
  // every copy of it moves the same way and the lump stays closed.
  const seen = new Map<string, number>();
  for (let i = 0; i < src.count; i++) {
    const x = src.getX(i);
    const y = src.getY(i);
    const z = src.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let s = seen.get(key);
    if (s === undefined) {
      const h = Math.sin(x * 91.7 + y * 47.3 + z * 13.9) * 43758.5453;
      s = 0.62 + (h - Math.floor(h)) * 0.6;
      seen.set(key, s);
    }
    out[i * 3] = x * s;
    out[i * 3 + 1] = y * s;
    out[i * 3 + 2] = z * s;
  }
  source.dispose();

  // Flat normals, per face: a stone with smoothed corners is a pebble in a
  // jeweller's window, and these are supposed to be broken ground.
  const nrm = new Float32Array(out.length);
  for (let t = 0; t < out.length; t += 9) {
    const ax = out[t + 3] - out[t];
    const ay = out[t + 4] - out[t + 1];
    const az = out[t + 5] - out[t + 2];
    const bx = out[t + 6] - out[t];
    const by = out[t + 7] - out[t + 1];
    const bz = out[t + 8] - out[t + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k++) {
      nrm[t + k * 3] = nx;
      nrm[t + k * 3 + 1] = ny;
      nrm[t + k * 3 + 2] = nz;
    }
  }

  return { position: new BufferAttribute(out, 3), normal: new BufferAttribute(nrm, 3) };
}

export function scatterLitter(count: number, pond: boolean, seed = 20260807): Litter {
  const rnd = makeRandom(seed);
  const base = lumpGeometry();

  const pos: number[] = [];
  const scale: number[] = [];
  const rot: number[] = [];
  const tone: number[] = [];

  for (let i = 0; i < count * 3 && pos.length < count * 3; i++) {
    const a = rnd() * Math.PI * 2;
    // Thickest right around the plant, where the camera spends the whole act,
    // and thinning out to nothing by a metre — which is about where the frame
    // stops being ground and starts being the grass standing in it.
    const r = 0.055 + Math.pow(rnd(), 0.8) * 0.95;
    const x = FLOWER.x + Math.cos(a) * r;
    const z = FLOWER.z + Math.sin(a) * r;
    if (pond && z < bankEdgeZ(x) + 0.08) continue;

    // Mostly grit, with the occasional stone big enough to give the frame a
    // scale — a floor of one-size crumbs is a texture again. Smaller and more
    // numerous than they were: at three centimetres and a hand's width from
    // the lens these stopped being clods and became slabs, and half a dozen
    // pale slabs is a paved floor rather than a broken one.
    const s = 0.0022 + Math.pow(rnd(), 2.9) * 0.014;
    const flat = 0.55 + rnd() * 0.45;
    const sy = s * flat;
    pos.push(x, -sy * (0.3 + rnd() * 0.4), z);
    scale.push(s * (0.8 + rnd() * 0.5), sy, s * (0.8 + rnd() * 0.5));
    rot.push(rnd() * Math.PI * 2, (rnd() * 2 - 1) * 0.34);
    tone.push(rnd());
  }

  const n = pos.length / 3;
  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", base.position);
  geo.setAttribute("normal", base.normal);
  geo.setAttribute("iPos", new InstancedBufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("iScale", new InstancedBufferAttribute(new Float32Array(scale), 3));
  geo.setAttribute("iRot", new InstancedBufferAttribute(new Float32Array(rot), 2));
  geo.setAttribute("iTone", new InstancedBufferAttribute(new Float32Array(tone), 1));
  geo.instanceCount = n;
  return { geometry: geo, count: n };
}

/**
 * Broken ground, along the floor the camera actually crawls over.
 *
 * The height field is the right answer for the shape of the ground and the
 * wrong one for its surface: its cells are two and a half centimetres, every
 * plant in the scene is rooted on the assumption that it heaps by millimetres,
 * and from twenty centimetres up that is a smooth brown gradient with speckle
 * painted on it. What is missing at that range is not more noise — it is
 * *things*: hard little silhouettes with dark under them, half sunk, some of
 * them behind others. A clod is the cheapest possible one of those.
 *
 * Where they go is the last two acts' own camera path rather than a disc round
 * the plant, because that is the only floor that is ever read this close, and a
 * thousand lumps spread over twenty-nine square metres is nothing at all. They
 * run the stone material unchanged — a clod and a stone differ in what colour
 * they are and how flat they lie, not in how they are drawn.
 */
export function scatterClods(count: number, pond: boolean, seed = 90114): Litter {
  const rnd = makeRandom(seed);
  const base = lumpGeometry();

  // The floor the soil act is read from, sampled off the camera path rather
  // than written down — the same trick three/fallen.ts uses, and for the same
  // reason: a keyframe moving in lib/journey.ts has to take this with it.
  const path: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i++) {
    const p = sampleCamera(3.2 + (i / 40) * 1.95).pos;
    path.push([p.x, p.z]);
  }
  const toPath = (x: number, z: number) => {
    let best = Infinity;
    for (const [px, pz] of path) best = Math.min(best, Math.hypot(x - px, z - pz));
    return best;
  };

  const pos: number[] = [];
  const scale: number[] = [];
  const rot: number[] = [];
  const tone: number[] = [];

  /*
   * Where the ground is broken, as opposed to where a clod is.
   *
   * Scattering lumps evenly over the floor is bubblewrap — the same mistake an
   * even pepper of crumb is, one dimension up. Broken ground comes in patches:
   * a spadeful's worth of it turned over here and smooth trodden floor a hand's
   * width away, and it is the *edge* between those two that reads as ground
   * rather than as a fill. So the clods are dealt into banks, each with its own
   * reach, banked along the path the last two acts are shot from and thinning
   * out into strays between them.
   */
  const banks: Array<[number, number, number]> = [];
  for (let i = 0; i < Math.max(24, Math.round(count / 14)); i++) {
    let bx: number;
    let bz: number;
    if (rnd() < 0.7) {
      const [px, pz] = path[(rnd() * path.length) | 0];
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.6) * 0.9;
      bx = px + Math.cos(a) * r;
      bz = pz + Math.sin(a) * r;
    } else {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 1.9;
      bx = FLOWER.x + Math.cos(a) * r;
      bz = FLOWER.z + Math.sin(a) * r;
    }
    banks.push([bx, bz, 0.035 + Math.pow(rnd(), 1.6) * 0.17]);
  }

  for (let i = 0; i < count * 4 && pos.length < count * 3; i++) {
    let x: number;
    let z: number;
    if (rnd() < 0.82) {
      const [bx, bz, reach] = banks[(rnd() * banks.length) | 0];
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.4) * reach;
      x = bx + Math.cos(a) * r;
      z = bz + Math.sin(a) * r;
    } else {
      const [px, pz] = path[(rnd() * path.length) | 0];
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.55) * 1.2;
      x = px + Math.cos(a) * r;
      z = pz + Math.sin(a) * r;
    }
    // Off the modelled patch the ground is a flat plane a hundred and twenty
    // metres across and nobody is within two metres of it, so a clod out there
    // is a triangle spent on nothing.
    if (Math.hypot(x - FLOWER.x, z - FLOWER.z) > SOIL.patchHalf * 0.92) continue;
    if (pond && z < bankEdgeZ(x) + 0.08) continue;
    // ...and the last hand's width in front of the lens stays bare, for the
    // same reason the litter does: a three-centimetre clod five centimetres
    // from the glass is a boulder across a third of the frame.
    if (toPath(x, z) < 0.075) continue;

    // Two populations. Crumb, which is most of it and is what stops the floor
    // between the big ones being bare; and clods proper, which are what the eye
    // actually reads the surface off — wide, low and lying flat, because turned
    // earth breaks into plates and not into marbles.
    // ...and they shrink toward the lens rather than being kept away from it.
    // A three-centimetre clod is a clod at half a metre and a slab of slate at
    // fifteen centimetres, and the frames that need this most are the ones
    // taken from fifteen centimetres.
    const near = Math.min(1, toPath(x, z) / 0.5);
    const big = rnd() < 0.28;
    const s =
      (big ? 0.010 + Math.pow(rnd(), 1.5) * 0.019 : 0.0032 + Math.pow(rnd(), 2.0) * 0.012) *
      (0.62 + 0.38 * near);
    // Lumps, not plates. Squashing one flat gives it a broad top facet, and a
    // broad flat facet takes one flat colour — which is the sheet this was
    // bought to break up, only in pieces.
    const flat = big ? 0.52 + rnd() * 0.4 : 0.5 + rnd() * 0.45;
    const sy = s * flat;
    // Mostly buried. A lump sitting on the ground is a pebble someone dropped;
    // a lump with two thirds of it in the ground is the ground.
    pos.push(x, -sy * (0.5 + rnd() * 0.45), z);
    scale.push(s * (0.75 + rnd() * 0.7), sy, s * (0.75 + rnd() * 0.7));
    rot.push(rnd() * Math.PI * 2, (rnd() * 2 - 1) * 0.4);
    // The material squares this before it mixes, so a flat draw here puts
    // almost all of them on the dark stop and the floor reads as cinders.
    tone.push(0.28 + rnd() * 0.72);
  }

  const n = pos.length / 3;
  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", base.position);
  geo.setAttribute("normal", base.normal);
  geo.setAttribute("iPos", new InstancedBufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("iScale", new InstancedBufferAttribute(new Float32Array(scale), 3));
  geo.setAttribute("iRot", new InstancedBufferAttribute(new Float32Array(rot), 2));
  geo.setAttribute("iTone", new InstancedBufferAttribute(new Float32Array(tone), 1));
  geo.instanceCount = n;
  return { geometry: geo, count: n };
}

/**
 * Rocks along the waterline.
 *
 * What used to be here was a band of wet silt a hand's width deep, painted, and
 * from the hero it read as a smear of mud between the sedge and the water — the
 * one part of the pond with no object in it and therefore the one part with no
 * scale. A shore does not fade from grass into water; it is the place where
 * everything too heavy to be carried away has ended up.
 *
 * So this is that: a belt of stone laid along `bankEdgeZ`, thickest right at
 * the water and thinning inland under the sedge. It rides the same lump
 * geometry and the same material the forest's clods do, because a rock and a
 * clod of earth differ in colour, in how much of them is buried and in how
 * round they are, and all three of those are already parameters here.
 *
 * Three things it has to get right, all of them about the band being a shore
 * rather than a line of pebbles someone laid out:
 *
 *  - Sizes spread hard. A shore graded to one size is aquarium gravel. A few
 *    big ones sitting proud carry the scale and the rest fill between them.
 *  - Position keyed to the waterline itself, which meanders — see bankEdgeZ —
 *    so the belt wanders with the shore instead of running straight across it.
 *  - The waterline crossed rather than respected. The stones nearest the water
 *    are half in it: the wet ones are what say where the edge is.
 */
export function scatterShoreRocks(count: number, seed = 771402): Litter {
  const rnd = makeRandom(seed);
  const base = lumpGeometry();

  const pos: number[] = [];
  const scale: number[] = [];
  const rot: number[] = [];
  const tone: number[] = [];

  for (let i = 0; i < count * 3 && pos.length < count * 3; i++) {
    const x = (rnd() * 2 - 1) * (BANK.halfWidth * 0.98);
    const edge = bankEdgeZ(x);
    /*
     * How far from the water this one lies.
     *
     * Skewed toward the water and allowed a little way into it. The power puts
     * most of the belt in the first few centimetres of shore, where a real one
     * is; the negative end is the stones standing in the shallows.
     */
    const off = -0.06 + Math.pow(rnd(), 1.7) * 0.62;
    const z = edge + off;
    // Past the sedge there is no shore, only bank, and a stone back there is a
    // stone nobody sees.
    if (z > edge + 0.62) continue;

    /*
     * Two populations, and the split is what stops this reading as gravel.
     * One rock in nine is a proper one — up to nine centimetres, sitting well
     * proud — and the rest are shingle packed around them.
     */
    const big = rnd() < 0.13;
    /*
     * The big ones are capped at six centimetres, not nine.
     *
     * The last act of this biome is shot from inside the sedge with the shore
     * about half a metre ahead, and at nine a single rock came out as a broad
     * flat slab filling a quarter of that frame — the same mistake the forest's
     * clods made at the same range, where a lump that is a clod at half a metre
     * is a slate at fifteen centimetres. Six still carries the scale against the
     * shingle and stops being furniture.
     */
    const s = big
      ? 0.026 + Math.pow(rnd(), 1.4) * 0.036
      : 0.006 + Math.pow(rnd(), 1.9) * 0.021;
    // Rounder than a clod of earth: this is stone that has been in water.
    const flat = 0.62 + rnd() * 0.3;
    const sy = s * flat;
    // The big ones sit up; the shingle is mostly buried, which is what makes
    // the belt read as a surface rather than as objects on one.
    const sunk = big ? 0.2 + rnd() * 0.25 : 0.45 + rnd() * 0.4;
    pos.push(x, SILT_Y + siltRelief(x, z) - sy * sunk, z);
    scale.push(s * (0.78 + rnd() * 0.6), sy, s * (0.78 + rnd() * 0.6));
    rot.push(rnd() * Math.PI * 2, (rnd() * 2 - 1) * 0.5);
    tone.push(0.2 + rnd() * 0.8);
  }

  const n = pos.length / 3;
  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", base.position);
  geo.setAttribute("normal", base.normal);
  geo.setAttribute("iPos", new InstancedBufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("iScale", new InstancedBufferAttribute(new Float32Array(scale), 3));
  geo.setAttribute("iRot", new InstancedBufferAttribute(new Float32Array(rot), 2));
  geo.setAttribute("iTone", new InstancedBufferAttribute(new Float32Array(tone), 1));
  geo.instanceCount = n;
  return { geometry: geo, count: n };
}

export const LITTER_VERT = /* glsl */ `
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
`;

export const LITTER_FRAG = /* glsl */ `
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
  // the facet points — a top stop for the faces the last of the light reaches
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
  // Grain, off the same fields the floor around it is drawn from — one at the
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
`;
