import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";
import type { Biome } from "@/lib/biomes";
import { FLOWER } from "@/lib/flowerLayout";
import { makeRandom } from "@/lib/math";
import { nightness } from "@/lib/timeOfDay";
import { petalGeometry } from "./geometry";
import { quality, reducedMotion } from "./quality";
import { withFog } from "./uniforms";

/**
 * Petals coming loose and going over the canopy.
 *
 * They are in the biome's own accent colours, because what falls has to be
 * recognisably what is growing — the meadow sheds the gold and orange of the
 * flowers standing in it, the forest sheds a turning leaf. They fall on a lazy
 * spiral and wrap rather than being respawned, so there is no moment where one
 * of them blinks.
 *
 * One draw for all of them, and the fall is solved in the vertex shader off
 * nothing but the clock and each petal's own seed. It used to be a mesh and a
 * material each, walked on the CPU once a frame, which is a fine arrangement
 * for eighteen of them and the reason there were only ever eighteen: weather
 * that reads as weather needs four or five times that, and eighteen draw calls
 * becoming ninety is not a trade this scene can make for confetti.
 *
 * Which accents come up how often is the biome's business — see `accentMix`.
 * A uniform draw over the meadow's five put two petals in five in a lilac or a
 * cornflower blue, and the page's brand contract has two accents in it.
 */

/**
 * How many. Four or five times what there were, which is the difference
 * between a scene with weather in it and a scene with a few petals in it — and
 * held there rather than pushed further, because a petal's pale edge is one of
 * the few things in this palette allowed anywhere near white and eighty of them
 * in the air is already as much of that as the hero type can sit on.
 */
const COUNT: Record<string, number> = { low: 24, medium: 52, high: 80 };

/** How far one petal falls before it wraps, and how far it wanders doing it. */
const FALL = 1.25;
const WANDER = 0.12;

const VERT = /* glsl */ `
attribute vec4 iSeed;    // x, base y, z, drift rate
attribute vec3 iSpin;    // scale, spin rate, phase
attribute vec3 iInner;
attribute vec3 iOuter;

uniform float uTime;

varying vec2 vUv;
varying vec3 vInner;
varying vec3 vOuter;
varying float vBack;

#include <fog_pars_vertex>

mat3 rot(vec3 a) {
  float sx = sin(a.x), cx = cos(a.x);
  float sy = sin(a.y), cy = cos(a.y);
  float sz = sin(a.z), cz = cos(a.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
  return rz * ry * rx;
}

void main() {
  float drift = iSeed.w;
  float spin = iSpin.y;
  float phase = iSpin.z;

  // Wrapped rather than respawned: a petal that reaches the floor is already
  // the next one leaving the canopy, so there is no frame in which one blinks.
  float fall = mod(uTime * 0.045 * drift + phase, 1.0) * ${FALL.toFixed(3)};

  vec3 at = vec3(
    iSeed.x + sin(uTime * 0.5 * drift + phase) * ${WANDER.toFixed(3)},
    iSeed.y + ${FALL.toFixed(3)} - fall,
    iSeed.z + cos(uTime * 0.37 * drift + phase) * ${WANDER.toFixed(3)}
  );

  mat3 turn = rot(vec3(
    sin(uTime * spin + phase) * 0.9,
    uTime * spin * 0.6,
    cos(uTime * spin * 0.8) * 0.7
  ));

  vec3 world = turn * (position * iSpin.x) + at;
  vec3 n = normalize(turn * normal);

  vUv = uv;
  vInner = iInner;
  vOuter = iOuter;

  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  // Which face of a tumbling petal is toward the lens. It is the only thing
  // this shader asks about direction, and it is asked for a graphic reason and
  // not a photographic one: see the fragment stage.
  vBack = step(0.0, dot(n, normalize(world - cameraPosition)));
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vInner;
varying vec3 vOuter;
varying float vBack;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

void main() {
  // Flat, like everything else growing in this field: two stops along the
  // petal's own length and nothing that answers a lamp. What a tumbling petal
  // needs is not shading but a change — so the far side of it is simply drawn
  // darker, which is what a petal seen from underneath is, and the flicker as
  // one turns over is the whole of its animation.
  vec3 col = mix(vInner, vOuter, smoothstep(0.05, 0.95, vUv.y));
  // Ribs down its length. Invisible at a distance, and the reason one crossing
  // the frame a hand's width from the lens does not read as a chip of plastic.
  col *= 1.0 - 0.14 * (sin(vUv.x * 46.0) * 0.5 + 0.5) * smoothstep(0.05, 0.4, vUv.y);
  col *= mix(1.0, 0.62, vBack);

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

export default function Drift({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const count = COUNT[quality()] ?? 60;
  const calm = reducedMotion();

  const geometry = useMemo(() => {
    // Coarser than the flower's own petals: one of these is a few dozen pixels
    // at its very nearest, and the sheet it is cut from is the thing being paid
    // for a hundred times over.
    const shape = petalGeometry({
      length: 0.036,
      width: 0.02,
      cup: 0.32,
      curl: 0.42,
      tip: 0.7,
      nu: 12,
      nv: 6,
    });

    const geo = new InstancedBufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const a = shape.getAttribute(name) as BufferAttribute;
      geo.setAttribute(name, new BufferAttribute(a.array as Float32Array, a.itemSize));
    }
    geo.setIndex(Array.from(shape.getIndex()!.array));
    shape.dispose();

    const rnd = makeRandom(551);
    const colors = biome.accents.map((hex) => new Color(hex));
    const outer = new Color("#fbf6ea");
    // A biome that says nothing about the mix gets an even one.
    const mix = biome.accentMix ?? biome.accents.map(() => 1);
    const total = mix.reduce((a, b) => a + b, 0);
    const draw = () => {
      let r = rnd() * total;
      for (let i = 0; i < mix.length; i++) {
        r -= mix[i];
        if (r <= 0) return i;
      }
      return mix.length - 1;
    };

    const seed = new Float32Array(count * 4);
    const spin = new Float32Array(count * 3);
    const inner = new Float32Array(count * 3);
    const outerAttr = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      seed[i * 4] = FLOWER.x + (rnd() - 0.5) * 6;
      seed[i * 4 + 1] = 0.15 + Math.pow(rnd(), 1.4) * 1.1;
      seed[i * 4 + 2] = FLOWER.z + 1.4 + (rnd() - 0.5) * 6;
      seed[i * 4 + 3] = 0.5 + rnd() * 0.8;
      spin[i * 3] = 0.7 + rnd() * 1.4;
      spin[i * 3 + 1] = (rnd() - 0.5) * 1.4;
      spin[i * 3 + 2] = rnd() * Math.PI * 2;
      colors[draw() % colors.length].toArray(inner, i * 3);
      outer.toArray(outerAttr, i * 3);
    }

    geo.setAttribute("iSeed", new InstancedBufferAttribute(seed, 4));
    geo.setAttribute("iSpin", new InstancedBufferAttribute(spin, 3));
    geo.setAttribute("iInner", new InstancedBufferAttribute(inner, 3));
    geo.setAttribute("iOuter", new InstancedBufferAttribute(outerAttr, 3));
    geo.instanceCount = count;
    // They move in the shader, so no bound computed off their rest positions
    // would survive the first frame.
    geo.boundingSphere = new Sphere(new Vector3(FLOWER.x, 0.8, FLOWER.z + 1.4), 8);
    return geo;
  }, [biome, count]);

  const uniforms = useMemo(() => withFog({ uTime: { value: 0 } }), []);

  const mesh = useRef<Mesh>(null);

  useFrame((_, dt) => {
    // The petals give way to fireflies after dark (three/Fireflies.tsx).
    if (mesh.current) mesh.current.visible = nightness() < 0.5;
    // Held at its first frame under reduced motion rather than not drawn: a
    // scene that loses a whole layer when the reader asks for less movement is
    // a different scene, not a calmer one.
    if (material.current && !calm) material.current.uniforms.uTime.value += dt;
  });

  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false}>
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
