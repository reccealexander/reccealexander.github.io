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
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Biome } from "@/lib/biomes";
import { highlight, nightness } from "@/lib/timeOfDay";
import { makeRandom } from "@/lib/math";
import { plantField } from "./field";
import { GROWTH_GLSL, growth } from "./growth";
import { CLEARING_GLSL, clearing } from "./clearing";
import { CLUMPS, quality, reducedMotion } from "./quality";
import { sunPool, SUN_RAMP, SUN_STRENGTH } from "./sunlight";
import {
  branchPart,
  budPart,
  leafPart,
  STALK_GLSL,
  type PartSink,
} from "./stalk";
import { swayGrid } from "./swayGrid";
import { withFog } from "./uniforms";

/**
 * The heads that make a superbloom a superbloom.
 *
 * A field in flower is not a lawn with flowers in it — at the front of the
 * frame the heads touch, and anything sparser reads as a garden. So they are
 * dense, the grass under them is cut short (see the biome's `grassScale`), and
 * each one is a poppy at the size a poppy is actually read at.
 *
 * Which is: four or five petals with daylight between them, cupped so the rims
 * stand off the throat, a small dark eye, and a stem. All four of those are
 * load-bearing. A rosette whose petals meet is one shape, and one shape at this
 * size is a sticker; the gaps are what make it five. The cup is what stops it
 * being a sticker seen edge-on. And the stem is what stops a field of them
 * being confetti hanging over grass — the hero camera looks down hard enough
 * that you see the ground each one is standing in.
 *
 * The stem is in the same geometry as the head rather than a second pass, so
 * this is still one draw call for thirteen thousand plants, and — more to the
 * point — the stem is drawn as the *same* arc the head rides, sampled along its
 * length instead of only at the tip. Everything that bends this field bends one
 * number, `k`: the ambient wind and the cursor's spring both land on it, so
 * neither a gust nor a hand can slide a bloom off the stalk it grew on.
 *
 * The stem is also not a flagpole. A poppy leans, it forks once, it carries a
 * leaf on the fork and very often a second bud at the end of it that has not
 * opened yet — and a superbloom without those unopened buds is the one thing
 * that gives away that this is a field of copies. Which of them a given plant
 * grew is decided per instance and folded away where it did not, so the branch,
 * the leaf and the bud cost thirty-two triangles of geometry and, on the three
 * plants in ten that grow none of them, nothing at all to rasterise. All of it
 * hangs off `onStalk` in stalk.ts, which is the only thing here allowed to say
 * where a vertex lands — see the note at the top of that file for why that is
 * what makes the plant impossible to shake apart.
 */

/** Which part of the plant a vertex belongs to. `position` means a different thing for each. */
const STEM = 0;
const PETAL = 1;
const EYE = 2;
const BRANCH = 3;
const LEAF = 4;
const BUD = 5;

/**
 * Rows up a petal. Two of the six are spent in the last fifth, which is the
 * only way the outer edge comes out round rather than as a cut-off hexagon.
 */
const PETAL_V = [0, 0.28, 0.56, 0.8, 0.93, 1];
/** Always built for five. A four-petal head folds the spare one into its throat. */
const PETAL_SLOTS = 5;
const STEM_SEGMENTS = 3;
const EYE_SIDES = 6;

/**
 * One branch and one leaf, against the meadow's two and three.
 *
 * There are twenty thousand of these against the wildflowers' few hundred, so
 * every row of vertices is paid for twenty thousand times: a poppy gets the
 * single fork that stops it being a flagpole and nothing else. Four lobes on
 * the bud rather than the meadow's five, and three rows up each — closed it is
 * four or five millimetres of green and a rounder one is detail nobody can
 * resolve, and open it is a small four-petal head, which half the poppies in
 * this field are anyway. Three rows is the floor, not a choice: a lobe is
 * pinched at the base and pointed at the tip, so with two rows it has no width
 * anywhere and the whole bud is an invisible sliver.
 */
const BUD_LOBES = 4;
const BUD_V = [0, 0.55, 1];
const LEAF_V = [0, 0.5, 1];

/**
 * How many flower colours a field carries, and how the field is divided between
 * them.
 *
 * Five rather than three. The biome has always listed five and the shader only
 * ever read the first three of them, which is how a superbloom described in its
 * own blurb as "poppies, and a little phacelia" came out with no phacelia in it
 * anywhere and two fifths of every frame in one ember red — the page's warmest
 * brand colour, used at wallpaper scale.
 *
 * The bands are uneven on purpose and they are the brightness budget as much as
 * the palette. Warm reds come to a little over half rather than three quarters;
 * the gold is a fifth, which is as much bright warm as a frame carrying the
 * hero's near-white type can take; and the lavender is the other fifth, which
 * is the one colour in the list that takes the mean *down* while adding a
 * species. `tone` is a plain roll per plant, so a band's width is its share.
 */
const HEAD_COLOURS = 5;
const BANDS = [0.26, 0.46, 0.68, 0.88];

function headGeometry() {
  const position: number[] = [];
  const uv: number[] = [];
  const part: number[] = [];
  const index: number[] = [];
  let next = 0;

  const push = (x: number, y: number, z: number, u: number, v: number, p: number) => {
    position.push(x, y, z);
    uv.push(u, v);
    part.push(p);
    return next++;
  };

  // Stem: two ribbons crossed at right angles. One flat ribbon vanishes the
  // moment you look along it, and this is the only thing holding the head off
  // the ground — the grass gets away with it because there are four of every
  // blade facing four different ways.
  for (let plane = 0; plane < 2; plane++) {
    const base = next;
    for (let i = 0; i <= STEM_SEGMENTS; i++) {
      const t = i / STEM_SEGMENTS;
      push(t, -1, plane, 0, t, STEM);
      push(t, 1, plane, 1, t, STEM);
    }
    for (let i = 0; i < STEM_SEGMENTS; i++) {
      const a = base + i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  // Petals: three columns wide, so each one has a spine to trough along and two
  // rims to lift. Two columns would give a flat blade and no cup at all.
  for (let p = 0; p < PETAL_SLOTS; p++) {
    const base = next;
    for (const v of PETAL_V) {
      for (let c = -1; c <= 1; c++) push(v, c, p, Math.abs(c), v, PETAL);
    }
    for (let i = 0; i < PETAL_V.length - 1; i++) {
      for (let c = 0; c < 2; c++) {
        const a = base + i * 3 + c;
        index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  }

  // The eye, which also caps the hole the petals leave where they part.
  const centre = push(0, 0, 0, 0, 0, EYE);
  for (let i = 0; i <= EYE_SIDES; i++) {
    const a = (i / EYE_SIDES) * Math.PI * 2;
    const v = push(Math.cos(a), Math.sin(a), 0, 1, 0, EYE);
    if (i > 0) index.push(centre, v - 1, v);
  }

  // The fork, its leaf, and what it is carrying. Slots, not plants: which of
  // them this instance actually grew is decided in the vertex shader.
  const sink: PartSink = { push, index };
  branchPart(sink, 0, BRANCH);
  leafPart(sink, 0, LEAF, LEAF_V);
  budPart(sink, BUD, BUD_LOBES, BUD_V);

  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute("aPart", new BufferAttribute(new Float32Array(part), 1));
  geo.setIndex(index);
  return geo;
}

const VERT = /* glsl */ `
#define TAU 6.283185307
#define LOBES ${BUD_LOBES.toFixed(1)}

attribute float aPart;     // 0 stem, 1 petal, 2 eye, 3 branch, 4 leaf, 5 the bud on it
attribute vec3  iPos;      // root
attribute vec3  iShape;    // height, radius, phase
attribute vec3  iTurn;     // spin, nod, how many petals
attribute vec4  iStalk;    // lean bearing, lean amount, fork bearing, fork length
attribute vec2  iBud;      // how open the second head is (under zero: none), how big
attribute float iTone;
attribute float iSun;      // how much of the pool is standing at its root

uniform float uTime;
uniform float uWind;
uniform float uGrow;       // the biome changeover, 0..1
uniform sampler2D uSway;   // the cursor spring, one texel per grid cell
uniform vec2  uSwayOrigin; // its near corner, in metres
uniform float uSwayScale;  // metres to 0..1 across it
uniform float uSwayAmp;    // what a full-scale texel decodes to

varying vec2  vUv;
varying float vTone;
varying float vPart;
varying float vOpen;
varying float vSun;

#include <fog_pars_vertex>

${STALK_GLSL}
${GROWTH_GLSL}
${CLEARING_GLSL}

void main() {
  /*
   * Coming up, on a biome change — see three/growth.ts.
   *
   * Height and head together, and this is the one family where that is not a
   * detail. Every part of this plant -- stalk, branch, leaf, bud, the head
   * itself -- is placed by onStalk as a fraction of the plant's height, so
   * scaling that height alone already carries all of them and nothing can come
   * off its stem. The head's own radius is separate, and left alone it would
   * put a full-sized open flower on a stem an inch high, which is not a plant
   * growing but a plant being winched up.
   */
  float grow = growAt(uGrow, growStagger(iPos.xz));
  // The opening clearing: gone back into the ground (three/clearing.ts).
  grow *= 1.0 - clearingCut(iPos.xz, iShape.x);
  float h = iShape.x * grow;
  float r = iShape.y * smoothstep(0.15, 1.0, grow);
  float phase = iShape.z;
  float petals = iTurn.z;
  float az = iStalk.x;
  float bow = iStalk.y;
  float saz = iStalk.z;
  // Where the fork leaves and where it gets to. Fixed heights on the stalk
  // rather than rolled per plant: the bearing and the length already stop a
  // field of these lining up, and this is twenty thousand plants' worth of
  // arithmetic to save.
  float len = iStalk.w * h;
  float t0 = 0.44;
  float t1 = 0.82;

  // One gust crossing the whole field plus this plant's own flutter — the same
  // two terms on the same frequencies as the grass in Grass.tsx, because a head
  // that answers a different wind reads as pasted onto the field rather than
  // standing in it. Stems are taller than the cut grass here, so they take a
  // little more of it.
  float gust = sin(uTime * 0.5 - iPos.z * 0.28 + iPos.x * 0.17);
  float flutter = sin(uTime * 1.9 + phase) * 0.45 + sin(uTime * 3.1 + phase * 1.7) * 0.2;
  float k = uWind * (0.2 * gust + 0.1 * flutter);

  // ...and the cursor, out of the same grid of springs the grass reads. A
  // poppy standing in this field and a blade standing beside it are the same
  // plant as far as a hand pushing through them is concerned, and a field
  // where the grass parts and the heads do not is a field of flowers pinned to
  // a moving backdrop. This one number is the whole plant's bend — the stem is
  // drawn as its arc sampled along the length and the head rides the tip — so
  // adding the cursor here bends the stalk and carries the bloom with it, and
  // there is no arrangement of the two that can take them apart.
  vec2 sg = (iPos.xz - uSwayOrigin) * uSwayScale;
  k += (texture2D(uSway, sg).r * 255.0 - 127.0) * uSwayAmp;

  vec3 p;
  vUv = uv;
  vOpen = 0.0;

  if (aPart < 0.5) {
    // The bend as an arc, at every point up the stem rather than only at the
    // tip: same expression the blades use, so the whole plant leans together.
    float t = position.x;
    float w = h * mix(0.030, 0.017, t);
    vec3 across = position.z < 0.5 ? vec3(w, 0.0, 0.0) : vec3(0.0, 0.0, w);
    p = onStalk(t, across * position.y, h, k, az, bow);
  } else if (aPart > 2.5) {
    // The fork and what is on it. Each works out how far up the stalk it sits
    // and how far off the axis, and hands both to onStalk — which is why a
    // gust cannot shake a bud off a branch any more than it can a head off a
    // stem.
    vec3 dir = vec3(sin(saz), 0.0, cos(saz));
    float t;
    vec3 off;

    if (aPart < 3.5) {
      float s = position.x;
      float c = position.y;
      vec2 ba = branchAt(s, t0, t1, len);
      float w = h * 0.018 * (1.0 - 0.45 * s) * step(0.0001, len);
      t = ba.x;
      off = dir * ba.y
          + vec3(cos(saz), 0.0, -sin(saz)) * (w * c)
          + vec3(0.0, w * 0.9 * (1.0 - abs(c)), 0.0);
      vUv = vec2(abs(c), s);
    } else if (aPart < 4.5) {
      // The leaf, halfway up the fork and hanging off the far side of it.
      float lv = position.x;
      float lu = position.y;
      vec2 ba = branchAt(0.5, t0, t1, len);
      float llen = len * 0.85;
      float wid = 0.34 * spanOf(lv, 0.6) * llen;
      t = ba.x;
      off = dir * ba.y + rotY(vec3(
        lu * wid,
        llen * (0.3 * lv - 0.78 * lv * lv) - 0.24 * lu * lu * wid,
        lv * llen
      ), saz + 0.7);
      vUv = vec2(abs(lu), lv);
    } else {
      // What the fork is holding: a tight green bud on most of them, and on a
      // few a second head half the size of the first. Same lobes either way —
      // see stalk.ts. This is the single thing that most stops a superbloom
      // reading as one poppy stamped out twenty thousand times, because a real
      // one is never all in flower on the same afternoon.
      float bv = position.x;
      float bu = position.y;
      float lobe = position.z;
      vec2 ba = branchAt(1.0, t0, t1, len);
      float open = iBud.x;
      float rad = iBud.y * r * step(0.0, open) * step(0.0001, len);
      float op = clamp(open, 0.0, 1.0);
      float swing = mix(0.12, 1.25, op) * bv;
      // How wide a lobe is is the other half of the same number as the swing,
      // because a sepal and a petal are not the same width. A lobe held at its
      // bud width and swung flat leaves daylight between it and its neighbours
      // all the way to the middle, and four of those is a four-pointed star.
      // Open, a lobe covers most of its own quarter of the turn; shut, it is a
      // narrow scale and the bud stays a spindle instead of swelling.
      float wid = mix(0.38, 0.82, op) * spanOf(bv, mix(0.75, 1.15, op));
      vec3 q = vec3(sin(swing) * bv, cos(swing) * bv, bu * wid) * rad;
      t = ba.x;
      off = dir * ba.y + rotY(q, lobe * (TAU / LOBES) + saz);
      vUv = vec2(abs(bu), bv);
      vOpen = open;
    }

    p = onStalk(t, stalkLean(off, t, az, bow), h, k, az, bow);
  } else {
    vec3 q;

    if (aPart < 1.5) {
      float v = position.x;         // 0 at the throat, 1 at the petal's edge
      float u = position.y;         // -1..1 across it
      float idx = position.z;

      // Fold the fifth petal away on a four-petal head. The remaining ones open
      // out to fill the circle on their own, since the slot is TAU/petals.
      float live = step(idx, petals - 1.0);

      // Three quarters of the slot, and the quarter that is left is the gap.
      // This one number is the difference between five petals and a blob at one
      // end, and five spider legs at the other.
      float span = (TAU / petals) * 0.375;
      // Narrow where it leaves the throat, widest at the shoulder, and cut back
      // again at the edge so the petal ends in a broad round rather than a point.
      float wide = (0.38 + 0.62 * smoothstep(0.0, 0.55, v)) * (1.0 - 0.6 * smoothstep(0.78, 1.0, v));
      float rad = mix(0.19, 1.0, v) * live;
      float ang = (idx / petals) * TAU + u * wide * span;
      // The cup: the whole bowl rises outward, and the two long edges rise off
      // the petal's own spine on top of that. Seen from overhead the second one
      // is what gives each petal a lit rim down both sides of a shaded trough.
      float cup = 0.42 * rad * rad + 0.34 * abs(u) * wide * rad;
      q = vec3(cos(ang) * rad, cup, sin(ang) * rad);
      vUv = vec2(abs(u), v);
    } else {
      // Domed a little, so the eye is a boss in the bottom of the cup and not a
      // hole punched in it.
      float rr = dot(position.xy, position.xy);
      q = vec3(position.x, 0.09 + 0.05 * (1.0 - rr), position.y) * vec3(0.23, 1.0, 0.23);
      vUv = vec2(sqrt(rr), 0.0);
    }

    // Nod first, then spin, so the tilt has a direction of its own; then the
    // way the stalk is standing, which keeps the head square to what it grew on
    // whether that is the lean it was born with or a hand pushing it over.
    q = rotY(rotX(q, iTurn.y), iTurn.x) * r;
    p = onStalk(1.0, stalkLean(q, 1.0, az, bow), h, k, az, bow);
  }

  p += iPos;

  vTone = iTone;
  vPart = aPart;
  vSun = iSun;

  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uBody[${HEAD_COLOURS}];
uniform vec3 uLit[${HEAD_COLOURS}];
uniform vec3 uEye;
uniform vec3 uStem;
uniform vec3 uLeaf;
uniform vec3 uSunWarm;
uniform float uNight;

varying vec2  vUv;
varying float vTone;
varying float vPart;
varying float vOpen;
varying float vSun;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

/**
 * Which of the field's colours this head is, and its sunlit twin.
 *
 * A ladder of comparisons rather than an index into the arrays, because a
 * dynamic index into a uniform array is not something GLSL ES 1.0 guarantees a
 * fragment shader can do, and a shader that links on the machine it was written
 * on and nowhere else is the worst kind of shader to ship in a scene that fails
 * to black.
 *
 * The shares are deliberately uneven — see the biome's own note.
 */
void headColour(float t, out vec3 body, out vec3 lit) {
${BANDS.map(
  (b, i) =>
    `  ${i === 0 ? "" : "else "}if (t < ${b.toFixed(3)}) { body = uBody[${i}]; lit = uLit[${i}]; }`,
).join("\n")}
  else { body = uBody[${HEAD_COLOURS - 1}]; lit = uLit[${HEAD_COLOURS - 1}]; }
}

void main() {
  float glowKey = 0.0;
  vec3 col;

  if (vPart > 2.5) {
    // Foliage, and the one flower colour it is allowed: the tip of a bud. A
    // field of twenty thousand plants is where a percent on the mean shows up
    // and the hero type sits on the mean, so the branch and the leaf are
    // pitched under the grass they stand in rather than over it.
    // Nothing here is allowed above its own base colour, only below it: the
    // ramps run from 1 downward rather than from something over 1. Twenty
    // thousand plants' worth of foliage lifted by a sixth put two percent on
    // the frame mean the first time this was measured, which is two percent the
    // hero type does not have.
    if (vPart < 3.5) {
      col = uStem * (0.72 + 0.28 * (1.0 - vUv.x));
    } else if (vPart < 4.5) {
      col = uLeaf * mix(1.0, 0.6, smoothstep(0.1, 0.9, vUv.x));
      col *= mix(0.6, 1.0, smoothstep(0.0, 0.45, vUv.y));
    } else {
      vec3 body, unused;
      headColour(vTone, body, unused);
      col = mix(uLeaf, body, smoothstep(0.15, 0.72, vOpen));
      col *= mix(0.7, 1.0, smoothstep(0.1, 0.9, vUv.y));
      // A shut bud still breaks colour at the tip. Without it a closed poppy
      // bud is a green pin standing in green, which costs its triangles and
      // says nothing.
      col = mix(col, body, 0.3 * smoothstep(0.68, 1.0, vUv.y) * (1.0 - smoothstep(0.15, 0.5, vOpen)));
      // An open bud carries the flower's colour, so it glows with the flowers.
      col += body * uNight * 0.3 * smoothstep(0.3, 0.8, vOpen);
      glowKey = uNight * 0.55 * smoothstep(0.3, 0.8, vOpen);
    }
  } else if (vPart < 0.5) {
    // The foot of the stem is down in the shade of the grass it came through,
    // same ramp the blades use on their own roots.
    col = uStem * mix(0.5, 1.0, smoothstep(0.0, 0.5, vUv.y));
  } else if (vPart < 1.5) {
    // Three colours in the patch, picked per head — one flower colour repeated
    // across a whole field reads as printed fabric. Each has a sunlit twin,
    // which is the only lighting there is: no term answers a lamp, the rim is
    // simply painted a different colour from the throat the way it is on the
    // 2D site.
    vec3 body, lit;
    headColour(vTone, body, lit);

    // Down into the throat, and down again along the petal's own spine — the
    // trough has to be darker than the two rims either side of it or the cup
    // simply is not there when you are looking straight down into it, which is
    // most of the time on this camera.
    col = body * mix(0.42, 1.0, smoothstep(0.0, 0.34, vUv.y));
    // The trough runs out before the edge does. Carried all the way to the tip
    // it splits the petal down the middle and the flower reads as twice as many
    // half-petals as it has.
    float valley = (1.0 - smoothstep(0.0, 0.55, vUv.x)) * (1.0 - smoothstep(0.5, 0.92, vUv.y));
    col *= mix(1.0, 0.78, valley);
    // And the lifted edges, feathered off the spine and off the throat. Kept
    // well under half: a field of thirteen thousand of these averages out to
    // whatever this number is, and the hero type has to sit on the average.
    float rim = smoothstep(0.34, 0.98, vUv.x) * smoothstep(0.1, 0.42, vUv.y);
    col = mix(col, lit, rim * 0.55);

    /*
     * ...and the pool, on the flower itself.
     *
     * A head standing in the sun used to be the one thing in the superbloom
     * that ignored it. Its stem brightened and its leaves brightened and the
     * poppy on top of them did not, so the pool read as a light that stopped at
     * the foliage — most obvious where a pool's edge crosses a dense patch and
     * a line of heads sits at two different exposures on the same stalk colour.
     *
     * It does not take uSunWarm the way foliage does. That stop is the
     * grass's lit green, and mixing a red poppy toward it makes a duller poppy,
     * which is the reasoning that left this out in the first place — correct
     * about the colour and wrong about the conclusion. What it takes instead is
     * more of its *own* sunlit twin, the colour already painted on its rim two
     * lines up. In the open the whole petal goes most of the way to the colour
     * its lit edge is, which is what a flower in sun actually does, and the rim
     * stays ahead of it because it is mixed on top.
     */
    col = mix(col, mix(col, lit, 0.72), smoothstep(0.0, 0.62, vSun));
    // After dark, its own light: the sunlit colour added on top, and the
    // alpha lowered so the time-of-day grade leaves it bright (see
    // three/TimeGrade.tsx). Nothing else on the plant glows.
    // Kept in hand: there are thousands of these, and at full strength a
    // superbloom at night is a sheet of paint, not a field of flowers.
    col += lit * uNight * 0.4;
    glowKey = uNight * 0.75;
  } else {
    col = mix(uEye, uEye * 1.6, smoothstep(0.55, 1.0, vUv.x));
  }

  /*
   * ...and whether the rest of this plant is standing in the sun.
   *
   * Foliage takes the grass's own lit stop, because a stem and a leaf are
   * field. The petals took nothing at all until recently and now take their own
   * sunlit twin, up in the branch that paints them — see the note there. The
   * eye at the centre is left out of both: it is the one part of a poppy that
   * is genuinely in shadow whatever the sky is doing.
   */
  if (vPart < 0.5 || vPart > 2.5) {
    col = mix(col, mix(col, uSunWarm, 0.55), smoothstep(0.0, 0.62, vSun));
  }

  gl_FragColor = vec4(col, 1.0 - glowKey);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

/**
 * The sunlit twin of a flower colour. Derived rather than given, because the
 * biome names the flowers and not their rims — worked in sRGB so a dark red
 * lifts by as much as a gold does, which is not true of the linear working
 * space. The small hue push is toward the light, not toward yellow generally.
 */
function sunlit(hex: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(hsl, SRGBColorSpace);
  return new Color().setHSL(
    hsl.h + 0.015,
    Math.min(1, hsl.s * 0.9),
    Math.min(1, hsl.l + 0.17),
    SRGBColorSpace,
  );
}

export default function Heads({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const wind = reducedMotion() ? 0.25 : 1;
  const sway = swayGrid();

  const geometry = useMemo(() => {
    if (!biome.heads) return null;
    const { heads } = plantField(CLUMPS[quality()], biome);
    const n = heads.length;
    if (n === 0) return null;

    const geo = headGeometry();
    const pos = new Float32Array(n * 3);
    const shape = new Float32Array(n * 3);
    const turn = new Float32Array(n * 3);
    const stalk = new Float32Array(n * 4);
    const bud = new Float32Array(n * 2);
    const tone = new Float32Array(n);
    const sun = new Float32Array(n);
    // Zero on every biome that grows heads, so the field is never read at all
    // there — twenty thousand evaluations of a function that is about to be
    // multiplied by nothing.
    const sunOn = SUN_STRENGTH[biome.id] ?? 0;
    // A head's spin and nod are its own business and nothing else needs them,
    // so they are rolled here rather than carried through the planting. The
    // same goes for how it grew — the lean, the fork and what is on the end of
    // it are the plant's shape and not the field's.
    const rnd = makeRandom(70413);

    heads.forEach((h, i) => {
      pos[i * 3] = h.x;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = h.z;
      shape[i * 3] = h.height;
      shape[i * 3 + 1] = h.radius;
      shape[i * 3 + 2] = h.phase;
      turn[i * 3] = rnd() * Math.PI * 2;
      // Enough of a nod to break the row of identical faces the camera is
      // looking down on, not enough to close the face up at that angle.
      turn[i * 3 + 1] = 0.06 + rnd() * 0.3;
      turn[i * 3 + 2] = rnd() < 0.5 ? 4 : 5;
      tone[i] = h.tone;
      sun[i] = sunOn > 0 ? sunPool(h.x, h.z) * sunOn : 0;

      stalk[i * 4] = rnd() * Math.PI * 2;
      // Most of a poppy field is standing more or less up and a fifth of it is
      // over at a proper angle. Squaring the roll is what gives that: a
      // uniform lean puts every plant at the same jaunty tilt, which is a
      // second die rather than no die.
      stalk[i * 4 + 1] = 0.02 + 0.24 * rnd() ** 2.2;
      stalk[i * 4 + 2] = rnd() * Math.PI * 2;
      // Seven in ten fork. The rest keep the single stem they always had, and
      // their branch, leaf and bud collapse onto the stalk — thirty-two
      // triangles of geometry that never reach the rasteriser.
      //
      // A tenth to a fifth of the plant's height and no more. The three acts
      // shot from down among these keep a corridor clear between the lens and
      // the flower, and the planting checks that corridor against where a stem
      // is *rooted* — so a fork long enough to reach out of the ground its own
      // plant was cleared for is a fork that can put a leaf across the shot the
      // whole act depends on.
      const forked = rnd() < 0.7;
      stalk[i * 4 + 3] = forked ? 0.11 + rnd() * 0.09 : 0;
      // ...and of those, nearly all are still in bud. One plant in fourteen
      // carries a second head that has actually opened, and that number is a
      // brightness budget as much as a botanical one: a small open head is a
      // seventh flower colour in a frame that already has twenty thousand, and
      // at one in five they measurably lifted the mean the hero type sits on.
      // Buds cost nothing — they are green.
      const carrying = rnd();
      bud[i * 2] =
        !forked || carrying > 0.82 ? -1 : carrying < 0.72 ? 0.02 + rnd() * 0.12 : 0.55 + rnd() * 0.45;
      bud[i * 2 + 1] = 0.38 + rnd() * 0.22;
    });

    geo.setAttribute("iPos", new InstancedBufferAttribute(pos, 3));
    geo.setAttribute("iShape", new InstancedBufferAttribute(shape, 3));
    geo.setAttribute("iTurn", new InstancedBufferAttribute(turn, 3));
    geo.setAttribute("iStalk", new InstancedBufferAttribute(stalk, 4));
    geo.setAttribute("iBud", new InstancedBufferAttribute(bud, 2));
    geo.setAttribute("iTone", new InstancedBufferAttribute(tone, 1));
    geo.setAttribute("iSun", new InstancedBufferAttribute(sun, 1));
    geo.instanceCount = n;
    geo.boundingSphere = new Sphere(new Vector3(0, 0.3, -1.5), 24);
    return geo;
  }, [biome]);

  const uniforms = useMemo(() => {
    const c = biome.heads?.colors ?? ["#e0562f"];
    const at = (i: number) => c[i % c.length];
    return withFog({
      uTime: { value: 0 },
      uWind: { value: wind },
      uSway: { value: sway.texture },
      uSwayOrigin: { value: sway.origin },
      uSwayScale: { value: sway.scale },
      uSwayAmp: { value: sway.amplitude },
      uGrow: { value: 1 },
      uClearOpen: { value: 0 },
      uClearK: { value: 0 },
      uClearZ: { value: 0 },
      uClearHZ: { value: 0 },
      uNight: { value: 0 },
      // The whole list, not the first three of it. A shader that reads fewer
      // colours than the biome names is a biome with colours nobody can see.
      uBody: { value: Array.from({ length: HEAD_COLOURS }, (_, i) => new Color(at(i))) },
      uLit: { value: Array.from({ length: HEAD_COLOURS }, (_, i) => sunlit(at(i))) },
      uSunWarm: { value: new Color(SUN_RAMP.warm) },
      uEye: { value: new Color(biome.heads?.eye ?? "#2a1608") },
      // Stems belong to the field, not to the flower, so they are mixed out of
      // the grass ramp rather than given a green of their own. Leaves come off
      // the dark end of the same ramp: they are the part of the plant standing
      // in the shade of its own head, and there are twenty thousand of them.
      uStem: { value: new Color(biome.bright).lerp(new Color(biome.deep), 0.3) },
      uLeaf: { value: new Color(biome.deep).multiplyScalar(0.86) },
    });
  }, [biome, wind, sway]);

  useFrame((_, dt) => {
    if (!material.current) return;
    material.current.uniforms.uTime.value += dt;
    material.current.uniforms.uGrow.value = growth();
    material.current.uniforms.uClearOpen.value = clearing.open;
    material.current.uniforms.uClearK.value = clearing.k;
    material.current.uniforms.uClearZ.value = clearing.z;
    material.current.uniforms.uClearHZ.value = clearing.hz;
    material.current.uniforms.uNight.value = nightness();
    highlight("warm", material.current.uniforms.uSunWarm.value);
  });

  if (!geometry) return null;

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
