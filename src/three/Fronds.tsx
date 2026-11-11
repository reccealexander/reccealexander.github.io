import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";
import type { Biome } from "@/lib/biomes";
import { makeRandom } from "@/lib/math";
import { pointer } from "@/lib/pointer";
import { plantFronds } from "./field";
import { CLUMPS, quality, reducedMotion } from "./quality";
import { swayGrid } from "./swayGrid";
import { scrollState } from "@/lib/scroll";
import { GROWTH_GLSL, growth } from "./growth";
import { PART_GLSL, partedAt } from "./parting";
import { SUNLIGHT_GLSL, SUN_RAMP, SUN_STRENGTH } from "./sunlight";
import { withFog } from "./uniforms";

/**
 * The fern understory.
 *
 * A deciduous forest floor is not grass with the lights off, and recolouring
 * the meadow into one was the whole of what was wrong with it: a picker item
 * that says "ferns, litter, falling leaves" and draws lawn is a broken
 * control, whatever its palette. So this is the shape the 2D site draws —
 * a rachis with leaflets alternating off it, in three storeys, the tallest of
 * them woody enough to read as a small tree.
 *
 * It keeps the grass's rule exactly: instanced, one draw call, flat-filled
 * from the biome's own stops, and answering no light at all. A frond's colour
 * is decided when it is planted and never changes.
 *
 * All of the shape lives in the vertex shader rather than in the buffer. What
 * is stored is one canonical frond in parameter space — where along the rachis
 * each leaflet hangs, how far out along it each vertex sits — and the shader
 * evaluates the rachis curve, squares the leaflet off it and leans it toward
 * the tip. That is what lets one geometry be both a finely divided fern and a
 * woody thing with bare branch stubs, on a per-instance flag, instead of two
 * draws.
 *
 * The thing that costs nothing and buys the most is that a leaflet is not
 * obliged to lie in the plane the rachis sweeps. It used to: every part of
 * every frond sat on one bent ribbon, which is why two of them side by side
 * read as the same cut-out stamped twice. Now each leaflet carries an
 * out-of-plane offset as well as an in-plane one — it rolls about its own long
 * axis, dips or lifts off the rachis, and the rachis itself bows out of the
 * plane on the way up — so a frond has a near side and a far side and a fern
 * seen end-on is a comb rather than a line. Its size, its angle, its tone and
 * whether something has eaten it are all a hash of the leaflet's index against
 * the frond's own seed, so no two fronds carry the same set.
 */

/** Leaflets, alternating, so a frond is a fern and not a ladder. */
const PINNAE = 26;
/**
 * How much wider than its own silhouette a leaflet is built.
 *
 * The lobes along a fern pinnule are the difference between a plant and a piece
 * of cut paper, and at four rows across a leaflet there is nowhere in the buffer
 * to put them — ten rows would say it and would also be three times the
 * triangles across thirteen thousand instances. So the quad is built oversize
 * and the margin is cut back out of it in the fragment stage, where the detail
 * costs no triangles at any range and no arithmetic at the ranges that already
 * work: past a metre the profile flattens to `1 / MARGIN` and the leaflet is
 * exactly the shape it always was.
 */
const MARGIN = 1.3;
/** Rows across a leaflet: four is enough for a lens, three gives a diamond. */
const PINNA_T = [0, 0.36, 0.68, 1];
/** Rows up the bole. */
const BOLE_ROWS = 7;

/** Leaflet length at the widest point of the frond, in frond heights. */
const SPAN = 0.26;
/** Radians the leaflets lean toward the tip. */
const SWEEP = 0.46;
/** Leaflets above this far up the rachis catch the light. */
const LIT_FROM = 0.58;
/**
 * Where the foliage starts along a leaflet. Zero on a true fern, so the blade
 * runs right to the stem; a quarter of the way out on a woody one, which
 * leaves the inner stretch bare and reading as a branch.
 */
const LENS_WOODY = 0.28;

/**
 * One frond, in parameter space.
 *
 * `aFrond` is (s, t, w, side): how far up the rachis, how far out along the
 * leaflet, where across it, and which side of the rachis it hangs off.
 * `aNode` is (kind, index): 0 for the bole and 1 for a leaflet, and which
 * leaflet it is — the index is what every per-leaflet random is drawn from, so
 * a leaflet's own size and angle cost a buffer lane rather than a draw.
 */
function frondGeometry() {
  const verts: number[] = [];
  const nodes: number[] = [];
  const indices: number[] = [];

  // The bole, three columns wide so it can carry a lit sliver up the middle
  // the way a blade of grass does.
  for (let i = 0; i < BOLE_ROWS; i++) {
    const s = i / (BOLE_ROWS - 1);
    for (const w of [-1, 0, 1]) {
      verts.push(s, 0, w, 0);
      nodes.push(0, 0);
    }
  }
  for (let i = 0; i < BOLE_ROWS - 1; i++) {
    for (let c = 0; c < 2; c++) {
      const a = i * 3 + c;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    }
  }

  for (let k = 0; k < PINNAE; k++) {
    // The first leaflet hangs a tenth of the way up and the last a little
    // short of the tip, so the rachis has a stem below and a point above.
    const s = 0.1 + 0.86 * (k / (PINNAE - 1));
    const side = k % 2 ? 1 : -1;
    const base = verts.length / 4;
    for (const t of PINNA_T) {
      for (const w of [-1, 1]) {
        verts.push(s, t, w, side);
        nodes.push(1, k);
      }
    }
    for (let i = 0; i < PINNA_T.length - 1; i++) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geo = new InstancedBufferGeometry();
  geo.setAttribute("aFrond", new BufferAttribute(new Float32Array(verts), 4));
  geo.setAttribute("aNode", new BufferAttribute(new Float32Array(nodes), 2));
  geo.setIndex(indices);
  return geo;
}

const VERT = /* glsl */ `
attribute vec4  aFrond;    // s along the rachis, t along the leaflet, w across it, side
attribute vec2  aNode;     // 0 bole / 1 leaflet, and which leaflet

attribute vec3  iPos;
attribute vec4  iShape;    // height, facing, lean, rachis curve
attribute vec4  iStyle;    // tone, which lit stop, off-colour, phase
attribute vec4  iForm;     // woody, bole half-width, leaflet length, arch
attribute vec4  iVary;     // leaflet seed, tip curl, out-of-plane bow, how chewed
attribute vec4  iTrim;     // rachis shoulder, its wander, the V of the fan, twist
attribute vec2  iLay;      // how far it goes over for the camera, and which way

uniform float uTime;
uniform float uWind;
uniform float uPart;       // how far open the parting is, 0..1
uniform float uGrow;       // the biome changeover, 0..1
uniform sampler2D uSway;
uniform vec2  uSwayOrigin;
uniform float uSwayScale;
uniform float uSwayAmp;
uniform float uSun;        // how much of the pool this biome takes, 0..1

${PART_GLSL}
${GROWTH_GLSL}
${SUNLIGHT_GLSL}

varying float vTone;
varying float vLitB;
varying float vRare;
varying float vLit;
varying float vBole;
varying float vSpine;
varying float vUp;
varying float vWoody;
varying float vShade;
varying vec2  vLeaf;   // along the leaflet's foliage, and across it, signed
varying float vEdge;   // this leaflet's own seed, for its own margin
varying float vNear;   // 1 with the lens in it, 0 by a metre and a half
varying float vSun;    // the pool, read where this frond is rooted

#include <fog_pars_vertex>

/** One leaflet's worth of randomness, drawn off its index and its frond's seed. */
float pinnaRand(float k, float salt) {
  return fract(sin(k * 12.9898 + salt) * 43758.5453);
}

void main() {
  float h = iShape.x;
  // Coming up, on a biome change — see three/growth.ts. A frond's whole shape,
  // arch included, is solved as a multiple of its height, so scaling it here is
  // entire animation: a half-grown fern is a fern that has unrolled half way,
  // not a picture of one at half size.
  h *= growAt(uGrow, growStagger(iPos.xz));
  float facing = iShape.y;
  float curve = iShape.w;
  float woody = iForm.x;
  float kind = aNode.x;

  // The rachis: a quadratic from the root to the tip, bowed sideways by the
  // frond's own curve. Where the shoulder of that curve sits is a per-frond
  // number rather than a constant — a rachis whose control point is always at
  // the same height is the same arc every time, and the eye reads a field of
  // identical arcs as one shape repeated however differently they are turned.
  float s = aFrond.x;
  float is = 1.0 - s;
  vec2 ctrl = vec2(curve, iTrim.x);
  vec2 tip  = vec2(curve * 0.5, 1.0);
  vec2 b = 2.0 * is * s * ctrl + s * s * tip;
  vec2 g = normalize(2.0 * is * ctrl + 2.0 * s * (tip - ctrl));
  // ...and a slow S over the top of it, so the stem wanders the way a thing
  // that grew toward the light does rather than the way a spline does.
  b.x += iTrim.y * sin(s * 4.1 + iStyle.w) * s;

  // The rachis leaves the plane it sweeps as well as bending within it. This
  // is the offset out of that plane; the arch below carries it round with
  // everything else at this station.
  float q = iVary.z * s * (1.0 - s) * 4.0;

  vec2 p;
  if (kind < 0.5) {
    // A bole, tapering to a quarter of its root width. On a true fern the
    // same strip is the rachis, narrow enough to read as a rib but wide
    // enough that the leaflets are visibly hanging off something.
    float w = mix(0.0075, iForm.y, woody) * (1.0 - 0.76 * s);
    p = b + vec2(g.y, -g.x) * (w * aFrond.z);
    vSpine = 1.0 - abs(aFrond.z);
    vShade = 1.0;
    vLeaf = vec2(0.0);
    vEdge = 0.0;
  } else {
    float k = aNode.y;
    float seed = iVary.x;
    float r1 = pinnaRand(k * 1.31, seed);
    float r2 = pinnaRand(k * 2.77, seed * 1.7 + 41.0);
    float r3 = pinnaRand(k * 4.19, seed * 0.61 + 97.0);

    // Square the leaflet off the rachis, then lean it toward the tip — by its
    // own amount. Every leaflet on a real frond leaves the stem at a slightly
    // different angle, and it is that raggedness, not the outline, that stops
    // a row of them reading as a comb someone drew with a ruler.
    float side = aFrond.w;
    float sweep = ${SWEEP.toFixed(5)} + (r2 - 0.5) * 0.62 + s * 0.34;
    float cs = cos(sweep);
    float sn = sin(sweep);
    vec2 d = normalize(vec2(side * g.y * cs + g.x * sn, -side * g.x * cs + g.y * sn));

    // Widest around a third of the way up the frond and closing to nothing at
    // both ends, which is the outline a fern actually has — then this
    // leaflet's own length over the top of it. Some of them have been eaten:
    // a fifth of the length is a stub, and a frond with three stubs in it is
    // the only one in the stand you can pick out.
    float chew = mix(1.0, 0.22, step(r3, iVary.w));
    float len = ${SPAN.toFixed(5)} * sin(3.14159265 * pow(s, 0.55)) * iForm.z
              * (0.62 + 0.76 * r1) * chew;
    float t = aFrond.y;
    // Foliage from the lens point out to the tip; whatever is inboard of it
    // stays a twig, which on a woody frond is the branch stub.
    float lens = woody * ${LENS_WOODY.toFixed(5)};
    float fol = clamp((t - lens) / (1.0 - lens), 0.0, 1.0);
    // Built ${MARGIN.toFixed(2)}x wider than the leaflet is, because the margin is
    // cut back out of it in the fragment stage. A fern pinnule is lobed, not a
    // triangle, and the lobes are only worth anything within a metre of the
    // lens — carving them out of an oversized quad puts the whole of that
    // detail in the fragment stage, where it costs nothing at the ranges that
    // already work and no triangles at any range at all.
    float hw = len * (1.0 - lens) * ${(0.13 * MARGIN).toFixed(5)} * (4.0 * fol * (1.0 - fol))
             + 0.0016;
    vLeaf = vec2(fol, aFrond.z);
    vEdge = fract(r2 * 7.31 + k * 0.137);

    // The leaflet rolls about its own long axis, and the roll runs up the
    // frond as a twist. This is the whole of the depth: with it the width of a
    // leaflet is spent partly across the frond and partly out of it, so the
    // fan has a near face and a far one and catches the eye at every angle
    // instead of only broadside.
    float roll = (r3 - 0.5) * 1.7 + iTrim.w * s * side;
    vec2 axis = b + d * (t * len);
    p = axis + vec2(-d.y, d.x) * (hw * aFrond.z * cos(roll));
    q += hw * aFrond.z * sin(roll);

    // ...and it dips or lifts off the rachis along its own length. Opposite
    // leaflets go opposite ways by the frond's own amount, which is what puts
    // a V down the middle of a fern seen end on.
    q += (iTrim.z * side + (r1 - 0.5) * 0.5) * len * t * t;

    // The tip hooks up a little, the way a leaflet lifts off the rachis.
    p.y += len * 0.06 * t * t;
    vSpine = 0.0;
    // Tone inside one plant: the inner leaflets sit in the shade of the outer
    // ones, and no two of them are quite the same green anyway.
    vShade = (0.74 + 0.34 * r2) * mix(0.82, 1.06, t);
  }

  // Lean and wind, as a shear about the root that grows with height — the
  // grass expresses the same thing as an arc per blade, but a frond is a fan
  // of parts that all have to move together, and a shear does that in one
  // number instead of re-solving the curve.
  float gust = sin(uTime * 0.42 - iPos.z * 0.26 + iPos.x * 0.15);
  float flutter = sin(uTime * 1.5 + iStyle.w) * 0.4 + sin(uTime * 2.4 + iStyle.w * 1.7) * 0.18;
  // A woody stem answers the wind more slowly than a frond does.
  float give = mix(1.0, 0.42, woody);
  float shear = iShape.z + uWind * give * (0.13 * gust + 0.07 * flutter);
  vec2 sg = (iPos.xz - uSwayOrigin) * uSwayScale;
  shear += (texture2D(uSway, sg).r * 255.0 - 127.0) * uSwayAmp * give;

  // The arch, and the one thing a flat drawing of a fern never has to say. A
  // frond does not stand up: it leaves the crown vertical and tips further over
  // the further along it gets, so the tip hangs out sideways at head height and
  // the plant covers several times the ground its root does. Rotating each
  // station of the rachis rigidly about the crown, by an angle that grows with
  // how far up it is, is an arc — and it takes the leaflets hanging off that
  // station with it, so the fan stays a fan instead of shearing into a screw.
  //
  // The cubic on top of it is the last quarter going over harder than the rest
  // — a frond that has not finished unrolling, which is the shape that says
  // fern and nothing else. Clamped short of the vertical, because the rotation
  // is about the root and anything past it puts the tip underground.
  float ang = min(iForm.w * s + iVary.y * s * s * s, 1.48);
  float ca = cos(ang);
  float sa = sin(ang);
  vec3 local = vec3(
    (p.x + shear * p.y) * h,
    (p.y * ca - q * sa) * h,
    (p.y * sa + q * ca) * h);
  float sf = sin(facing);
  float cf = cos(facing);
  vec3 turned = vec3(cf * local.x + sf * local.z, local.y, -sf * local.x + cf * local.z);

  /*
   * The frond rooted against the glass.
   *
   * Laying over is the right answer for a plant standing in the corridor and no
   * answer at all for one standing in the lens: a fern half a metre across,
   * rooted ten centimetres away, covers a fifth of the frame whatever angle it
   * is at, and what it covers it with is one flat green with no edge in it. The
   * grass solved this at plant time with a carve; a forest floor cannot afford a
   * permanent hole, and in any case the fronds that ruin the last act are only
   * in the way for the few chapters the camera spends on the floor.
   *
   * So it is decided per frame, off the lens's own position, and the test is
   * how much of the frame the plant subtends rather than how close it is —
   * a nineteen-centimetre frond at twenty centimetres is a plant in the
   * foreground, and a ninety-centimetre one at the same distance is a wall.
   * Shrinking about the root rather than dropping it keeps it continuous: the
   * plant folds down into the litter as the camera arrives and grows back out
   * of it behind, which is at least a thing that could happen.
   */
  float bulk = h / max(distance(iPos, cameraPosition), 0.001);
  turned *= 1.0 - smoothstep(2.2, 4.2, bulk);

  // Laid down for the beats the camera needs the sight line, and standing the
  // rest of the time. A forest floor has no grass to fill a corridor of missing
  // fern, so this biome cannot afford the permanent carve the meadow used to
  // take — see three/parting.ts.
  /*
   * The pool, read at the root and not at the pixel — the same contract the
   * grass keeps. Where a plant is rooted is a fact about the plant, so the
   * whole of it takes one answer: it stands in the light or it stands beside
   * it. Reading it per fragment instead gives a gradient laid over the canopy
   * rather than a floor with light on it.
   */
  vSun = sunPool(iPos.xz) * uSun;

  vec3 world = layOver(turned, iLay.x * uPart, iLay.y) + iPos;

  vTone = iStyle.x;
  vLitB = iStyle.y;
  vRare = iStyle.z;
  // Where the light stops reaching is a fact about the plant, so it is one
  // frond's number rather than a line ruled at the same height across all of
  // them — a fixed threshold banded the whole stand at one altitude.
  float from = ${LIT_FROM.toFixed(5)} + (fract(iVary.x) - 0.5) * 0.3;
  vLit = smoothstep(from, from + 0.16, s) * kind;
  vBole = 1.0 - kind;
  vWoody = woody;
  vUp = clamp(local.y / h, 0.0, 1.0);

  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // How much of the close-range detail this fragment is entitled to. Past a
  // metre and a half a lobe on a leaflet is a subpixel, and a subpixel cut out
  // of a silhouette is not detail, it is a shimmer — so the margin flattens
  // back to the plain profile and the whole of the near-range branch below is
  // skipped for the acts that are already right.
  vNear = 1.0 - smoothstep(0.55, 1.5, -mvPosition.z);

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uBright;
uniform vec3 uLitA;
uniform vec3 uLitB;
uniform vec3 uRareCol;
uniform vec3 uBark;
uniform vec3 uBarkLit;
uniform vec3 uSunWarm;
uniform vec3 uSunFace;

varying float vTone;
varying float vLitB;
varying float vRare;
varying float vLit;
varying float vBole;
varying float vSpine;
varying float vUp;
varying float vWoody;
varying float vShade;
varying vec2  vLeaf;
varying float vEdge;
varying float vNear;
varying float vSun;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

void main() {
  float across = abs(vLeaf.y);
  // The plain profile: exactly the leaflet the buffer used to hold, recovered
  // by throwing away the margin the vertex stage was told to build oversize.
  float prof = ${(1 / MARGIN).toFixed(5)};
  float lobe = 0.0;

  if (vBole < 0.5 && vNear > 0.002) {
    /*
     * The margin.
     *
     * A fern pinnule is not an isoceles triangle: it is lobed along its whole
     * length, the lobes get shallower toward the tip, and no two leaflets on a
     * frond carry the same number of them. Two beats — one for the lobes and a
     * finer one riding on it for the crenulation between them — over a phase
     * that is this leaflet's own, so a row of them is a row of different
     * outlines rather than one stamped repeatedly.
     */
    float t = vLeaf.x;
    // Four to six lobes down a side, not two — at two the leaflet stops being
    // a fern and becomes a little oak leaf, which is a different plant and a
    // much worse one to have thirteen thousand of.
    float ph = t * (20.0 + vEdge * 14.0) + vEdge * 41.0;
    float big = 0.5 + 0.5 * cos(ph);
    float fine = 0.5 + 0.5 * cos(ph * 2.7 + 1.9);
    lobe = big * (0.72 + 0.28 * fine);
    // Shallower at the base, where the blade runs into the rachis, and at the
    // very tip, where there is no width left to cut into.
    float depth = 0.26 * smoothstep(0.0, 0.22, t) * (1.0 - 0.45 * t);
    float cut = ${(1 / MARGIN).toFixed(5)} + 0.22 * lobe - depth * (1.0 - lobe);

    // ...and something has been at it. One leaflet in six carries a bite out of
    // one edge — a hole in an outline is the single most convincing thing on a
    // leaf, and it is a hash and a smoothstep.
    float seg = floor(t * 3.0);
    float bh = fract(sin(seg * 17.31 + vEdge * 91.7) * 43758.5453);
    float side = step(0.5, fract(bh * 13.0)) * 2.0 - 1.0;
    float bite = step(0.83, bh) * step(0.0, side * vLeaf.y)
               * (1.0 - smoothstep(0.0, 0.34, abs(fract(t * 3.0) - 0.5)));
    cut -= bite * 0.72;

    prof = mix(prof, cut, vNear);
  }

  if (across > prof) discard;

  // Flat fill, one colour per frond, decided when it was planted — the same
  // model the grass uses and for the same reason.
  vec3 body = mix(mix(uDeep, uRareCol, vRare), uBright, vTone);
  vec3 lit = mix(uLitA, uLitB, vLitB);
  vec3 col = mix(body, lit, vLit * 0.55);
  // ...and then one colour per *leaflet*, which is the difference between a
  // plant and a silhouette filled in. A frond is not one green: the leaflets
  // out at the tip have the light on them, the ones tucked under the fan do
  // not, and the spread between them is what gives a single plant a form
  // without anything in the scene casting a shadow.
  col = mix(col, col * vShade, 1.0 - vBole);

  /*
   * ...and whether this fern is standing in a break in the canopy.
   *
   * The forest used to take none of the pool at all — SUN_STRENGTH.forest was
   * zero and every sun term in the scene folded out of it. That was defensible
   * while the pool was a meadow photograph's pool, and it is why the forest
   * floor read as one flat exposure from edge to edge: the one biome with an
   * actual canopy over it was the one biome with no gaps in the light.
   *
   * Same two stops as the grass, mixed by how far up its own ramp the plant
   * already sat, so the fronds planted dark under the fan stay the darker
   * plants inside the pool. A fern in a sunbreak is not a fern with a lamp on
   * it; it is a different green, and its neighbour in shade is still in shade.
   */
  float sunLit = smoothstep(0.0, 0.66, vSun) * (0.55 + 0.45 * vTone);
  col = mix(col, uSunWarm, sunLit * (1.0 - vBole * 0.55));
  col = mix(col, uSunFace, smoothstep(0.55, 1.0, vSun) * vTone * 0.45);

  /*
   * The two things a leaflet has that a polygon does not: a rib down it and an
   * underside.
   *
   * The rib is a fact about the plant and it is what the eye uses to tell a
   * leaflet lying across another leaflet from one big leaflet. The underside is
   * geometry, not a lamp — a leaf is a different colour on its back, and with
   * DoubleSide the shader is already told which face it is drawing. Between
   * them a fan of leaflets seen from underneath stops being one silhouette
   * filled in: half of them are showing you their backs.
   */
  if (vBole < 0.5) {
    float u = across / max(prof, 0.001);
    // Pale rib up the middle, and a dry margin gone dark at the edge. Both only
    // where the lens can see them.
    float rib = 1.0 - smoothstep(0.0, 0.19, u);
    float lip = smoothstep(0.62, 1.0, u);
    col *= mix(1.0, mix(1.0 + 0.16 * rib, 0.72, lip), vNear);
    // Laterals off the rib, at the angle they leave it, faint enough to be a
    // texture rather than a drawing.
    float lat = abs(fract(vLeaf.x * 26.0 - u * 3.1 + vEdge * 9.0) - 0.5) * 2.0;
    col *= 1.0 - 0.055 * vNear * (1.0 - smoothstep(0.0, 0.4, lat)) * smoothstep(0.1, 0.4, u);
    col *= gl_FrontFacing ? 1.0 : mix(0.9, 0.72, vNear);
  }

  // The stem. On a fern it is a rib and takes the frond's own colour gone
  // dark; on a woody one it is bark, with a sliver of light up the middle. A
  // bark colour lit on one edge would have to pick an edge, and every frond is
  // turned a different way; up the middle is the only choice that needs no lamp.
  vec3 stem = mix(mix(body, uDeep, 0.55), uBark, vWoody);
  stem = mix(stem, uBarkLit, smoothstep(0.55, 1.0, vSpine) * 0.7 * vWoody);
  col = mix(col, stem, vBole);

  // The bottom of a forest understory is in the shade of the rest of it.
  col *= mix(0.42, 1.0, smoothstep(0.0, 0.35, vUp));

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

export default function Fronds({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const calm = reducedMotion();
  const wind = calm ? 0.25 : 1;
  const spec = biome.fronds!;

  const sway = swayGrid();

  const geometry = useMemo(() => {
    // A frond is two hundred-odd vertices against a blade's sixteen, so the
    // field's clump budget buys well under half as many of them — which still
    // lands short of the meadow's triangle count, and an arched fern covers
    // several times the ground a grass clump does.
    const fronds = plantFronds(Math.round(CLUMPS[quality()] * 0.5), biome);
    const n = fronds.length;
    const geo = frondGeometry();
    // A second seeded pass over the same plants. Where three/field.ts decides
    // where a frond stands and how tall it is — facts the whole scene has to
    // agree on — these are facts about its shape that nothing outside this
    // file reads, so they are drawn here rather than widening the field's
    // record for them.
    const rnd = makeRandom(551207);

    const pos = new Float32Array(n * 3);
    const shape = new Float32Array(n * 4);
    const style = new Float32Array(n * 4);
    const form = new Float32Array(n * 4);
    const vary = new Float32Array(n * 4);
    const trim = new Float32Array(n * 4);
    const lay = new Float32Array(n * 2);

    fronds.forEach((f, i) => {
      lay[i * 2] = f.lay;
      lay[i * 2 + 1] = f.bearing;
      pos[i * 3] = f.x;
      pos[i * 3 + 1] = f.y;
      pos[i * 3 + 2] = f.z;
      shape[i * 4] = f.height;
      shape[i * 4 + 1] = f.facing;
      shape[i * 4 + 2] = f.lean;
      shape[i * 4 + 3] = f.curve;
      style[i * 4] = f.tone;
      style[i * 4 + 1] = f.litB;
      style[i * 4 + 2] = f.rare;
      style[i * 4 + 3] = f.phase;
      form[i * 4] = f.woody;
      form[i * 4 + 1] = f.trunk;
      form[i * 4 + 2] = f.pinna;
      form[i * 4 + 3] = f.arch;

      vary[i * 4] = rnd() * 90;
      // How far the last quarter goes over past the arch. A woody thing holds
      // its branches out; a fern is still unrolling, and one in six of them is
      // barely open at the tip at all.
      vary[i * 4 + 1] = f.woody
        ? rnd() * 0.12
        : (rnd() < 0.17 ? 0.5 : 0.06) + rnd() * 0.34;
      // Out of the plane the rachis sweeps, signed.
      vary[i * 4 + 2] = (rnd() * 2 - 1) * 0.075;
      // Something has been eating this one. Most plants lose the odd leaflet;
      // a few are half gone, and those are the ones that read as a stand of
      // plants rather than a pattern.
      vary[i * 4 + 3] = rnd() < 0.22 ? 0.1 + rnd() * 0.3 : rnd() * 0.05;

      // Where the shoulder of the rachis curve sits, how far it wanders off
      // it, how hard the two sides of the fan fold away from each other, and
      // how much the whole thing twists on the way up.
      trim[i * 4] = 0.4 + rnd() * 0.3;
      trim[i * 4 + 1] = (rnd() * 2 - 1) * 0.075;
      trim[i * 4 + 2] = (rnd() * 2 - 1) * 0.42;
      trim[i * 4 + 3] = (rnd() * 2 - 1) * 0.9;
    });

    geo.setAttribute("iPos", new InstancedBufferAttribute(pos, 3));
    geo.setAttribute("iShape", new InstancedBufferAttribute(shape, 4));
    geo.setAttribute("iStyle", new InstancedBufferAttribute(style, 4));
    geo.setAttribute("iForm", new InstancedBufferAttribute(form, 4));
    geo.setAttribute("iVary", new InstancedBufferAttribute(vary, 4));
    geo.setAttribute("iTrim", new InstancedBufferAttribute(trim, 4));
    geo.setAttribute("iLay", new InstancedBufferAttribute(lay, 2));
    geo.instanceCount = n;
    // Generated, so nothing can compute a useful bound for it.
    geo.boundingSphere = new Sphere(new Vector3(0, 0.4, -1.5), 16);
    return geo;
  }, [biome]);

  const uniforms = useMemo(
    () =>
      withFog({
        uTime: { value: 0 },
        uWind: { value: wind },
        uPart: { value: 0 },
        uSway: { value: sway.texture },
        uSwayOrigin: { value: sway.origin },
        uSwayScale: { value: sway.scale },
        uSwayAmp: { value: sway.amplitude },
        uGrow: { value: 1 },
        uSun: { value: SUN_STRENGTH[biome.id] ?? 0 },
        uSunWarm: { value: new Color(SUN_RAMP.warm) },
        uSunFace: { value: new Color(SUN_RAMP.face) },
        uDeep: { value: new Color(biome.deep) },
        uBright: { value: new Color(biome.bright) },
        uLitA: { value: new Color(biome.litA) },
        uLitB: { value: new Color(biome.litB) },
        uRareCol: { value: new Color(biome.rare) },
        uBark: { value: new Color(spec.bark[0]) },
        uBarkLit: { value: new Color(spec.bark[1]) },
      }),
    [biome, spec, wind, sway],
  );

  useFrame((_, dt) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value += dt;
    m.uniforms.uGrow.value = growth();
    m.uniforms.uPart.value = partedAt(scrollState.smooth);
    // Whichever of this and the grass is mounted steps the spring; a forest
    // has no grass, so it falls here.
    if (!calm && !spec.grass) sway.step(pointer, dt);
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={DoubleSide}
        fog
        dithering
      />
    </mesh>
  );
}
