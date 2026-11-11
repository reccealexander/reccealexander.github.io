import { useMemo } from "react";
import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3,
} from "three";
import type { Biome } from "@/lib/biomes";
import { HEX } from "@/lib/palette";
import { fallenLeaves } from "./fallen";
import { quality } from "./quality";
import { LITTER_FRAG, LITTER_VERT, SOIL_GLSL, scatterClods } from "./soil";
import { withFog } from "./uniforms";

/**
 * Leaf litter.
 *
 * The 2D site rasterises its shed leaves into the ground, which is exactly
 * right for a fixed camera reading a field at one raking angle. Here the last
 * act is spent a hand's width off the floor with the copy sitting beside it,
 * so a leaf painted into the soil is a stain: these are real leaves lying at
 * real angles, and they are the only reason the word "litter" in the picker
 * means anything.
 *
 * They answer no light either, and they are darker than the leaves still
 * falling — this is last autumn, under a canopy, wet.
 *
 * One canonical leaf, in parameter space, and every leaf on the floor is that
 * one turned by its own numbers. It has to be: a fallen leaf is not a tilted
 * card. It has dried and curled hard across its own width, buckled along its
 * length, wrung about its axis, and then come to rest on its side or its back
 * on top of whatever fell last year — and none of that is expressible as a
 * shear on a flat quad, which is what this was and why a floor of them read as
 * confetti. Where they lie is in three/fallen.ts.
 */

/**
 * Enough to be a floor rather than a scattering.
 *
 * At the soil act the camera is close enough to count them, and a dozen leaves
 * to the square metre reads as a tidy garden. Sixty does not, and sixty of
 * these to the square metre is a rounding error against one draw of ferns.
 */
const COUNT: Record<string, number> = { low: 3800, medium: 9000, high: 16000 };

/**
 * How much wider than its own outline a leaf is built.
 *
 * The blade is oversize and the fragment stage eats the margin back out of it,
 * so a leaf gets a decayed edge, a bite out of one side and the odd hole
 * through it without a single extra triangle. Past a metre the profile settles
 * at exactly `1 / MARGIN` and the silhouette is the one it always had — the
 * detail is there for the twenty centimetres where it is the whole of the
 * difference between a leaf and a folded card.
 */
const MARGIN = 1.2;

/**
 * One leaf: a pointed lens, in unit space, seven stations long and three
 * across.
 *
 * The rows are the whole reason for the count. A leaf's curl is not one bend —
 * it is a channel across the width that opens toward the tip and a buckle
 * along the length that lifts both ends off the floor, and four stations
 * cannot say both. Three columns is the minimum that has a midrib to fold
 * about; a fifth column would buy a rounder channel at half again as many
 * triangles across sixteen thousand instances, and the fold is legible without
 * it because the leaf is also rolled off flat.
 */
function leafGeometry() {
  const rows = 7;
  const leaf: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1);
    for (const w of [-1, 0, 1]) leaf.push(v, w);
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let c = 0; c < 2; c++) {
      const a = i * 3 + c;
      index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    }
  }

  const geo = new InstancedBufferGeometry();
  geo.setAttribute("aLeaf", new BufferAttribute(new Float32Array(leaf), 2));
  geo.setIndex(index);
  return geo;
}

const VERT = /* glsl */ `
attribute vec2 aLeaf;   // v base to tip, w across
attribute vec4 iPose;   // x, z, cos yaw, sin yaw
attribute vec4 iLie;    // size, how broad, pitch, roll
attribute vec4 iCurl;   // cup, buckle, twist, lift off the soil
attribute vec3 iSkin;   // which litter stop, how dark, how far to skeleton

uniform float uPond;

varying vec2  vUv;
varying vec3  vSkin;
varying float vFace;
varying float vNear;

#include <fog_pars_vertex>

${SOIL_GLSL}

/** Its own long axis, then the end it is propped on, then which way it points. */
vec3 lie(vec3 v, float roll, float pitch, vec2 yaw) {
  float cr = cos(roll);
  float sr = sin(roll);
  v = vec3(cr * v.x - sr * v.y, sr * v.x + cr * v.y, v.z);
  float cp = cos(pitch);
  float sp = sin(pitch);
  v = vec3(v.x, cp * v.y - sp * v.z, sp * v.y + cp * v.z);
  return vec3(yaw.x * v.x + yaw.y * v.z, v.y, -yaw.y * v.x + yaw.x * v.z);
}

void main() {
  float v = aLeaf.x;
  float w = aLeaf.y;

  // Widest a little past halfway and closing to a point at both ends, which is
  // a leaf rather than a petal — and built a fifth wider than that, because
  // the margin is eaten back out of it in the fragment stage. A leaf that has
  // been down since last autumn has no straight edge left anywhere on it, and
  // seven rows of quad cannot say so at any price; a profile cut per pixel can,
  // and it costs nothing at the ranges where it would only be a shimmer.
  float hw = 0.5 * ${MARGIN.toFixed(5)} * sin(3.14159265 * pow(v, 0.82)) * iLie.y;
  float x = w * hw;
  float z = v - 0.5;

  // The channel, which opens toward the tip the way a drying leaf does, and
  // the buckle along the length, which lifts both ends off the floor. Between
  // them they are why a leaf lying dead flat is invisible from a camera ten
  // centimetres up and one of these is not: something is always turned toward
  // you.
  float cup = iCurl.x * (0.4 + 0.6 * v);
  float y = cup * hw * w * w + iCurl.y * (z * z - 0.0833);

  // Slopes of that surface, for the shading. Analytic rather than differenced
  // between neighbours — the mesh is six quads and a difference across one of
  // them is the average of half the leaf.
  vec3 n = normalize(vec3(-2.0 * cup * w, 1.0, -2.0 * iCurl.y * z));

  // Wrung about its own length, which is what stops the two halves of a leaf
  // ever facing the same way.
  float ph = iCurl.z * (v - 0.5);
  float cf = cos(ph);
  float sf = sin(ph);
  vec3 p = vec3(cf * x - sf * y, sf * x + cf * y, z);
  n = vec3(cf * n.x - sf * n.y, sf * n.x + cf * n.y, n.z);

  p = lie(p * iLie.x, iLie.w, iLie.z, iPose.zw);
  n = lie(n, iLie.w, iLie.z, iPose.zw);

  // The soil surface, looked up in the same field the ground itself is drawn
  // from rather than carried in from the CPU. The floor heaps by a couple of
  // centimetres around the plant and a leaf is eight across: an agreed height
  // that is a centimetre out buries half the fall, which is the one thing this
  // family cannot survive.
  vec3 world = vec3(
    iPose.x + p.x,
    soilHeight(iPose.xy, uPond) + iCurl.w + p.y,
    iPose.y + p.z);

  vUv = vec2(w * 0.5 + 0.5, v);
  vSkin = iSkin;
  vFace = clamp(n.y, 0.0, 1.0);

  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vNear = 1.0 - smoothstep(0.4, 1.3, -mvPosition.z);

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uLitter[5];
uniform vec3 uVein;
uniform vec3 uBleach;

varying vec2  vUv;
varying vec3  vSkin;
varying float vFace;
varying float vNear;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

void main() {
  float tone = vSkin.x;
  int which = int(floor(tone * 5.0));
  vec3 col = uLitter[0];
  for (int i = 1; i < 5; i++) if (i == which) col = uLitter[i];

  float wide = abs(vUv.x - 0.5) * 2.0;
  float prof = ${(1 / MARGIN).toFixed(5)};

  if (vNear > 0.002) {
    /*
     * What is left of the edge.
     *
     * The blade rots inward from the margin: it goes ragged first, then it
     * tears, then it goes through. Three beats with no common period, phased on
     * the leaf's own tone, so the sixteen thousand of them are sixteen thousand
     * outlines — the point is not that any one of them is right but that no two
     * of them are the same, which is what a straight-edged card can never be.
     */
    float v = vUv.y;
    float ph = tone * 60.0;
    float rag = 0.5 * sin(v * 13.0 + ph)
              + 0.3 * sin(v * 31.0 - ph * 1.7)
              + 0.2 * sin(v * 67.0 + ph * 0.7);
    float cut = ${(1 / MARGIN).toFixed(5)} + 0.15 * rag;

    // A bite out of one side. Which quarter of the leaf, which side and
    // whether there is one at all are a hash of the leaf's own tone, so it
    // costs no attribute and no lookup.
    float seg = floor(v * 4.0);
    float bh = fract(sin(seg * 23.13 + ph) * 43758.5453);
    float side = step(0.5, fract(bh * 17.0)) * 2.0 - 1.0;
    float notch = step(0.78, bh)
                * step(0.0, side * (vUv.x - 0.5))
                * (1.0 - smoothstep(0.0, 0.32, abs(fract(v * 4.0) - 0.5)));
    cut -= notch * 0.78;

    prof = mix(prof, cut, vNear);

    /*
     * ...and holes through the middle of it, on the ones that have been under
     * the rest of the fall long enough to rot rather than dry.
     *
     * Three sines rather than two, and none of the three at a period the others
     * share. Two of them cross into a lattice — evenly spaced round holes, which
     * is a colander and not a leaf — and the third, at an angle across the
     * first two, is what turns the lattice into a scatter. The whole thing is
     * then gated on a slow field so the holes come in a patch on one part of
     * the blade rather than all over it, because rot spreads from where the
     * leaf was wet.
     */
    float rot = clamp(vSkin.z * 1.7 + (1.0 - smoothstep(0.45, 1.0, vSkin.y)) * 0.6, 0.0, 1.0);
    float bore = sin(vUv.x * 23.0 + ph)
               * sin(v * 17.0 - ph * 1.3)
               * sin((vUv.x * 9.0 + v * 13.0) * 1.7 + ph * 0.6);
    float wet = 0.5 + 0.5 * sin(v * 5.0 + vUv.x * 3.0 - ph * 0.9);
    // Eaten inward from the margin, which is where a leaf goes first.
    float reach = 0.45 + 0.55 * wide;
    if (bore * wet * reach > mix(2.0, 0.5 - 0.34 * rot, vNear)) discard;
  }

  if (wide > prof) discard;

  // Across the blade, measured against whatever edge is left rather than
  // against the quad — a dry margin has to sit on the margin.
  float across = clamp(wide / max(prof, 0.001), 0.0, 1.0);

  // The veins. The midrib is what stops a leaf reading as a chip of card; the
  // laterals running out of it are what a leaf has instead of a colour when
  // there is nothing else left of it, and they are the difference between one
  // that has been down a fortnight and one that has been down a winter.
  float lat = abs(fract(vUv.y * 9.0 - across * 2.4) - 0.5) * 2.0;
  float veins = (1.0 - smoothstep(0.0, 0.36, lat)) * smoothstep(0.05, 0.3, across);
  float rib = 1.0 - smoothstep(0.0, 0.17, across);
  col = mix(col, uVein, max(rib, veins * mix(0.28, 0.9, vSkin.z)));

  // Gone to skeleton: the blade between the veins has rotted out to a pale
  // wash and only the frame of it is still leaf.
  col = mix(col, uBleach, vSkin.z * (1.0 - veins) * 0.5);

  // A dry margin, curled tighter and gone darker than the middle of the blade.
  col *= mix(1.0, 0.6, smoothstep(0.58, 1.0, across));

  // One wet blotch per leaf, keyed off its own tone so it costs no attribute.
  vec2 blot = vec2(fract(tone * 53.0), fract(tone * 91.0));
  col *= mix(1.0, 0.46, 1.0 - smoothstep(0.0, 0.3, length(vUv - blot)));

  // Grain. The soil act reads a leaf from a hand's width away, and at that
  // range a blade filled with one colour is a piece of moulded plastic. Two
  // sines beating against each other rather than a noise lookup: it is a
  // sixteen-thousand-instance draw and the pattern is on a surface that is
  // curled, turned and a different size every time, so nobody can see that it
  // repeats.
  float mottle = sin(vUv.x * 37.0 + vUv.y * 61.0 + tone * 30.0)
               * sin(vUv.y * 43.0 - vUv.x * 29.0 + tone * 17.0);
  col *= 1.0 + 0.11 * mottle;

  // Under a canopy, rained on since it came down, and lying on its back or its
  // side. The facet term is the same one the stones use — a top stop for what
  // little light reaches the floor and a much darker one for anything turned
  // away — and without it a curled leaf is a curled shape filled in flat,
  // which is exactly what the curl was bought to stop.
  col *= vSkin.y * mix(0.5, 1.1, vFace * vFace);

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

/** How many clods the machine can spare — twenty faces each, in one draw. */
const CLODS: Record<string, number> = { low: 800, medium: 1900, high: 3400 };

/**
 * The broken ground under the litter.
 *
 * It belongs to this file rather than to the ground because it is the same
 * argument the leaves are: what a floor needs at twenty centimetres is objects
 * with edges, not a better fill. It rides the stone material from three/soil.ts
 * unchanged — earth and stone differ in colour and in how flat they lie, and
 * both of those are uniforms and attributes.
 */
function Clods({ biome }: { biome: Biome }) {
  const { geometry } = useMemo(
    () => scatterClods(CLODS[quality()], Boolean(biome.pond)),
    [biome],
  );

  const uniforms = useMemo(() => {
    const [dark, lit] = biome.pond
      ? [biome.pond.silt[0], biome.pond.silt[1]]
      : [HEX.soil, HEX.soilLit];
    return withFog({
      uPond: { value: biome.pond ? 1 : 0 },
      // In the same key as the floor it is part of, and a narrow key at that.
      // A clod is made of the ground; the only thing that should separate it
      // from the ground is which way its facets point, which is the material's
      // own term. Pitched darker than this they stop being earth and become
      // chips of slate lying on earth — which is what the first pass of them
      // was, and reads as gravel scattered over a photograph.
      uDark: { value: new Color(dark) },
      uLit: { value: new Color(lit).lerp(new Color(biome.groundFar), 0.28) },
      uMoss: { value: new Color(biome.deep).multiplyScalar(0.5) },
    });
  }, [biome]);

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={LITTER_VERT}
        fragmentShader={LITTER_FRAG}
        uniforms={uniforms}
        fog
        dithering
      />
    </mesh>
  );
}

export default function Litter({ biome }: { biome: Biome }) {
  const spec = biome.fronds!;

  const geometry = useMemo(() => {
    const leaves = fallenLeaves(COUNT[quality()], biome);
    const n = leaves.length;
    const geo = leafGeometry();

    const pose = new Float32Array(n * 4);
    const lie = new Float32Array(n * 4);
    const curl = new Float32Array(n * 4);
    const skin = new Float32Array(n * 3);
    leaves.forEach((l, i) => {
      pose[i * 4] = l.x;
      pose[i * 4 + 1] = l.z;
      pose[i * 4 + 2] = Math.cos(l.yaw);
      pose[i * 4 + 3] = Math.sin(l.yaw);
      lie[i * 4] = l.size;
      lie[i * 4 + 1] = l.slender;
      lie[i * 4 + 2] = l.pitch;
      lie[i * 4 + 3] = l.roll;
      curl[i * 4] = l.cup;
      curl[i * 4 + 1] = l.buckle;
      curl[i * 4 + 2] = l.twist;
      curl[i * 4 + 3] = l.lift;
      skin[i * 3] = l.tone;
      skin[i * 3 + 1] = l.shade;
      skin[i * 3 + 2] = l.bleach;
    });

    geo.setAttribute("iPose", new InstancedBufferAttribute(pose, 4));
    geo.setAttribute("iLie", new InstancedBufferAttribute(lie, 4));
    geo.setAttribute("iCurl", new InstancedBufferAttribute(curl, 4));
    geo.setAttribute("iSkin", new InstancedBufferAttribute(skin, 3));
    geo.instanceCount = n;
    geo.boundingSphere = new Sphere(new Vector3(0, 0, -1.5), 12);
    return geo;
  }, [biome]);

  const uniforms = useMemo(() => {
    // The array is a fixed five, so a biome that offers fewer repeats and one
    // that offers more is trimmed — a shader cannot be sized from data.
    const litter = Array.from(
      { length: 5 },
      (_, i) => new Color(spec.litter[i % spec.litter.length]),
    );
    // What is left of a leaf that has been under the rest of them all winter,
    // taken off the biome's own stops rather than named: the same brown with
    // the colour washed out of it. A hand-picked grey here would be one more
    // colour the picker does not own.
    //
    // Not *lifted*, which is what it looked like it wanted. A rotted leaf is
    // grey because it has lost its pigment, not because it has gained any
    // light, and the first version of this put a stop half again as bright as
    // the litter it came from into a scene whose whole rule is that nothing
    // averages brighter than a mid-dark green — one skeletal leaf lying flat a
    // hand's width from the lens was the palest thing in the soil act by a
    // wide margin, and read as a sheet of plastic on the floor.
    const hsl = { h: 0, s: 0, l: 0 };
    litter[0].getHSL(hsl);
    const bleach = new Color().setHSL(hsl.h, hsl.s * 0.35, Math.min(0.27, hsl.l));
    return withFog({
      uPond: { value: biome.pond ? 1 : 0 },
      uLitter: { value: litter },
      uVein: { value: new Color("#241408") },
      uBleach: { value: bleach },
    });
  }, [biome, spec]);

  return (
    <group>
      <Clods biome={biome} />
      <mesh geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          side={DoubleSide}
          fog
          dithering
        />
      </mesh>
    </group>
  );
}
