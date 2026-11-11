import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
  ZeroFactor,
} from "three";
import { FLOWER } from "@/lib/flowerLayout";
import { makeRandom } from "@/lib/math";
import { nightness } from "@/lib/timeOfDay";
import { reducedMotion } from "./quality";

/**
 * Fireflies, for the evening — in place of the petals that drift through the
 * field by day.
 *
 * A point each: a soft yellow-green bead with a hot centre, drifting on its own
 * slow loop and pulsing on its own rhythm — on for a beat, mostly dark between,
 * the way they actually signal. Most are spread over the field the opening and
 * closing shots frame; a cluster hangs round the plant for the shots taken
 * from inside it.
 *
 * They blend so as to lower the alpha under them, which is how the time-of-day
 * grade knows to leave them their light while it takes the rest of the frame
 * down (see three/TimeGrade.tsx).
 */
const FIELD = 150;
const NEAR = 36;

const VERT = /* glsl */ `
attribute vec4 aSeed;   // phase, wander rate, pulse rate, size
uniform float uTime;
uniform float uPx;
varying float vPulse;

void main() {
  float ph = aSeed.x;
  float w = aSeed.y;
  vec3 p = position + vec3(
    sin(uTime * w + ph) * 0.28 + sin(uTime * w * 2.3 + ph * 1.7) * 0.06,
    sin(uTime * w * 1.3 + ph * 2.1) * 0.12,
    cos(uTime * w * 0.8 + ph) * 0.28
  ) * aSeed.w;
  // On for a beat, dark for longer: a pulse, not a twinkle.
  float s = sin(uTime * aSeed.z + ph * 3.0);
  vPulse = 0.3 + 0.7 * pow(max(0.0, s), 3.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSeed.w * uPx * (0.6 + 0.4 * vPulse) / -mv.z, 2.0, 64.0);
}
`;

const FRAG = /* glsl */ `
uniform float uAmount;
varying float vPulse;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float halo = pow(1.0 - d, 1.5);
  float core = pow(1.0 - d, 6.0);
  vec3 col = mix(vec3(0.78, 1.0, 0.36), vec3(1.0, 1.0, 0.86), core);
  float a = (halo * 0.7 + core) * vPulse * uAmount;
  // Colour added (premultiplied); alpha carries how much light this is, for
  // the grade.
  gl_FragColor = vec4(col * a, clamp(a, 0.0, 1.0));
}
`;

export default function Fireflies() {
  const points = useRef<Points>(null);
  const calm = reducedMotion();
  const { size, viewport } = useThree();

  const geometry = useMemo(() => {
    const rnd = makeRandom(0xf1ef1e5);
    const n = FIELD + NEAR;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const near = i >= FIELD;
      if (near) {
        const a = rnd() * Math.PI * 2;
        const r = 0.08 + rnd() * 0.45;
        pos.set([FLOWER.x + Math.cos(a) * r, 0.06 + rnd() * 0.5, FLOWER.z + Math.sin(a) * r], i * 3);
      } else {
        pos.set([-4 + rnd() * 8, 0.15 + rnd() * 1.0, -6 + rnd() * 8.4], i * 3);
      }
      seed.set(
        [
          rnd() * 100,
          0.25 + rnd() * 0.45,
          0.9 + rnd() * 1.6,
          // Near the plant they are seen from centimetres away, so smaller.
          near ? 0.35 + rnd() * 0.25 : 1.1 + rnd() * 0.8,
        ],
        i * 4,
      );
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 4));
    return g;
  }, []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAmount: { value: 0 } },
        transparent: true,
        depthWrite: false,
        // Light added on top; alpha under it scaled down by how much light
        // this is, so the grade can tell it apart from the field.
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendEquationAlpha: AddEquation,
        blendSrcAlpha: ZeroFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
      }),
    [],
  );

  useFrame((_, dt) => {
    const amount = nightness();
    const p = points.current;
    if (!p) return;
    p.visible = amount > 0.01;
    if (!p.visible) return;
    material.uniforms.uAmount.value = amount;
    material.uniforms.uPx.value = size.height * viewport.dpr * 0.075;
    if (!calm) material.uniforms.uTime.value += Math.min(0.05, dt);
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}
