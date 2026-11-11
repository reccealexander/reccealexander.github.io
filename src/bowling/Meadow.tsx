import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { HEX } from "@/lib/palette";
import { quality, reducedMotion } from "@/three/quality";
import { withFog } from "@/three/uniforms";
import { PIT_Z, WALL_X } from "./physics";

/**
 * The field the lane is laid through.
 *
 * Not the journey's grass — that one is planted around the flower and grows,
 * parts and lights itself by where the reader has scrolled to, none of which
 * means anything here. This is the same idea made small: tapered blades filled
 * flat from the meadow's own palette, no shading model, a lit sliver near the
 * tip, swaying in one slow wind. What is particular to the alley is the light:
 * the blades nearest the lane are warmed by the lamps along it, in pools that
 * fall where the posts stand, and the field goes back to dusk green past them.
 */

/** Where the lamps stand along each side of the lane. */
const POSTS_Z = [-0.4, -3.2, -6, -8.8];
const POST_X = WALL_X + 0.42;
const POST_H = 2.3;

/** The ground the grass grows from: a hand's breadth below the boards, so the
    lane reads as laid on the field rather than painted on it. */
const GROUND_Y = -0.1;

const COUNT = { low: 26000, medium: 52000, high: 80000 } as const;

/** Where grass may not grow: the lane and its approach, and the machine. */
function clear(x: number, z: number) {
  const ax = Math.abs(x);
  if (z > PIT_Z - 1.3 && z < 5.4 && ax < WALL_X + 0.16) return true;
  if (z < PIT_Z + 1.6 && z > PIT_Z - 1.4 && ax < WALL_X + 0.95) return true;
  return false;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function blade(segments: number) {
  const rows = segments + 1;
  const pos = new Float32Array(rows * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i < rows; i++) {
    const v = i / segments;
    const w = (1 - 0.3 * v) * Math.sqrt(Math.max(0, 1 - Math.pow(v, 6)));
    pos.set([-w, v, 0, w, v, 0], i * 6);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
attribute vec3 iPos;    // root
attribute vec4 iShape;  // height, half-width, facing, lean
attribute vec3 iStyle;  // tone, phase, tip

uniform float uTime;
uniform float uWind;
uniform vec3  uPosts;   // post x, first post z, spacing

varying float vT;
varying float vTone;
varying float vTip;
varying float vLamp;

#include <fog_pars_vertex>

void main() {
  float t = position.y;
  float h = iShape.x;

  // One wind across the whole field, rolling through it in long waves, with a
  // shiver of the blade's own on top.
  float wave = sin(uTime * 0.9 - iPos.x * 0.35 - iPos.z * 0.22);
  float gust = sin(uTime * 2.3 + iStyle.y * 6.283) * 0.3;
  float bend = iShape.w + uWind * (0.18 + 0.12 * wave + 0.05 * gust);

  // An arc: further over the higher up, shortening as it goes.
  vec3 p = vec3(position.x * iShape.y, t * h * (1.0 - 0.18 * bend * bend * t), bend * t * t * h);
  float c = cos(iShape.z), s = sin(iShape.z);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  // The wind leans everything the same way, whichever way the blade faces.
  p.x += uWind * (0.06 + 0.05 * wave) * t * t * h;

  vec3 world = iPos + p;

  // The lamps: brightest beside the lane, in a pool round each post.
  float side = abs(iPos.x) - uPosts.x;
  float along = mod(iPos.z - uPosts.y + uPosts.z * 0.5, uPosts.z) - uPosts.z * 0.5;
  vLamp = exp(-(side * side) / 0.9 - (along * along) / 1.6) + 0.25 * exp(-(side * side) / 0.4);

  vT = t;
  vTone = iStyle.x;
  vTip = iStyle.z;

  vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uBody;
uniform vec3 uBright;
uniform vec3 uLit;
uniform vec3 uRare;
uniform vec3 uLamp;

varying float vT;
varying float vTone;
varying float vTip;
varying float vLamp;

#include <fog_pars_fragment>

void main() {
  vec3 col = mix(uDeep, uBody, smoothstep(0.0, 0.55, vT) * (0.5 + 0.5 * vTone));
  col = mix(col, uBright, smoothstep(0.35, 1.0, vT) * vTone);
  col = mix(col, uRare, step(0.93, vTip) * 0.8);
  // The lit sliver near the tip.
  col = mix(col, uLit, smoothstep(0.72, 0.95, vT) * smoothstep(0.4, 1.0, vTip) * 0.75);
  // Warm lamplight, more on the upper blade than in the shade at its root.
  col += uLamp * vLamp * (0.2 + 0.8 * vT) * 0.16;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function Grass() {
  const { geo, mat } = useMemo(() => {
    const n = COUNT[quality()];
    const rnd = rng(20260202);
    const pos = new Float32Array(n * 3);
    const shape = new Float32Array(n * 4);
    const style = new Float32Array(n * 3);
    let i = 0;
    let guard = 0;
    while (i < n && guard++ < n * 6) {
      // Denser by the lane, where it is seen up close; thinning into the haze.
      const x = (rnd() * 2 - 1) * 15;
      const z = 7 - rnd() * 32;
      const d = Math.max(0, Math.abs(x) - WALL_X) + Math.max(0, -(z - PIT_Z)) * 0.6 + Math.max(0, z - 5) * 0.6;
      if (rnd() > Math.max(0.22, Math.exp(-d / 5))) continue;
      if (clear(x, z)) continue;
      // Shorter right at the lane's edge, as if the groundskeeper got that far.
      const edge = Math.min(1, Math.max(0, (Math.abs(x) - WALL_X - 0.16) / 0.9));
      const h = (0.16 + 0.34 * edge + rnd() * 0.26) * (0.85 + 0.3 * Math.min(1, d / 8));
      pos.set([x, GROUND_Y, z], i * 3);
      shape.set([h, 0.012 + rnd() * 0.01, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.7], i * 4);
      style.set([rnd(), rnd(), rnd()], i * 3);
      i++;
    }
    const g = blade(5);
    g.setAttribute("iPos", new InstancedBufferAttribute(pos.subarray(0, i * 3), 3));
    g.setAttribute("iShape", new InstancedBufferAttribute(shape.subarray(0, i * 4), 4));
    g.setAttribute("iStyle", new InstancedBufferAttribute(style.subarray(0, i * 3), 3));
    g.instanceCount = i;
    const m = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: DoubleSide,
      fog: true,
      uniforms: withFog({
        uTime: { value: 0 },
        uWind: { value: reducedMotion() ? 0 : 1 },
        uPosts: { value: new Vector3(POST_X, POSTS_Z[0], POSTS_Z[0] - POSTS_Z[1]) },
        uDeep: { value: new Color(HEX.grassDeep) },
        uBody: { value: new Color(HEX.grassBody) },
        uBright: { value: new Color(HEX.grassBright) },
        uLit: { value: new Color(HEX.grassLit) },
        uRare: { value: new Color(HEX.grassRare) },
        uLamp: { value: new Color("#ffc46b") },
      }),
    });
    return { geo: g, mat: m };
  }, []);

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

/** A scatter of small flowers through it, in the site's three warm colours. */
function Flowers() {
  const items = useMemo(() => {
    const rnd = rng(3141);
    const out: { p: [number, number, number]; c: string; s: number }[] = [];
    const colours = [HEX.bloom, HEX.ember, HEX.cream, HEX.bloom];
    while (out.length < 260) {
      const x = (rnd() * 2 - 1) * 9;
      const z = 6 - rnd() * 22;
      if (clear(x, z) || Math.abs(x) < WALL_X + 0.5) continue;
      out.push({
        p: [x, GROUND_Y + 0.28 + rnd() * 0.3, z],
        c: colours[Math.floor(rnd() * colours.length)],
        s: 0.018 + rnd() * 0.016,
      });
    }
    return out;
  }, []);
  return (
    <>
      {items.map((f, i) => (
        <mesh key={i} position={f.p} scale={[f.s, f.s * 0.55, f.s]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={f.c} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Lamp posts down both sides, with a string of bulbs slung between them —
 * what is lighting the lane, now that there is no ceiling to hang lights from.
 */
function Lamps() {
  const strings = useMemo(() => {
    const out: Vector3[][] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < POSTS_Z.length - 1; k++) {
        const a = new Vector3(side * POST_X, POST_H - 0.05, POSTS_Z[k]);
        const b = new Vector3(side * POST_X, POST_H - 0.05, POSTS_Z[k + 1]);
        const mid = a.clone().lerp(b, 0.5).add(new Vector3(0, -0.32, 0));
        out.push(new CatmullRomCurve3([a, mid, b]).getPoints(8).slice(1, -1));
      }
    }
    return out;
  }, []);
  return (
    <group>
      {[-1, 1].map((side) =>
        POSTS_Z.map((z) => (
          <group key={`${side}${z}`} position={[side * POST_X, GROUND_Y, z]}>
            <mesh position={[0, POST_H / 2, 0]}>
              <cylinderGeometry args={[0.025, 0.035, POST_H, 8]} />
              <meshStandardMaterial color="#1a1612" roughness={0.7} />
            </mesh>
            <mesh position={[0, POST_H + 0.05, 0]}>
              <sphereGeometry args={[0.07, 14, 10]} />
              <meshBasicMaterial color="#ffd89a" toneMapped={false} />
            </mesh>
          </group>
        )),
      )}
      {strings.flat().map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshBasicMaterial color={i % 3 ? "#ffcf7a" : "#f2c744"} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function Meadow() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, GROUND_Y - 0.002, -8]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial color={HEX.moss} />
      </mesh>
      <Grass />
      <Flowers />
      <Lamps />
    </group>
  );
}

