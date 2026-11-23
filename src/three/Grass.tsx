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
import { highlight, litTip } from "@/lib/timeOfDay";
import { pointer } from "@/lib/pointer";
import { scrollState } from "@/lib/scroll";
import { plantField } from "./field";
import { PART_GLSL, partedAt } from "./parting";
import { BANK_GLSL, BANK_LIGHT_GLSL, NOISE_GLSL, SHORE_LIGHT } from "./pond";
import { CLUMPS, quality, reducedMotion } from "./quality";
import { SUNLIGHT_GLSL, SUN_RAMP, SUN_STRENGTH } from "./sunlight";
import { GROWTH_GLSL, growth } from "./growth";
import { CLEARING_GLSL, clearing } from "./clearing";
import { swayGrid } from "./swayGrid";
import { withFog } from "./uniforms";
import Wildflowers from "./Wildflowers";

/**
 * The field.
 *
 * This is the DOM site's grass rebuilt with real geometry: fat tapered blades
 * in fanned clumps, filled flat in one body colour with a lit sliver up the top
 * half of the spine. There is deliberately no shading model — no diffuse term,
 * no specular, no normal, nothing that answers a light. A blade's colour is
 * decided when it is planted and never changes, and that is what makes the
 * field read as drawn rather than rendered. It is the single biggest reason
 * this scene can sit under the same wordmark as the 2D one.
 *
 * The pool of sun (three/sunlight.ts) does not break that. It is a scalar field
 * over the ground, sampled once per blade at its own root, and all it decides
 * is which end of that blade's ramp it was planted at — colour still comes from
 * where a thing is standing and never from how it is turned. Sampling at the
 * root rather than per pixel is what buys the reference photograph's one real
 * effect: a blade is wholly in the light or wholly out of it, so the boundary
 * of the pool is thousands of individually lit blade edges standing against
 * darker neighbours instead of a soft glow laid over grass.
 *
 * Blades are about a thirteenth as wide as they are tall. That ratio is the
 * whole look: at a hundredth they are hairs, and a field of hairs is a texture
 * rather than a place.
 */

/**
 * One blade: y from 0 at the root to 1 at the tip, tapered to a point, with
 * enough segments along its length to take the arc without faceting.
 */
function bladeGeometry(segments: number) {
  const rows = segments + 1;
  const positions = new Float32Array(rows * 2 * 3);
  const uvs = new Float32Array(rows * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < rows; i++) {
    const v = i / segments;
    // Broad most of the way up and closing to a point in the last fifth. A
    // taper that starts at the root gives a spike rather than a blade.
    const w = (1 - 0.3 * v) * Math.sqrt(Math.max(0, 1 - Math.pow(v, 6)));
    const o = i * 6;
    positions[o] = -w;
    positions[o + 1] = v;
    positions[o + 2] = 0;
    positions[o + 3] = w;
    positions[o + 4] = v;
    positions[o + 5] = 0;
    const u = i * 4;
    uvs[u] = 0;
    uvs[u + 1] = v;
    uvs[u + 2] = 1;
    uvs[u + 3] = v;
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("uv", new BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

const VERT = /* glsl */ `
attribute vec3  iPos;      // root, in metres
attribute vec4  iShape;    // height, half-width, facing, lean
attribute vec4  iStyle;    // curve, phase, tone, which tip colour
attribute vec2  iMark;     // off-colour or not, and how deep in the shade
attribute vec2  iLay;      // how far it goes over for the camera, and which way

uniform float uTime;
uniform float uWind;
uniform float uPart;       // how far open the parting is, 0..1
uniform sampler2D uSway;   // the cursor spring, one texel per grid cell
uniform vec2  uSwayOrigin; // its near corner, in metres
uniform float uSwayScale;  // metres to 0..1 across it
uniform float uSwayAmp;    // what a full-scale texel decodes to
uniform float uSun;        // how much of the pool this biome takes, 0..1
uniform float uGrow;       // the biome changeover, 0..1

varying vec2  vUv;
varying float vTone;
varying float vLitB;
varying float vRare;
varying float vShade;
varying float vSun;
varying float vFleck;
varying vec3  vWorld;

#include <fog_pars_vertex>

${PART_GLSL}
${SUNLIGHT_GLSL}
${GROWTH_GLSL}
${CLEARING_GLSL}

void main() {
  float t = uv.y;
  float h = iShape.x;
  float halfW = iShape.y;

  /*
   * Coming up, on a biome change.
   *
   * Height and width, not a uniform scale on the finished blade: a blade scaled
   * about its root keeps its full arc the whole way up and reads as a picture
   * of grass being zoomed, where a short blade that is also a narrow one reads
   * as a blade that has not finished growing. The arc below is solved from the
   * height, so shortening it here means a half-grown blade bends through a
   * blade's arc for free.
   */
  float grow = growAt(uGrow, growStagger(iPos.xz));
  // The opening clearing: gone back into the ground (three/clearing.ts).
  grow *= 1.0 - clearingCut(iPos.xz, iShape.x);
  h *= grow;
  halfW *= mix(0.45, 1.0, grow);
  float facing = iShape.z;
  float lean = iShape.w;
  float curve = iStyle.x;
  float phase = iStyle.y;

  // Ambient sway: one gust crossing the whole field, plus this blade's own
  // flutter on a frequency that is deliberately not a multiple of it, so the
  // field never pulses in unison.
  float gust = sin(uTime * 0.5 - iPos.z * 0.28 + iPos.x * 0.17);
  float flutter = sin(uTime * 1.9 + phase) * 0.45 + sin(uTime * 3.1 + phase * 1.7) * 0.2;
  float bend = lean + uWind * (0.16 * gust + 0.09 * flutter);

  // The cursor, laid over the top. The falloff, the push and the gust all
  // live in three/sway.ts now — a spring per grid cell, solved on the CPU,
  // arriving here as a texture — so all a blade does is look up where it is
  // standing. That indirection is the point: a field that only answers where
  // the cursor is *now* snaps, and a spring lays over, overshoots and rings
  // back the way the DOM site's does.
  vec2 g = (iPos.xz - uSwayOrigin) * uSwayScale;
  bend += (texture2D(uSway, g).r * 255.0 - 127.0) * uSwayAmp;

  // Bend as an arc: the tip travels, the root does not, and the blade keeps
  // its length instead of stretching.
  float k = bend;
  float y = h * (t - k * k * t * t * t / 6.0);
  float z = h * (k * t * t * 0.5);
  // The spine's own sideways arc, so a fan of blades is a fan of curves.
  float x = position.x * halfW + curve * h * t * t;

  vec3 p = vec3(x, y, z);
  float s = sin(facing);
  float c = cos(facing);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);

  // The parting. A few hundred blades stand where the camera puts its lens or
  // its sight line once it is down among them, and each of those was told at
  // plant time how far it would have to go over and which way — see
  // three/parting.ts. All that is left here is when: the whole corridor lays
  // over as the camera comes down through it and stands back up behind it,
  // rather than never having grown, which is what used to leave a bald stripe
  // beside the flower in every frame of the acts spent looking at it.
  p = layOver(p, iLay.x * uPart, iLay.y);
  p += iPos;

  vUv = uv;
  vTone = iStyle.z;
  vLitB = iStyle.w;
  vRare = iMark.x;
  vShade = iMark.y;
  vWorld = p;

  // The pool, read at the root and not at the pixel. Where a blade is rooted
  // is a fact about the blade, so the whole of it takes one answer: it stands
  // in the light or it stands beside it. That is the difference between a field
  // with light on it and a field with light in it.
  float sun = sunPool(iPos.xz) * uSun;
  // ...and each one takes its own share, off the phase it was planted with.
  // Without this the edge of the pool is a gradient the eye reads as a soft
  // shape laid over the canopy; with it, it is a thousand separate decisions
  // and what you see is blades.
  sun *= 0.62 + 0.5 * (0.5 + 0.5 * sin(phase * 7.0 + iPos.x * 3.7));

  /*
   * ...and the fleckwork, which is the pool's argument taken one step further.
   *
   * A pool is a gap in the canopy and a fleck is the canopy leaking, and this
   * is where the second one has to be turned into blades: the mask is a patch a
   * hand across, and a hand across is several blades. Left as it comes it lights
   * every blade in the patch and the patch is a soft bright smudge — which is
   * exactly the flat wall a pool at the plant's foot produced, only smaller.
   * A third of the blades standing in one take it and the rest do not, chosen
   * off the same planted phase as everything else here, and what comes out is
   * one blade lit against three that are not.
   *
   * That is the whole answer for the acts shot from inside the field, where
   * there is no far field to light and nothing in frame is more than a metre
   * away. Range, rather than exposure.
   */
  float pick = 0.5 + 0.5 * sin(phase * 11.3 + iPos.x * 4.7 + iPos.z * 6.1);
  vFleck = sunFleckwork(iPos.xz) * step(0.68, pick) * uSun;
  vSun = sun;

  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

/**
 * The fragment stage, with the water optionally in it.
 *
 * Only one biome has a waterline, and the light coming off it is two noise
 * lookups and a copy of the bank's own geometry — so it is compiled in for the
 * pond and simply absent from the other three rather than sitting behind a
 * uniform they all pay to branch on.
 */
function frag(pond: boolean) {
  return /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uBright;
uniform vec3 uLitA;
uniform vec3 uLitB;
uniform vec3 uRareCol;
uniform vec3 uSunWarm;
uniform vec3 uSunFace;
uniform vec3 uSunHot;
uniform float uSunOn;
uniform vec3 uWaterSun;
uniform float uTime;

varying vec2  vUv;
varying float vTone;
varying float vLitB;
varying float vRare;
varying float vShade;
varying float vSun;
varying float vFleck;
varying vec3  vWorld;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

${pond ? `${BANK_GLSL}\n${NOISE_GLSL}\n${BANK_LIGHT_GLSL}` : ""}

void main() {
  // Flat fill. One colour per blade, decided when it was planted.
  vec3 body = mix(mix(uDeep, uRareCol, vRare), uBright, vTone);

  /*
   * How much light is on this blade: the pool it is standing in, or the fleck
   * that found it, whichever is more.
   *
   * The two differ in where up the blade they land, and that difference is the
   * whole reason the fleckwork can exist at all. A pool is a hole in the canopy
   * and lights a blade end to end. A fleck is the canopy leaking, so what it
   * reaches is what is *under* the canopy — the lower half of a stand, never
   * its tips.
   *
   * Which sorts the two cameras out between them without either of them being
   * named here. From three metres up the first act is looking at the tops of
   * the canopy, so it sees almost none of this and the near-white type keeps
   * the dark backdrop it is measured against. From a hand's width off the soil
   * the last three acts are looking *through* the canopy at its shaded inside,
   * where every fleck there is, is. Same field, opposite answers, and the only
   * thing deciding it is which part of a blade you can see.
   */
  float sun = max(vSun, vFleck * (1.0 - smoothstep(0.40, 0.88, vUv.y)));

  /*
   * ...and which half of the ramp it was planted in.
   *
   * The biome's two body stops are the *shade*; the pool carries its own. A
   * blade standing in the light is mixed toward them by how much of the light
   * is there and by how far up its own ramp it already sat, so the understory —
   * which is planted dark because it is under everything else — stays dark
   * inside the pool. Grass in sun is not grass with a lamp on it; it is a
   * different green, and the darker plant beside it is still the darker plant.
   */
  float lit = smoothstep(0.0, 0.66, sun) * (0.55 + 0.45 * vTone);

  /*
   * ...and how much of the field's own shade it is standing in, before any of
   * that.
   *
   * The two body stops are a ramp of *colour*, and a ramp of colour has a floor
   * — the darkest blade in a field planted from it is still the biome's own
   * deep, which is a green you can read. What a meadow actually has, and what
   * the reference photograph has in its corners, is blades that are behind
   * three other blades and are therefore very nearly black. That is not a stop
   * on a ramp, it is an exposure, so it is a multiply.
   *
   * Rolled per blade at plant time — see Blade.shade in field.ts — so one goes dark
   * and its neighbour does not, which is the same contract everything else in
   * this shader keeps. It applies to the *unlit* half only: light standing on a
   * blade is light standing on it whatever was over it a moment before, and a
   * pool of sun with the same pepper of black through it is a dirty pool rather
   * than a bright one.
   *
   * Off entirely on the biomes with no pool. A forest is not a meadow with the
   * lights off and must not become one because the meadow got its contrast.
   */
  body *= mix(1.0, mix(vShade, 1.0, smoothstep(0.0, 0.5, sun)), uSunOn);

  body = mix(body, uSunWarm, lit);
  body = mix(body, uSunFace, smoothstep(0.55, 1.0, sun) * vTone * 0.6);

  // The lit sliver: a narrow band up the middle of the top half, feathered at
  // both ends. On the DOM site this is a second, thinner shape drawn over the
  // blade; here it is the same two stops done in one pass.
  //
  // Gated on the pool, which is what makes the field sparkle only where the
  // light is. Ungated it is an even glitter over the whole canopy and reads as
  // a material property of grass; gated, it is the reference photograph's
  // hundreds of separately lit edges, and everything outside the pool keeps its
  // spine as the faint crease it is in shade.
  vec3 slice = mix(mix(uLitA, uLitB, vLitB), uSunFace, sun * 0.8);
  // A blade in the deep of the canopy has no lit spine either — it is the same
  // exposure, and leaving the sliver out of it puts a bright crease up the
  // middle of every near-black blade, which is the one shape that gives away
  // that the dark is painted on rather than absent.
  slice *= mix(1.0, mix(vShade, 1.0, smoothstep(0.0, 0.5, sun)), uSunOn);
  float spine = 1.0 - smoothstep(0.02, 0.19, abs(vUv.x - 0.5));
  float up = smoothstep(0.46, 0.68, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
  // ...and the gate itself folds away on a biome with no pool, back to the flat
  // 0.6 the sliver has always been. A forest is not a meadow with the lights
  // off, and it must not become one because the meadow got a sun.
  // The floor comes down, the pool's own share does not.
  //
  // 0.24 was what a blade standing *outside* the light still put up its spine,
  // and across a field that is most of the blades — so the meadow was carrying
  // a bright green sliver on thousands of stalks that are, by construction, in
  // shade. It reads as the whole field being faintly lit, which is the exact
  // thing the pool exists to avoid: what should separate a lit blade from an
  // unlit one is not how much brighter it is, it is that the unlit one has no
  // highlight at all. The gain on the pool term is raised to keep lit blades where
  // they were now that they are starting from lower down.
  vec3 col = mix(body, slice, spine * up * mix(0.6, 0.13 + 0.74 * sun, uSunOn));

  // The few tips that are nearly white. A hand's worth of pixels in the whole
  // frame — the reference has them and they are most of what says *sun* rather
  // than *bright* — so they are kept to the last centimetre of a blade that is
  // both standing in the deepest part of the pool and was planted at the top of
  // its own ramp.
  col = mix(col, uSunHot,
    smoothstep(0.74, 1.0, sun) * smoothstep(0.6, 0.95, vTone)
      * spine * smoothstep(0.62, 0.93, vUv.y) * 0.85);

  // The root end sits in the shade of everything standing around it.
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.3, vUv.y));

${
  pond
    ? /* glsl */ `
  // The water, on the one biome that has any: the broken sun coming off the
  // surface crosses the bottom of every stem near the edge, the same lines it
  // is drawing on the mud they are standing in. From four chapters spent down
  // among these, that moving light is the pond — the surface itself is behind
  // the bank and there is no camera angle that reaches it.
  //
  // The foot of a stem rather than a height in metres, because the fringe is
  // cut to every length there is and a fixed height washes the short ones from
  // root to tip. A low sun off a surface arrives almost horizontally: it lights
  // the first metre of bank, and on what is standing in it, only the part that
  // is standing in it. Squared, because what it throws are lines and not a
  // wash — the wide version of this reads as an ordinary lamp, and there is no
  // lamp anywhere in this scene.
  float toWater = vWorld.z - bankEdgeZ(vWorld.x);
  float reach =
    (1.0 - smoothstep(0.0, ${SHORE_LIGHT.toFixed(5)}, toWater)) *
    (1.0 - smoothstep(0.06, 0.42, vUv.y));
  float band = bankLight(vec2(vWorld.x, vWorld.z + vWorld.y * 1.6), uTime);
  col += uWaterSun * band * band * reach * 0.3;
`
    : ""
}
  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;
}

export default function Grass({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const calm = reducedMotion();
  const wind = calm ? 0.25 : 1;

  const sway = swayGrid();
  const fragment = useMemo(() => frag(biome.pond != null), [biome]);

  const geometry = useMemo(() => {
    const { blades } = plantField(CLUMPS[quality()], biome);
    const n = blades.length;
    const geo = bladeGeometry(7);

    const pos = new Float32Array(n * 3);
    const shape = new Float32Array(n * 4);
    const style = new Float32Array(n * 4);
    const mark = new Float32Array(n * 2);
    const lay = new Float32Array(n * 2);

    blades.forEach((b, i) => {
      pos[i * 3] = b.x;
      pos[i * 3 + 1] = b.y;
      pos[i * 3 + 2] = b.z;
      shape[i * 4] = b.height;
      shape[i * 4 + 1] = b.halfWidth;
      shape[i * 4 + 2] = b.facing;
      shape[i * 4 + 3] = b.lean;
      style[i * 4] = b.curve;
      style[i * 4 + 1] = b.phase;
      style[i * 4 + 2] = b.tone;
      style[i * 4 + 3] = b.litB;
      mark[i * 2] = b.rare;
      mark[i * 2 + 1] = b.shade;
      lay[i * 2] = b.lay;
      lay[i * 2 + 1] = b.bearing;
    });

    geo.setAttribute("iPos", new InstancedBufferAttribute(pos, 3));
    geo.setAttribute("iShape", new InstancedBufferAttribute(shape, 4));
    geo.setAttribute("iStyle", new InstancedBufferAttribute(style, 4));
    geo.setAttribute("iMark", new InstancedBufferAttribute(mark, 2));
    geo.setAttribute("iLay", new InstancedBufferAttribute(lay, 2));
    geo.instanceCount = n;
    // The field is generated, so nothing can compute a useful bound for it.
    geo.boundingSphere = new Sphere(new Vector3(0, 0.3, -1.5), 16);
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
        uDeep: { value: new Color(biome.deep) },
        uBright: { value: new Color(biome.bright) },
        uLitA: { value: new Color(biome.litA) },
        uLitB: { value: new Color(biome.litB) },
        uRareCol: { value: new Color(biome.rare) },
        uSun: { value: SUN_STRENGTH[biome.id] ?? 0 },
        uSunOn: { value: SUN_STRENGTH[biome.id] ?? 0 },
        uSunWarm: { value: new Color(SUN_RAMP.warm) },
        uSunFace: { value: new Color(SUN_RAMP.face) },
        uSunHot: { value: new Color(SUN_RAMP.hot) },
        uWaterSun: { value: new Color(biome.pond?.sun ?? "#000000") },
        uGrow: { value: 1 },
        uClearOpen: { value: 0 },
        uClearK: { value: 0 },
        uClearZ: { value: 0 },
        uClearHZ: { value: 0 },
      }),
    [biome, wind, sway],
  );

  const baseTips = useMemo(() => ({ a: new Color(biome.litA), b: new Color(biome.litB) }), [biome]);

  useFrame((_, dt) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value += dt;
    m.uniforms.uGrow.value = growth();
    m.uniforms.uClearOpen.value = clearing.open;
    m.uniforms.uClearK.value = clearing.k;
    m.uniforms.uClearZ.value = clearing.z;
    m.uniforms.uClearHZ.value = clearing.hz;
    // The light's colour on the grass, for the time of day.
    highlight("warm", m.uniforms.uSunWarm.value);
    highlight("face", m.uniforms.uSunFace.value);
    highlight("hot", m.uniforms.uSunHot.value);
    litTip(baseTips.a, m.uniforms.uLitA.value);
    litTip(baseTips.b, m.uniforms.uLitB.value);
    // The damped chapter, not the raw one: the parting is a thing the camera
    // does to the grass in front of it, so it has to travel with the camera and
    // not with the scrollbar.
    m.uniforms.uPart.value = partedAt(scrollState.smooth);
    // The rig has already put the pointer on the canopy plane this frame, so
    // the spring is stepped here and nowhere else.
    if (!calm) sway.step(pointer, dt);
  });

  return (
    <>
      <mesh geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          vertexShader={VERT}
          fragmentShader={fragment}
          uniforms={uniforms}
          side={DoubleSide}
          fog
          dithering
        />
      </mesh>
      {/* What is growing in the grass comes with the grass. It is planted off
          the same field, keyed by the same biome and killed by the same
          absence — a biome with no `wildflowers` draws nothing — so there is
          nowhere for the two to get out of step. Scene.tsx would be the tidier
          home for it if it ever grows a second consumer. */}
      <Wildflowers biome={biome} />
    </>
  );
}
