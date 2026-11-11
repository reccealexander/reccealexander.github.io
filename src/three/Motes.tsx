import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
} from "three";
import { COLOR } from "@/lib/palette";
import { makeRandom } from "@/lib/math";
import { FLOWER } from "@/lib/journey";
import { MOTES, quality } from "./quality";

/**
 * The dust in the air.
 *
 * Sized in real millimetres and left alone: nothing here is faded in when you
 * shrink, because motes this size are genuinely invisible from a person's
 * height and genuinely everywhere from an ant's. Letting perspective do it is
 * both cheaper and more convincing than a fade tied to the scroll.
 */

const VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aSpeed;

uniform float uTime;
uniform float uScale;

varying float vFade;

void main() {
  vec3 p = position;
  // Slow convection: they rise, wander, and wrap rather than being simulated.
  float t = uTime * aSpeed;
  p.y = mod(p.y + t * 0.012, 1.4);
  p.x += sin(t * 0.6 + aPhase) * 0.03;
  p.z += cos(t * 0.44 + aPhase * 1.7) * 0.03;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float dist = max(0.0005, -mvPosition.z);
  gl_PointSize = clamp(aSize * uScale / dist, 0.5, 22.0);
  // The nearest ones blow out; hold them back so they read as motes, not blobs.
  vFade = smoothstep(0.0, 0.04, dist) * (1.0 - smoothstep(2.2, 5.0, dist));
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = (1.0 - smoothstep(0.05, 0.25, r)) * vFade * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

export default function Motes() {
  const points = useRef<Points>(null);
  const material = useRef<ShaderMaterial>(null);
  const { size } = useThree();
  const count = MOTES[quality()];

  const geometry = useMemo(() => {
    const rnd = makeRandom(9137);
    const pos = new Float32Array(count * 3);
    const aSize = new Float32Array(count);
    const aPhase = new Float32Array(count);
    const aSpeed = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // A slab of air over the plant and the strip of field around it — the
      // only ground the camera ever gets close enough to see dust in.
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.55) * 3.4;
      pos[i * 3] = FLOWER.x + Math.cos(a) * r;
      pos[i * 3 + 1] = Math.pow(rnd(), 1.6) * 1.4;
      pos[i * 3 + 2] = FLOWER.z + 1.2 + Math.sin(a) * r;
      // Half a millimetre to two millimetres.
      aSize[i] = 0.0004 + Math.pow(rnd(), 2.2) * 0.0016;
      aPhase[i] = rnd() * Math.PI * 2;
      aSpeed[i] = 0.5 + rnd() * 1.2;
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aSize", new BufferAttribute(aSize, 1));
    geo.setAttribute("aPhase", new BufferAttribute(aPhase, 1));
    geo.setAttribute("aSpeed", new BufferAttribute(aSpeed, 1));
    return geo;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScale: { value: 600 },
      uColor: { value: new Color(COLOR.cream) },
      uOpacity: { value: 0.5 },
    }),
    [],
  );

  useFrame((state, dt) => {
    if (!material.current) return;
    const cam = state.camera as PerspectiveCamera;
    uniforms.uTime.value += dt;
    // Point size in world units means undoing the projection by hand.
    uniforms.uScale.value =
      size.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    uniforms.uOpacity.value = 0.32;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
