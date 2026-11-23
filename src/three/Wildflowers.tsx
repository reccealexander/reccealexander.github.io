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
import { plantWildflowers } from "./field";
import { GROWTH_GLSL, growth } from "./growth";
import { CLEARING_GLSL, clearing } from "./clearing";
import { quality, reducedMotion } from "./quality";
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
 * The wildflowers standing in the meadow.
 *
 * The DOM site plants five species across its hero in patches — cream, gold,
 * warm orange, a violet and a cornflower blue — and they are most of what stops
 * that field reading as a lawn. This is that planting brought over, with the
 * two things that do not survive the move dropped: they are not hoverable, and
 * they are not drawn in the DOM. What they keep is the part that matters, which
 * is that they grow in stands. Where the stands are, and why they are stands
 * rather than a scatter, is `plantWildflowers` in field.ts.
 *
 * The convention is the field's, not the flower's: flat fill in one colour
 * decided when the plant is sown, a second flat colour painted on the rim, and
 * no term anywhere that answers a light. A wildflower shaded photographically
 * beside a blade of grass that is not would be the one thing in the frame
 * saying this scene was rendered.
 *
 * Head and stem are one geometry and one draw, riding one arc — the same
 * arrangement as the superbloom's poppies, for the same reason: whatever bends
 * this field, wind or cursor, bends the whole plant or none of it.
 *
 * What is on that stalk is the rest of the plant. A bare vertical stick with a
 * disc on top is not what a meadow flower looks like from anywhere, and at hero
 * scale it read as exactly what it was: the stand had one silhouette repeated
 * three hundred times. So the stalk leans, it puts one or two branches out, it
 * carries leaves on them and one low down, and two in three hold a second head
 * at the end of a branch — open on some, still a tight bud on others. That last
 * one is doing most of the work, because two heads at two heights on one plant
 * is the thing you cannot get by scattering more single stems.
 *
 * All of it goes through `onStalk` in stalk.ts, which is the only function here
 * allowed to decide where a vertex ends up. See the note at the top of that
 * file: a branch given an offset of zero is on the axis by construction, and a
 * leaf placed against the branch moves with it, so no amount of bend can take
 * the plant apart.
 */

/** Which part of the plant a vertex belongs to. `position` means a different thing for each. */
const STEM = 0;
const PETAL = 1;
const EYE = 2;
const BRANCH = 3;
const LEAF = 4;
const BUD = 5;

/** Rows up a petal, with two of them spent in the last fifth so the end is round. */
const PETAL_V = [0, 0.3, 0.6, 0.84, 1];
/**
 * Always built for eight. Anything with fewer folds the spare slots into its
 * throat, which is what lets a five-petal poppy and an eight-ray cornflower be
 * the same instanced geometry.
 */
const PETAL_SLOTS = 8;
const STEM_SEGMENTS = 3;
const EYE_SIDES = 7;

/**
 * Two branches, and three leaves: one on each branch and one low on the stalk
 * itself. A plant that carries only one branch folds the spare one and its leaf
 * away into the stem — the geometry is the same for every instance because
 * there is one draw call, so "some plants have two branches" is a slot that
 * collapses rather than a second mesh.
 */
const SPRIGS = 2;
const LEAVES = 3;
/**
 * Rows up a leaf and up a bud lobe. Both are pointed at the far end.
 *
 * The leaf's rows are bunched low and its width profile (`spanOf` below) is
 * biased to match, so it comes out lanceolate — near its full width for most of
 * its length and drawn to a point. Spread evenly it was a triangular flag with
 * a hard cut across the base, which at hero scale reads as a dark shard lying
 * across the stem rather than as something growing off it.
 */
const LEAF_V = [0, 0.28, 0.62, 1];
const BUD_V = [0, 0.4, 0.75, 1];
const BUD_LOBES = 5;

function plantGeometry() {
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

  // Stem: two ribbons crossed at right angles, so it keeps a silhouette from
  // every bearing. A single flat ribbon vanishes the moment you look along it,
  // and this is the only thing holding the head off the ground.
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
  // rims to lift.
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

  // The branches, their leaves, and whatever the first branch is carrying. Each
  // one is a slot with an index in `position.z`; which of them a given plant
  // actually grows is decided per instance in the vertex shader.
  const sink: PartSink = { push, index };
  for (let j = 0; j < SPRIGS; j++) branchPart(sink, j, BRANCH);
  for (let l = 0; l < LEAVES; l++) leafPart(sink, l, LEAF, LEAF_V);
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
#define SPRIGS ${SPRIGS.toFixed(1)}

attribute float aPart;     // 0 stem, 1 petal, 2 eye, 3 branch, 4 leaf, 5 the second head
attribute vec3  iPos;      // root, on the soil
attribute vec4  iShape;    // height, head radius, phase, eye size
attribute vec4  iTurn;     // spin, nod, petal count, petal width
attribute vec4  iStalk;    // which way it leans and how far, branch bearing, branches
attribute vec3  iCarry;    // how open the second head is, how big, how vigorous the plant
attribute vec3  iBody;
attribute vec3  iLit;
attribute vec3  iEye;
attribute float iSun;      // how much of the pool is standing at its root

uniform float uTime;
uniform float uWind;
uniform float uGrow;       // the biome changeover, 0..1
uniform sampler2D uSway;   // the cursor spring, one texel per grid cell
uniform vec2  uSwayOrigin; // its near corner, in metres
uniform float uSwayScale;  // metres to 0..1 across it
uniform float uSwayAmp;    // what a full-scale texel decodes to

varying vec2  vUv;
varying float vPart;
varying float vOpen;
varying float vSun;
varying vec3  vBody;
varying vec3  vLit;
varying vec3  vEye;

#include <fog_pars_vertex>

${STALK_GLSL}
${GROWTH_GLSL}
${CLEARING_GLSL}

/**
 * One branch's shape, from its index alone.
 *
 * Derived rather than carried per branch: two numbers a plant already has —
 * where its first branch points and how vigorous it is — are enough to keep a
 * stand from looking combed, and nobody is ever going to want to author an
 * individual branch. The second one leaves higher up, points a third of a turn
 * away and is shorter, which is what a plant that put out one branch and then
 * another actually looks like.
 *
 * Both of them fork high and finish just under the main head, which is not
 * where a botanist would put them and is the only place they are any use here.
 * These plants clear the canopy by a couple of centimetres and no more — a
 * branch leaving at a third of the way up ends its second head down inside the
 * grass, where the whole of it, and the reason for it, is invisible.
 */
void sprig(float j, float h, float base, float vig,
           out float t0, out float t1, out float len, out float az) {
  t0 = 0.48 + 0.14 * j + 0.07 * sin(base * 3.1 + j * 2.7);
  t1 = min(0.95, t0 + 0.42 - 0.08 * j);
  az = base + j * 2.39996 + 0.35 * sin(base * 5.0 + j);
  len = h * (0.22 - 0.05 * j) * (0.65 + 0.7 * vig);
}

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
  float base = iStalk.z;
  float sprigs = iStalk.w;
  float vig = iCarry.z;

  // The same two terms on the same frequencies as the blades in Grass.tsx — a
  // flower answering a different wind from the grass it is standing in reads as
  // pasted onto the field. A little more of it than a blade takes, because it
  // is standing a head above the canopy where the air is.
  float gust = sin(uTime * 0.5 - iPos.z * 0.28 + iPos.x * 0.17);
  float flutter = sin(uTime * 1.9 + phase) * 0.45 + sin(uTime * 3.1 + phase * 1.7) * 0.2;
  float k = uWind * (0.19 * gust + 0.1 * flutter);

  vec2 sg = (iPos.xz - uSwayOrigin) * uSwayScale;
  k += (texture2D(uSway, sg).r * 255.0 - 127.0) * uSwayAmp;

  vec3 p;
  vUv = uv;
  vOpen = 0.0;

  if (aPart < 0.5) {
    // The bend as an arc at every point up the stem rather than only at its
    // tip: the same expression the blades use, so the whole plant leans as one
    // thing and the head cannot leave the stalk.
    float t = position.x;
    float w = h * mix(0.019, 0.010, t);
    vec3 across = position.z < 0.5 ? vec3(w, 0.0, 0.0) : vec3(0.0, 0.0, w);
    p = onStalk(t, across * position.y, h, k, az, bow);
  } else if (aPart > 2.5) {
    // Everything hanging off the stalk. Each of these works out where up the
    // stalk it belongs and how far off the axis, and hands both to onStalk —
    // which is why none of them can be shaken loose.
    float t;
    vec3 off;

    if (aPart < 3.5) {
      // A branch, as a channelled ribbon along the arc it leaves the stem on.
      float s = position.x;
      float c = position.y;
      float j = position.z;
      float t0, t1, len, saz;
      sprig(j, h, base, vig, t0, t1, len, saz);
      // The plant only grew so many. The rest lose their width and their reach
      // and collapse onto the stalk — a handful of degenerate triangles the
      // rasteriser throws away, and no second draw call.
      float live = step(j, sprigs - 0.5);
      len *= live;
      vec2 ba = branchAt(s, t0, t1, len);
      float w = h * 0.0115 * (1.0 - 0.5 * s) * live;
      t = ba.x;
      off = vec3(sin(saz), 0.0, cos(saz)) * ba.y
          + vec3(cos(saz), 0.0, -sin(saz)) * (w * c)
          + vec3(0.0, w * 0.9 * (1.0 - abs(c)), 0.0);
      vUv = vec2(abs(c), s);
    } else if (aPart < 4.5) {
      // A leaf. The first two ride halfway along their branch; the last one is
      // low on the stalk itself, which is where a meadow flower's leaves
      // actually are and is also what stops the bottom of the stem being a
      // bare line running down into the grass.
      float lv = position.x;
      float lu = position.y;
      float l = position.z;
      float laz;
      float len;
      vec3 anchor;
      if (l < SPRIGS - 0.5) {
        float t0, t1, blen, saz;
        sprig(l, h, base, vig, t0, t1, blen, saz);
        float live = step(l, sprigs - 0.5);
        vec2 ba = branchAt(0.52, t0, t1, blen * live);
        t = ba.x;
        anchor = vec3(sin(saz), 0.0, cos(saz)) * ba.y;
        laz = saz + 0.6;
        len = h * 0.19 * (0.6 + 0.8 * vig) * live;
      } else {
        t = 0.15;
        anchor = vec3(0.0);
        laz = base + 3.9;
        len = h * 0.26 * (0.7 + 0.6 * vig);
      }
      // Pointed at the tip, arching up and then over, and channelled along its
      // own spine so it never goes edge-on to nothing. The bias is what decides
      // where the widest part sits — at 0.62 it was a third of the way up, so
      // the leaf flared straight out of the stem and read as a wedge. Near 1 it
      // is at the middle, with margins that stay nearly parallel between the
      // two rows in between, which is a leaf.
      float wid = 0.34 * spanOf(lv, 0.9) * len;
      off = anchor + rotY(vec3(
        lu * wid,
        len * (0.34 * lv - 0.7 * lv * lv) - 0.24 * lu * lu * wid,
        lv * len
      ), laz);
      vUv = vec2(abs(lu), lv);
    } else {
      // The second head, at the end of the first branch — a tight green bud on
      // some plants and a smaller open flower on others, because that is the
      // one number between them. See stalk.ts.
      float bv = position.x;
      float bu = position.y;
      float lobe = position.z;
      float t0, t1, blen, saz;
      sprig(0.0, h, base, vig, t0, t1, blen, saz);
      vec2 ba = branchAt(1.0, t0, t1, blen);
      float open = iCarry.x;
      float rad = iCarry.y * r * step(0.0, open);
      float op = clamp(open, 0.0, 1.0);
      // Lobes near-vertical and touching is a bud; swung out is a small head.
      float swing = mix(0.10, 1.3, op) * bv;
      // How wide a lobe is is the other half of that one number, and it has to
      // be, because a sepal and a petal are not the same width. Held at the
      // bud's width all the way open, five lobes swung flat leave daylight
      // between them all the way to the middle and the thing reads as a
      // five-pointed star — which is what it was doing. Open, a lobe spans most
      // of its own fifth of the turn; shut, it is a narrow scale and the bud
      // stays a spindle rather than swelling into a ball.
      float wid = mix(0.32, 0.72, op) * spanOf(bv, mix(0.7, 1.15, op));
      vec3 q = vec3(sin(swing) * bv, cos(swing) * bv, bu * wid) * rad;
      t = ba.x;
      off = vec3(sin(saz), 0.0, cos(saz)) * ba.y + rotY(q, lobe * (TAU / LOBES) + saz);
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

      // Fold the unused slots away. The live ones open out to fill the circle
      // on their own, since the slot is TAU/petals.
      float live = step(idx, petals - 1.0);

      float span = (TAU / petals) * iTurn.w;
      // Narrow leaving the throat, widest at the shoulder, cut back at the edge
      // so it ends in a round rather than a point.
      float wide = (0.36 + 0.64 * smoothstep(0.0, 0.55, v)) * (1.0 - 0.55 * smoothstep(0.8, 1.0, v));
      float rad = mix(0.17, 1.0, v) * live;
      float ang = (idx / petals) * TAU + u * wide * span;
      // The cup: the bowl rises outward, and the long edges rise off the
      // petal's own spine on top of that.
      float cup = 0.36 * rad * rad + 0.3 * abs(u) * wide * rad;
      q = vec3(cos(ang) * rad, cup, sin(ang) * rad);
      vUv = vec2(abs(u), v);
    } else {
      float rr = dot(position.xy, position.xy);
      q = vec3(position.x, 0.1 + 0.05 * (1.0 - rr), position.y) * vec3(iShape.w, 1.0, iShape.w);
      vUv = vec2(sqrt(rr), 0.0);
    }

    // Nod first, then spin, so the tilt has a bearing of its own; then the way
    // the stalk itself is standing, which keeps the head square to what it grew
    // on whether that is a lean it was born with or a hand pushing it over.
    q = rotY(rotX(q, iTurn.y), iTurn.x) * r;
    p = onStalk(1.0, stalkLean(q, 1.0, az, bow), h, k, az, bow);
  }

  p += iPos;

  vPart = aPart;
  vSun = iSun;
  vBody = iBody;
  vLit = iLit;
  vEye = iEye;

  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uStem;
uniform vec3 uLeaf;
uniform vec3 uSunWarm;
uniform float uNight;
uniform vec3 uSunFace;

varying vec2  vUv;
varying float vPart;
varying float vOpen;
varying float vSun;
varying vec3  vBody;
varying vec3  vLit;
varying vec3  vEye;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

void main() {
  float glowKey = 0.0;
  vec3 col;

  if (vPart > 2.5) {
    if (vPart < 3.5) {
      // A branch is the stem it came off, a shade under: it is thinner, and it
      // is what the stalk is casting onto itself. The ridge running up the
      // middle of the fold is the only thing that says it has a section at all.
      col = uStem * (0.88 + 0.26 * (1.0 - vUv.x));
    } else if (vPart < 4.5) {
      // Leaves are darker than the grass, not the same green as it — a leaf
      // pitched in the blades' own range disappears into them, and the whole
      // point of putting one on a branch is that you can see it is there. The
      // spine catches and the margins fall away, which is the only relief a
      // flat fill is allowed here.
      // The spine lifts by an eighth and not by a third. These numbers were set
      // against a teal field a good deal brighter than the olive one that
      // replaced it, and against the olive the old 1.3 put the lit side of every
      // leaf above the brightest shaded blade in the frame — a stand read as a
      // scatter of pale wedges with flowers somewhere behind them.
      col = uLeaf * mix(1.12, 0.7, smoothstep(0.1, 0.9, vUv.x));
      col *= mix(0.6, 1.0, smoothstep(0.0, 0.45, vUv.y));
    } else {
      // The second head: a green calyx while it is shut, the flower's own
      // colour once it is open. A shut one still shows colour at the very tip,
      // which is both what a bud about to break actually looks like and the
      // only thing that makes one legible at all — a plain green spindle four
      // millimetres long standing in grass is nothing.
      // Kept well clear of the flower colour until the very last of the lobe,
      // and only a third of the way to it there: a green carrying half a gold
      // over its whole top half is neither, and what it comes out as is a small
      // brown knob — which is exactly what a dead seedhead looks like, and the
      // one thing this is not.
      col = mix(uLeaf * 1.08, vBody, smoothstep(0.12, 0.7, vOpen));
      col = mix(col * 0.74, mix(col, vLit, 0.35 * vOpen), smoothstep(0.15, 0.95, vUv.y));
      col = mix(col, vBody, 0.34 * smoothstep(0.74, 1.0, vUv.y) * (1.0 - smoothstep(0.12, 0.5, vOpen)));
    }
  } else if (vPart < 0.5) {
    // The foot of the stem is down in the shade of the grass it came up
    // through, on the same ramp the blades use on their own roots. It is also
    // what keeps a hard dark line from landing on the canopy: the stem does not
    // end, it goes into the grass.
    col = uStem * mix(0.34, 1.0, smoothstep(0.0, 0.62, vUv.y));
  } else if (vPart < 1.5) {
    // Down into the throat, and down again along the petal's own spine. The
    // trough has to be darker than the two rims either side of it or the cup is
    // simply not there from directly above, which is where the hero camera is.
    col = vBody * mix(0.4, 1.0, smoothstep(0.0, 0.36, vUv.y));
    float valley = (1.0 - smoothstep(0.0, 0.55, vUv.x)) * (1.0 - smoothstep(0.5, 0.92, vUv.y));
    col *= mix(1.0, 0.78, valley);
    // And the lifted edges. Kept well under half — a meadow's worth of these
    // averages out to whatever this number is, and the hero type sits on the
    // average.
    float rim = smoothstep(0.36, 0.98, vUv.x) * smoothstep(0.1, 0.44, vUv.y);
    col = mix(col, vLit, rim * 0.5);
    // After dark, its own light — see three/TimeGrade.tsx.
    col += vLit * uNight * 0.75;
    glowKey = uNight;
  } else {
    col = mix(vEye, vEye * 1.5, smoothstep(0.5, 1.0, vUv.x));
  }

  /*
   * ...and whether this plant is standing in the sun.
   *
   * It is growing out of the same field as the blades around it and it was the
   * one thing in that field not answering the pool — a stand planted inside the
   * light sat at exactly the colour of the same stand planted four metres away
   * in the shade, which reads as a decal on a photograph. Read once, at the
   * root, off three/sunlight.ts, so the plant is wholly in the light or wholly
   * out of it in the same way a blade is.
   *
   * Two different mixes, because they are two different things. The foliage is
   * field: it goes to the grass's own lit stop, and by the same share of it, so
   * a leaf in the pool is the colour of the blades it is standing between. The
   * head is not field — it is already the brightest thing for a metre in any
   * direction and it has its own sunlit twin — so it takes a much smaller push,
   * toward that twin rather than toward the grass. A cream daisy warmed all the
   * way to the grass's lit green is a green daisy.
   *
   * The fleckwork the blades also read is deliberately not here. That is what
   * leaks through a canopy onto what is under it, and these stand a head above
   * the canopy: there is nothing over them to leak through.
   */
  // The bud counts as a head rather than as foliage, because half of them are
  // open and the open ones are carrying the flower's own colour. Warming one of
  // those toward a lit green would put a small brown knob at the end of a branch
  // — the same failure the calyx ramp above exists to avoid.
  float lit = smoothstep(0.0, 0.62, vSun);
  if (vPart < 0.5 || (vPart > 2.5 && vPart < 4.5)) {
    col = mix(col, mix(col, uSunWarm, 0.62), lit);
  } else {
    col = mix(col, mix(col, vLit, 0.5), lit);
    col = mix(col, uSunFace, smoothstep(0.62, 1.0, vSun) * 0.1);
  }

  gl_FragColor = vec4(col, 1.0 - 0.9 * glowKey);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

/**
 * The rim colour of a flower colour. Derived rather than given, because the
 * biome names the species and not their edges — worked in sRGB so a violet
 * lifts by as much as a gold does, which is not true of the linear working
 * space, and capped so a cream does not turn into paper.
 */
function sunlit(hex: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(hsl, SRGBColorSpace);
  return new Color().setHSL(
    hsl.h + 0.012,
    Math.min(1, hsl.s * 0.92),
    Math.min(0.88, hsl.l + 0.15),
    SRGBColorSpace,
  );
}

/**
 * How many stands the machine gets. The plants are cheap — two hundred and
 * twenty-nine triangles each against a grass clump's several hundred, and there
 * are only a few hundred of them in the whole field against twenty-odd thousand
 * clumps — but a phone already has a field to draw, and a stand fewer is a
 * stand nobody counts.
 */
const STAND_SCALE: Record<string, number> = { low: 0.5, medium: 0.78, high: 1 };

export default function Wildflowers({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const wind = reducedMotion() ? 0.25 : 1;
  const sway = swayGrid();

  const geometry = useMemo(() => {
    const spec = biome.wildflowers;
    if (!spec) return null;
    const plants = plantWildflowers(biome, STAND_SCALE[quality()] ?? 1);
    const n = plants.length;
    if (n === 0) return null;

    const geo = plantGeometry();
    const pos = new Float32Array(n * 3);
    const shape = new Float32Array(n * 4);
    const turn = new Float32Array(n * 4);
    const stalk = new Float32Array(n * 4);
    const carry = new Float32Array(n * 3);
    const sun = new Float32Array(n);
    const body = new Float32Array(n * 3);
    const lit = new Float32Array(n * 3);
    const eye = new Float32Array(n * 3);

    // Three colours per plant rather than an index into three uniforms: the
    // species list is data, and a shader that has to know how long it is is a
    // shader that has to be edited to add a flower.
    const bodies = spec.species.map((s) => new Color(s.body));
    const lits = spec.species.map((s) => sunlit(s.body));
    const eyes = spec.species.map((s) => new Color(s.eye));

    // A plant's architecture is its own business and the planting has no use
    // for it, so it is rolled here rather than carried through field.ts — the
    // same arrangement the poppies' spin and nod are on.
    const rnd = makeRandom(508117);
    // Zero on every biome but the meadow, which is the only one with a sun and
    // — as it happens — the only one with wildflowers.
    const sunOn = SUN_STRENGTH[biome.id] ?? 0;

    plants.forEach((f, i) => {
      const s = spec.species[f.species];
      pos[i * 3] = f.x;
      pos[i * 3 + 1] = f.y;
      pos[i * 3 + 2] = f.z;
      // Shortened a little, and hardly ever by much. The planting already
      // decided this plant clears the grass and stays under the corridor the
      // camera walks; the spread that stops a stand looking stamped can only
      // be taken off that height, never added to it.
      shape[i * 4] = f.height * (1 - 0.2 * rnd() ** 1.7);
      shape[i * 4 + 1] = f.radius;
      shape[i * 4 + 2] = f.phase;
      shape[i * 4 + 3] = s.eyeSize;
      turn[i * 4] = f.spin;
      turn[i * 4 + 1] = f.nod;
      turn[i * 4 + 2] = s.petals;
      turn[i * 4 + 3] = s.width;

      stalk[i * 4] = rnd() * Math.PI * 2;
      // How far off vertical it grew, as a share of its own height. A third of
      // them stand more or less straight and the rest lean; the tail matters
      // more than the mean, because a stand where every plant leans by the
      // same small amount is as combed as a stand where none of them do.
      stalk[i * 4 + 1] = 0.03 + 0.26 * rnd() ** 2.1;
      stalk[i * 4 + 2] = rnd() * Math.PI * 2;
      stalk[i * 4 + 3] = rnd() < 0.42 ? 2 : 1;
      // Two in three carry a second head on the first branch, and half of
      // those are still a bud: a stand where every plant is in full flower
      // twice over is a stand in a catalogue, and one where none of them are is
      // back to a row of single stems. The closed ones are the cheap ones too —
      // a bud is the flower's colour folded away inside a green.
      const carrying = rnd();
      carry[i * 3] = carrying > 0.68 ? -1 : carrying < 0.34 ? 0.04 + rnd() * 0.14 : 0.62 + rnd() * 0.38;
      carry[i * 3 + 1] = 0.5 + rnd() * 0.35;
      carry[i * 3 + 2] = rnd();

      sun[i] = sunOn > 0 ? sunPool(f.x, f.z) * sunOn : 0;

      bodies[f.species].toArray(body, i * 3);
      lits[f.species].toArray(lit, i * 3);
      eyes[f.species].toArray(eye, i * 3);
    });

    geo.setAttribute("iPos", new InstancedBufferAttribute(pos, 3));
    geo.setAttribute("iShape", new InstancedBufferAttribute(shape, 4));
    geo.setAttribute("iTurn", new InstancedBufferAttribute(turn, 4));
    geo.setAttribute("iStalk", new InstancedBufferAttribute(stalk, 4));
    geo.setAttribute("iCarry", new InstancedBufferAttribute(carry, 3));
    geo.setAttribute("iBody", new InstancedBufferAttribute(body, 3));
    geo.setAttribute("iLit", new InstancedBufferAttribute(lit, 3));
    geo.setAttribute("iEye", new InstancedBufferAttribute(eye, 3));
    geo.setAttribute("iSun", new InstancedBufferAttribute(sun, 1));
    geo.instanceCount = n;
    // Generated, so nothing can compute a useful bound for it.
    geo.boundingSphere = new Sphere(new Vector3(0, 0.3, -1.5), 16);
    return geo;
  }, [biome]);

  const uniforms = useMemo(
    () =>
      withFog({
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
        uStem: { value: new Color(biome.wildflowers?.stem ?? "#1e4028") },
        uLeaf: { value: new Color(biome.wildflowers?.leaf ?? "#254a2d") },
        uSunWarm: { value: new Color(SUN_RAMP.warm) },
        uSunFace: { value: new Color(SUN_RAMP.face) },
      }),
    [biome, wind, sway],
  );

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
    highlight("face", material.current.uniforms.uSunFace.value);
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
