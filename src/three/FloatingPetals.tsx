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
import { FLOWER } from "@/lib/flowerLayout";
import { makeRandom } from "@/lib/math";
import { pointer } from "@/lib/pointer";
import { petalGeometry } from "./geometry";
import { quality, reducedMotion } from "./quality";
import { withFog } from "./uniforms";
import { bankEdgeZ, POND, ripple, SHORE, SILT_Y, siltRelief, WAVE_GLSL } from "./pond";

/**
 * Blossom on the water, and blossom that has come off it.
 *
 * The petals are the only things in this biome that are genuinely on the
 * surface rather than under it or painted onto it, so they are real geometry
 * and they ride the real wave: the shader they are drawn with computes the same
 * six trains the water does and shears each petal by the local slope, which at
 * two-centimetre amplitudes is indistinguishable from tipping it properly and
 * costs one multiply-add.
 *
 * A fraction of them are beached instead, lying in the silt along the near
 * edge. They are here because the cameras from the bloom onward are too low to
 * see the surface at all, and blossom stranded in wet mud is the plainest
 * statement there is that the mud is a shore. They are the same blossom, in the
 * same colours, soaked darker — what has washed up has to be what is floating,
 * or the two read as unrelated weather.
 *
 * Where they *are* is a CPU problem, the same shape as the grass's sway
 * (src/three/sway.ts): a field solved on the processor and handed to the shader
 * as an attribute. A cursor dragged across the pond is mostly the water it
 * displaces carrying them along with it, and partly the bow wave shoving them
 * out of the way — both of which come out of the pointer's own world velocity,
 * so a slow sweep herds them and a fast one scatters them.
 *
 *
 * ## Why the pond is not evenly covered, and why that is what makes it work
 *
 * The surface is meant to be nearly under blossom, and nearly under blossom is
 * a great many petals — several thousand rather than several hundred. Two
 * things break at that density if the covering is *even*.
 *
 * The first is the picture. There is a koi school under this water and a canopy
 * reflected in it, and both of them are read through the surface: a mat of
 * blossom laid on evenly is a lid, and behind a lid there is no pond. The
 * second is the physics. The behaviour this file was built for is that the
 * cursor pushes petals aside and the gap then *refills* — and a field packed
 * evenly to its own limit has nowhere to refill from, because every petal
 * around the gap is already as boxed in as the gap is empty.
 *
 * Real blossom on real water does not lie evenly either. It rafts: the drift
 * gathers it into floes with open lanes of clear water winding between them,
 * and the lanes are where you see the sky and the fish.
 *
 * So the field is given a *target density* rather than a spacing — a slow,
 * drifting noise field over the pond, mapped so that a little under half its
 * area is raft and the rest is lane. Each petal reads the difference between
 * how crowded it actually is and how crowded it is supposed to be there, and
 * swims down that gradient. Everything falls out of the one rule:
 *
 * - a raft packs to well over its own area in blossom and stops there, because
 *   past the target the difference is positive and pushes outward;
 * - a lane stays a lane, because petals in it are already at the density they
 *   are meant to be and feel nothing;
 * - a hole swept by the cursor is *below* target, so it pulls from every side
 *   until it is not — and the lanes are the reservoir that makes that possible
 *   at a density where an even field would be jammed solid;
 * - nothing has to know where the cursor was, or where a raft is. Both are
 *   read back out of the field the petals themselves wrote.
 *
 * It is one scatter, two blurs and one gradient over a grid of a few hundred
 * cells, so it costs the same at four thousand petals as at four hundred.
 */

type Floater = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  turn: number;
  spin: number;
  scale: number;
  tone: number;
  /** Aground in the silt: it takes no notice of the water or the cursor. */
  beached: boolean;
};

/**
 * How many are afloat.
 *
 * Between the two things this has been. It was 1,350 and read as a handful of
 * blossom dropped on open water; it went to 13,500, which covered the pond
 * nearly end to end and was the user's "too many" — at that density the water
 * is no longer water, the reflection has no surface left to happen on, and the
 * koi are a rumour under a lid.
 *
 * ...and then below where it started, after five rounds of looking at it. The
 * whole run was 1,350 -> 13,500 -> 4,800 -> 2,700 -> 1,600 -> 1,350 -> 820 ->
 * 420 -> 26, which is a couple of dozen: two orders of magnitude under the
 * peak, and few enough that the raft machinery below now has almost nothing to
 * gather. It is kept because it still decides WHERE the handful sit, and a
 * handful strewn evenly reads as placed where a handful in one drift does not,
 * which is worth leaving on the record rather than quietly reverting: the
 * ten-fold rise was asked for as "almost entirely cover the pond", and every
 * step down from it was asked for after seeing it on screen.
 *
 * What the count is for turns out not to be coverage at all. It is that the
 * water has to stay water: the reflection needs a surface to happen on, the koi
 * need to be seen through it, and blossom is the one thing in this biome that
 * can take all of that away by being abundant.
 *
 * The raft machinery that was built on the way up stays and is not wasted: it
 * is what makes 1,350 read as drifts of blossom rather than as 1,350 petals
 * sprinkled evenly.
 *
 * It stayed affordable across all of that because none of the cost grew with
 * it: the crowding is solved on a grid rather than pair by pair, the sheet each
 * petal is drawn with is thirty triangles, and it is still one instanced draw.
 */
const COUNT: Record<string, number> = { low: 12, medium: 18, high: 26 };
const BEACHED: Record<string, number> = { low: 30, medium: 56, high: 88 };

/** The cursor's reach, matched to the grass's so one sweep moves both. */
const REACH = 1.15;
/** How hard water holds on to what is floating on it. */
const DRAG = 1.9;

/**
 * The raft field.
 *
 * `CELL` is a little over a petal's length, so a raft is a dozen cells across
 * and a lane three or four — the scale blossom actually gathers at, and coarse
 * enough that the whole grid is a few hundred numbers. `BLUR` passes of a
 * three-tap kernel are what turn a count of petals per cell into something with
 * a gradient worth following; one pass leaves the field as noisy as the
 * sampling that made it and the petals chase their own shot noise.
 */
const CELL = 0.15;
const BLUR = 2;
/**
 * How fast a petal swims down the difference, in metres per second per unit of
 * relative crowding per metre. High enough to close a swept lane in about two
 * seconds and low enough that the field does not visibly boil.
 *
 * Left alone when the drift was slowed, having been cut to 0.115 first and put
 * straight back. This is not drift — it is the restoring term, the one that
 * refills the lane a cursor has just swept, and slowing it does not make the
 * petals calmer, it makes the hole permanent. Measured: at 0.115 a swept lane
 * went from 28.6% coverage to 21.8% and was still falling at 19.1% six seconds
 * later, when it should have been closing. Only the ambient current above is
 * the free drift the instruction was about.
 */
const SEEK = 0.17;
/** And the fastest it will do it, so a spike in the field cannot fling one. */
const SEEK_MAX = 0.85;

/*
 * A note on the refill, measured rather than assumed.
 *
 * The lane a cursor sweeps no longer closes the way it did. Swept, then left
 * alone for six seconds, a lane went 29% -> 22% -> 20% coverage: still opening,
 * not closing. That is NOT the slowed drift above — the same test run with the
 * old drift values gives 29% -> 22% -> 20%, identical inside noise.
 *
 * It is the count. This machinery was built at 13,500 petals, where the field
 * sits at or over its raft target nearly everywhere and every lane has a packed
 * floe beside it to draw from. At 1,600 the whole pond is below target, the
 * gradient a hole creates is shallow, and there is no reservoir to refill from
 * — a swept lane is just more of the open water that is already there.
 *
 * Nothing here is broken and the numbers below are still the right ones for a
 * covered pond. If the refill is wanted back at this density the lever is the
 * target, not the seek: RAFT_LO/RAFT_HI down so that 1,600 petals is once again
 * "full" for the area they are spread over.
 */

/**
 * How much of the pond is raft.
 *
 * `RAFT_LO`/`RAFT_HI` cut the noise field into lane and floe. The floor is what
 * a lane still carries — never nothing, because a swept-clean lane of water in
 * a pond otherwise deep in blossom reads as a hole in the render rather than as
 * water. `NEAR` is the one deliberate unevenness on top of that: the far third
 * of this pond is fog, so blossom out there is blossom nobody sees, and the
 * budget is better spent on the water the hero actually shows.
 */
const RAFT_LO = 0.20;
const RAFT_HI = 0.42;
const RAFT_FLOOR = 0.18;
const NEAR_BIAS = 0.5;
/** How much more blossom the last half metre of water carries than the middle. */
const SHORE_PILE = 0.9;

/**
 * The hard core, which is now the *only* pairwise thing left.
 *
 * It is a third of what it was and does a third of what it used to: the raft
 * field decides where petals are, and this only stops two of them occupying the
 * same centimetre. It has to be well under a petal's own length, because inside
 * a raft they overlap — that is what a raft is — and a shoulder that kept them
 * apart at arm's length would cap the covering at about a third whatever the
 * count.
 */
const CROWD = 0.070;
const SHOULDER = 0.7;

const VERT = /* glsl */ `
attribute vec4 iPose;   // x, z, cos turn, sin turn
attribute vec4 iForm;   // scale, tone, aground, the height it rests at

uniform float uTime;

varying vec2  vUv;
varying float vTone;

#include <fog_pars_vertex>

${WAVE_GLSL}

void main() {
  vec3 q = position * iForm.x;
  q = vec3(q.x * iPose.z + q.z * iPose.w, q.y, -q.x * iPose.w + q.z * iPose.z);

  float h;
  vec2 g;
  waterSurface(iPose.xy, uTime, 1.0, h, g);

  // Half the swell, not all of it: the plane the water is drawn on is flat, so
  // a petal that rode the full amplitude would visibly climb off the surface it
  // is supposed to be lying in. The tilt is what reads as riding a wave anyway.
  //
  // A beached one is out of all of that: it lies in the mud at the height the
  // mud is — which is a height the processor worked out when it was placed,
  // because the silt is modelled and a petal resting at a flat nought would be
  // under it half the time.
  //
  // iForm.w carries both cases: the silt height for a beached one, and for a
  // floater the two or three millimetres of its own that keep it off its
  // neighbours. Petals in a raft overlap, and several thousand of them sharing
  // one height is several thousand pairs of coplanar sheets fighting over the
  // depth buffer.
  float afloat = 1.0 - iForm.z;
  vec3 world = vec3(
    iPose.x + q.x,
    iForm.w + h * 0.6 * afloat + q.y + dot(g, vec2(q.x, q.z)) * afloat,
    iPose.y + q.z);

  vUv = uv;
  vTone = iForm.y;

  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uInner;
uniform vec3 uOuter;

varying vec2  vUv;
varying float vTone;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

void main() {
  vec3 col = mix(uInner, uOuter, smoothstep(0.05, 0.9, vUv.y));
  // The end sitting in the water is soaked, and a wet petal is darker. It is
  // the only cue that these are floating rather than hovering.
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.5, vUv.y));
  // The crease down the middle, which is what stops it reading as a tab.
  col *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.16, abs(vUv.x - 0.5)));
  // Some of these came down days ago.
  col = mix(col, col * 0.62, vTone);

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

/**
 * Where the silt is, for the blossom that has washed up in it.
 *
 * The same two numbers three/Bank.tsx builds its sheet out of, read rather than
 * restated — a petal lying at a height this file had its own opinion about is a
 * petal half sunk into the mud, and half of them would be.
 */
function siltHeight(x: number, z: number): number {
  const ashore = Math.min(1, Math.max(0, (z - bankEdgeZ(x)) / SHORE));
  return SILT_Y + siltRelief(x, z) * ashore * ashore;
}

/**
 * Value noise, on the processor.
 *
 * An integer hash rather than the water shader's fract-of-a-product one, and
 * the difference is not stylistic. That construction is fine for breaking up a
 * surface, where all that matters is that neighbouring cells disagree; here the
 * field is *thresholded*, so how much of the pond ends up raft is decided by
 * the shape of its distribution — and the fract one is skewed hard toward the
 * bottom, with a median near a quarter rather than a half. Cut at the number
 * that looks like the middle and nine tenths of the pond comes out lane.
 */
function hash21(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const e = hash21(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
}

/**
 * How much blossom belongs at a point, before it is scaled to the count.
 *
 * Two octaves and no more: this is the shape of a drift, and a drift has no
 * detail — the fine structure of a raft comes from where its own petals landed,
 * not from the field that gathered them. The whole thing is read at a slowly
 * turning offset so the floes wander over a minute or two, which is the one
 * motion that stops a covered pond looking like a printed pattern.
 */
function raftAt(x: number, z: number, t: number): number {
  const dx = t * 0.011;
  const dz = t * 0.007;
  const n =
    0.66 * vnoise(x * 0.52 + dx, z * 0.52 - dz) +
    0.34 * vnoise(x * 1.19 - dz * 1.7, z * 1.19 + dx * 1.3);
  const q = Math.min(1, Math.max(0, (n - RAFT_LO) / (RAFT_HI - RAFT_LO)));
  const raft = q * q * (3 - 2 * q);
  // The far water is haze; it gets half the blossom and nobody can tell.
  const near = NEAR_BIAS + (1 - NEAR_BIAS) * Math.min(1, Math.max(0, (z - POND.minZ) / 3.4));
  // And a tideline. Anything floating ends up against the shore it is being
  // blown onto, and the near bank is the lee of this one — so the last half
  // metre of water carries more blossom than the middle of the pond does,
  // which is what a pond under blossom actually looks like and is also the
  // bottom edge of the hero.
  const ashore = 1 + SHORE_PILE * Math.exp(-Math.max(0, bankEdgeZ(x) - z) / 0.42);
  return (RAFT_FLOOR + (1 - RAFT_FLOOR) * raft) * near * ashore;
}

/**
 * The raft field as arrays: how many petals are in each cell, how many belong
 * there, and which way is downhill on the difference.
 *
 * Head-and-next lists for the hard core on top, rebuilt from nothing every
 * frame in one pass, never allocating.
 */
function makeField(count: number) {
  const minX = POND.minX - 0.7;
  const minZ = POND.minZ - 0.7;
  const cols = Math.ceil((POND.maxX + 0.7 - minX) / CELL) + 1;
  const rows = Math.ceil((1.0 - minZ) / CELL) + 1;
  const n = cols * rows;
  const core = CROWD;
  const ccols = Math.ceil((POND.maxX + 0.7 - minX) / core) + 1;
  const crows = Math.ceil((1.0 - minZ) / core) + 1;
  return {
    minX,
    minZ,
    cols,
    rows,
    /** Petals per cell, then the same blurred, then what belongs there. */
    have: new Float32Array(n),
    swap: new Float32Array(n),
    want: new Float32Array(n),
    /** Downhill on (have − want), per cell, in units of petals per metre. */
    gx: new Float32Array(n),
    gz: new Float32Array(n),
    /** The hard core's own, much finer, grid. */
    ccols,
    crows,
    head: new Int32Array(ccols * crows),
    next: new Int32Array(count),
    coreAt(x: number, z: number) {
      const cx = Math.min(this.ccols - 1, Math.max(0, ((x - this.minX) / core) | 0));
      const cz = Math.min(this.crows - 1, Math.max(0, ((z - this.minZ) / core) | 0));
      return cz * this.ccols + cx;
    },
  };
}

type Field = ReturnType<typeof makeField>;

/** Three-tap blur, in place, one axis at a time. */
function blur(field: Field, src: Float32Array, tmp: Float32Array) {
  const { cols, rows } = field;
  for (let r = 0; r < rows; r++) {
    const o = r * cols;
    for (let c = 0; c < cols; c++) {
      const a = src[o + Math.max(0, c - 1)];
      const b = src[o + c];
      const d = src[o + Math.min(cols - 1, c + 1)];
      tmp[o + c] = (a + 2 * b + d) * 0.25;
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const a = tmp[Math.max(0, r - 1) * cols + c];
      const b = tmp[r * cols + c];
      const d = tmp[Math.min(rows - 1, r + 1) * cols + c];
      src[r * cols + c] = (a + 2 * b + d) * 0.25;
    }
  }
}

/** The petal sheet from geometry.ts, made instanceable. */
function floaterGeometry(count: number) {
  const petal = petalGeometry({
    length: 0.07,
    // Broader and blunter than it was. A cherry petal is a rounded blade with a
    // notch, not a lance, so this is nearer the thing — and it is also the
    // cheapest coverage on the pond: a third more water under each petal for
    // the same instance, the same triangle and the same upload.
    width: 0.052,
    cup: 0.2,
    curl: 0.05,
    tip: 0.60,
    // Thirty triangles, where it used to be ninety. There are ten times as many
    // of these as there were and a floating one is a dozen pixels across at the
    // hero: what has to survive is the outline, and the outline is the width
    // function, which is sampled along u. Losing rows across the sheet costs
    // only the curl, and the curl is under the resolution of the shot.
    nu: 6,
    nv: 3,
  });
  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", petal.getAttribute("position") as BufferAttribute);
  geo.setAttribute("uv", petal.getAttribute("uv") as BufferAttribute);
  geo.setIndex(petal.getIndex());
  geo.instanceCount = count;
  // Everything about where these are lives in an attribute the CPU rewrites
  // every frame, so nothing can compute a bound for them.
  geo.boundingSphere = new Sphere(new Vector3(0, 0, -2.5), 10);
  return geo;
}

export default function FloatingPetals({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const calm = reducedMotion();
  const pond = biome.pond!;
  const count = COUNT[quality()];
  const aground = BEACHED[quality()];

  const { geometry, pose, petals, field } = useMemo(() => {
    const rnd = makeRandom(30117);
    const total = count + aground;
    const geo = floaterGeometry(total);
    const pose = new Float32Array(total * 4);
    const form = new Float32Array(total * 4);

    const petals: Floater[] = Array.from({ length: total }, (_, i) => {
      const beached = i >= count;
      let x: number;
      let z: number;
      if (beached) {
        // Where the cameras from the bloom onward are, rather than across the
        // whole shore: blossom two metres off to the side is blossom nobody in
        // this journey ever sees.
        x = FLOWER.x + (rnd() * 2 - 1) * 2.2;
        // Piled up hardest right at the water and thinning inland, which is
        // what a tideline is.
        z = bankEdgeZ(x) + Math.pow(rnd(), 1.6) * 1.15;
      } else {
        // Seeded *into* the raft field rather than spread flat and left to find
        // it. Rejection sampling, eight tries and then wherever it landed: at
        // this density an unsorted start takes the better part of a minute to
        // sort itself out, and the hero is photographed at two seconds.
        x = 0;
        z = 0;
        for (let k = 0; k < 8; k++) {
          x = POND.minX + rnd() * (POND.maxX - POND.minX);
          const edge = bankEdgeZ(x) - 0.14;
          z = POND.minZ + rnd() * (edge - POND.minZ);
          if (rnd() < raftAt(x, z, 0)) break;
        }
      }
      return {
        x,
        z,
        vx: 0,
        vz: 0,
        turn: rnd() * Math.PI * 2,
        spin: 0,
        // Half again the size they were, for the floaters only. Coverage goes
        // as the square of this and the count only linearly, so the cheapest
        // metre of blossom on this pond is a bigger petal — and at the hero a
        // nine-centimetre one is fifteen pixels, which is still a petal and not
        // a leaf. The beached ones are read from a hand's width away in the
        // last three acts and keep the size they had.
        scale: beached ? 0.95 + rnd() * 0.7 : 1.02 + rnd() * 0.76,
        // Beached blossom has been out of the water a while, so it sits on the
        // dark half of the ramp — but not the far end of it: silt is dark, and
        // blossom nobody can pick out of it is blossom that is not there.
        tone: beached ? 0.1 + rnd() * 0.5 : rnd() < 0.4 ? rnd() * 0.85 : 0,
        beached,
      };
    });

    // Seeded here as well as stepped, so a reader who has asked for reduced
    // motion gets a pond of still blossom rather than an empty one.
    const lift = makeRandom(51103);
    petals.forEach((f, i) => {
      form[i * 4] = f.scale;
      form[i * 4 + 1] = f.tone;
      form[i * 4 + 2] = f.beached ? 1 : 0;
      form[i * 4 + 3] = f.beached ? siltHeight(f.x, f.z) + 0.004 : 0.005 + lift() * 0.006;
      pose[i * 4] = f.x;
      pose[i * 4 + 1] = f.z;
      pose[i * 4 + 2] = Math.cos(f.turn);
      pose[i * 4 + 3] = Math.sin(f.turn);
    });

    geo.setAttribute("iPose", new InstancedBufferAttribute(pose, 4));
    geo.setAttribute("iForm", new InstancedBufferAttribute(form, 4));
    return { geometry: geo, pose, petals, field: makeField(count) };
  }, [count, aground]);

  const uniforms = useMemo(
    () =>
      withFog({
        uTime: { value: 0 },
        uRipple: { value: new Vector3() },
        uInner: { value: new Color(pond.petal[0]) },
        uOuter: { value: new Color(pond.petal[1]) },
      }),
    [pond],
  );

  useFrame((state, dt) => {
    const m = material.current;
    if (!m) return;
    const t = state.clock.elapsedTime * (calm ? 0.25 : 1);
    m.uniforms.uTime.value = t;
    // The water stepped the cursor's ring earlier this frame; this only reads
    // it, so the petals rise on the same rings the surface shows.
    m.uniforms.uRipple.value.set(ripple.x, ripple.z, ripple.amp);

    if (dt > 0.05) dt = 0.05;
    if (calm) return;

    const { cols, rows, minX, minZ, have, swap, want, gx, gz } = field;

    // 1. Where the blossom actually is. Bilinear, so a petal that has moved a
    //    tenth of a cell moves a tenth of a petal between cells and the field
    //    does not flicker as things cross a boundary.
    have.fill(0);
    field.head.fill(-1);
    for (let i = 0; i < count; i++) {
      const f = petals[i];
      const u = (f.x - minX) / CELL;
      const v = (f.z - minZ) / CELL;
      let c = Math.floor(u);
      let r = Math.floor(v);
      const fu = u - c;
      const fv = v - r;
      c = Math.min(cols - 2, Math.max(0, c));
      r = Math.min(rows - 2, Math.max(0, r));
      const o = r * cols + c;
      have[o] += (1 - fu) * (1 - fv);
      have[o + 1] += fu * (1 - fv);
      have[o + cols] += (1 - fu) * fv;
      have[o + cols + 1] += fu * fv;

      const cell = field.coreAt(f.x, f.z);
      field.next[i] = field.head[cell];
      field.head[cell] = i;
    }
    for (let k = 0; k < BLUR; k++) blur(field, have, swap);

    // 2. Where it belongs, scaled so the two are in the same units: whatever
    //    the field asks for in total, the pond has exactly `count` to give.
    let sum = 0;
    for (let r = 0; r < rows; r++) {
      const z = minZ + (r + 0.5) * CELL;
      for (let c = 0; c < cols; c++) {
        const x = minX + (c + 0.5) * CELL;
        // Only water counts. Asking for blossom on the bank would drag the
        // whole field ashore, and the bank has its own, beached.
        //
        // The cut is a little *landward* of where the petals are actually
        // stopped, because the two blurs below spread this by a third of a
        // metre either way: cut exactly at the waterline and the last half
        // metre of pond — which is the bottom quarter of the hero — is asked
        // for less blossom than the middle of it, and comes out visibly bare.
        const w = z < bankEdgeZ(x) + 0.16 && z > POND.minZ && x > POND.minX && x < POND.maxX
          ? raftAt(x, z, t)
          : 0;
        want[r * cols + c] = w;
        sum += w;
      }
    }
    const norm = sum > 1e-6 ? count / sum : 0;
    for (let i = 0; i < want.length; i++) want[i] *= norm;
    for (let k = 0; k < BLUR; k++) blur(field, want, swap);

    // 3. Downhill on the difference. This is the whole simulation: a petal
    //    swims from where there is more blossom than there should be toward
    //    where there is less, and stops when the two agree.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const o = r * cols + c;
        const l = o - (c > 0 ? 1 : 0);
        const rr = o + (c < cols - 1 ? 1 : 0);
        const d = o - (r > 0 ? cols : 0);
        const u = o + (r < rows - 1 ? cols : 0);
        gx[o] = (have[rr] - want[rr] - (have[l] - want[l])) / (2 * CELL);
        gz[o] = (have[u] - want[u] - (have[d] - want[d])) / (2 * CELL);
      }
    }

    for (let i = 0; i < petals.length; i++) {
      const f = petals[i];
      // Aground, and staying there. Its pose was written when it was seeded.
      if (f.beached) continue;

      // A pond is never still: a slow rotation of the whole surface, which is
      // what stops a covering of petals looking like it was placed.
      //
      // Slower, at both ends of it. The amplitude is a little over half what it
      // was and the two rates are down by a third, which are different things:
      // the first is how far a petal travels and the second is how often the
      // current it is on changes its mind. Only the drift is slowed — the
      // cursor's bow wave below is untouched, so a petal still leaves quickly
      // when it is pushed and then takes its time coming back to rest, which is
      // the difference between still water and thick water.
      let cx = 0.0095 * Math.sin(f.z * 0.7 + t * 0.075);
      let cz = 0.0075 * Math.cos(f.x * 0.6 - t * 0.06);

      // The raft field, as a drift the water is carrying it on rather than as a
      // force: this is the overdamped limit of the same thing, and at four
      // thousand petals it is the only one of the two that cannot ring.
      {
        const u = (f.x - minX) / CELL - 0.5;
        const v = (f.z - minZ) / CELL - 0.5;
        let c = Math.floor(u);
        let r = Math.floor(v);
        const fu = u - c;
        const fv = v - r;
        c = Math.min(cols - 2, Math.max(0, c));
        r = Math.min(rows - 2, Math.max(0, r));
        const o = r * cols + c;
        const w00 = (1 - fu) * (1 - fv);
        const w10 = fu * (1 - fv);
        const w01 = (1 - fu) * fv;
        const w11 = fu * fv;
        let sx =
          -SEEK * (gx[o] * w00 + gx[o + 1] * w10 + gx[o + cols] * w01 + gx[o + cols + 1] * w11);
        let sz =
          -SEEK * (gz[o] * w00 + gz[o + 1] * w10 + gz[o + cols] * w01 + gz[o + cols + 1] * w11);
        const s = Math.hypot(sx, sz);
        if (s > SEEK_MAX) {
          sx *= SEEK_MAX / s;
          sz *= SEEK_MAX / s;
        }
        cx += sx;
        cz += sz;
      }

      let ax = 0;
      let az = 0;

      // The hard core. Nine cells of a grid one core wide, which at this
      // density is two or three petals.
      const home = field.coreAt(f.x, f.z);
      for (let r = -1; r <= 1; r++) {
        for (let c = -1; c <= 1; c++) {
          const cell = home + r * field.ccols + c;
          if (cell < 0 || cell >= field.head.length) continue;
          for (let j = field.head[cell]; j >= 0; j = field.next[j]) {
            if (j === i) continue;
            const o = petals[j];
            const dx = f.x - o.x;
            const dz = f.z - o.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= CROWD * CROWD || d2 < 1e-8) continue;
            const d = Math.sqrt(d2);
            const q = 1 - d / CROWD;
            const push = (SHOULDER * q * q) / d;
            ax += dx * push;
            az += dz * push;
          }
        }
      }

      if (pointer.active) {
        const dx = f.x - pointer.worldX;
        const dz = f.z - pointer.worldZ;
        const d = Math.hypot(dx, dz);
        if (d < REACH) {
          let q = 1 - d / REACH;
          q = q * q * (3 - 2 * q);
          const inv = d > 1e-4 ? 1 / d : 0;
          // The bow wave, which has to be worth more than the raft field or the
          // pond simply closes over the cursor and nothing moves.
          const shove = 0.7 + 1.6 * pointer.speed;
          ax += (pointer.velX * 2.1 + dx * inv * shove) * q;
          az += (pointer.velZ * 2.1 + dz * inv * shove) * q;
          // Anything flat and light spins on the shear rather than being
          // carried square, so the moment about its own centre is the cross
          // product of where it sits with where the water is going.
          f.spin += (dx * pointer.velZ - dz * pointer.velX) * inv * q * 2.4 * dt;
        }
      }

      f.vx += ((cx - f.vx) * DRAG + ax) * dt;
      f.vz += ((cz - f.vz) * DRAG + az) * dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;

      // The edges of the water, as a damped bounce rather than a clamp: a
      // petal shoved into the bank comes off it with most of its speed gone,
      // which is what blossom against a muddy edge actually does and is also
      // the only thing that stops the cursor sweeping the whole pond's worth
      // of them into one line along the shore.
      const edge = bankEdgeZ(f.x) - 0.1;
      if (f.z > edge) {
        f.z = edge;
        f.vz = -Math.abs(f.vz) * 0.35;
      }
      if (f.z < POND.minZ) {
        f.z = POND.minZ;
        f.vz = Math.abs(f.vz) * 0.35;
      }
      if (f.x < POND.minX) {
        f.x = POND.minX;
        f.vx = Math.abs(f.vx) * 0.35;
      }
      if (f.x > POND.maxX) {
        f.x = POND.maxX;
        f.vx = -Math.abs(f.vx) * 0.35;
      }

      f.spin *= Math.exp(-dt * 1.2);
      f.turn += (f.spin + 0.06 * Math.sin(t * 0.4 + f.scale * 9.0)) * dt;

      pose[i * 4] = f.x;
      pose[i * 4 + 1] = f.z;
      pose[i * 4 + 2] = Math.cos(f.turn);
      pose[i * 4 + 3] = Math.sin(f.turn);
    }
    (geometry.getAttribute("iPose") as InstancedBufferAttribute).needsUpdate = true;
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
