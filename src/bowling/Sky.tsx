import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { reducedMotion } from "@/three/quality";

/**
 * The sky over the lane: a clear blue afternoon.
 *
 * Pale and hazy at the horizon — the same haze the fog dissolves the far
 * grass into, so the field runs out into the sky rather than stopping at an
 * edge — deepening to a clean blue overhead, with fair-weather cloud drifting
 * across and a soft brightening where the sun is. One dome, drawn behind
 * everything and out of the fog: it *is* the distance.
 */

/** Where the sun is: high, off to the right and behind the pins. */
const SUN = new Vector3(0.45, 0.55, -1).normalize();

/** The horizon haze, which the fog shares. */
export const SKY_HAZE = "#a3c6e2";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // on the far plane, whatever its size
}
`;

const FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uSun;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float toSun = max(dot(d, uSun), 0.0);

  // Haze at the horizon, into a clear blue overhead.
  vec3 col = mix(uHorizon, uLow, smoothstep(-0.01, 0.1, h));
  col = mix(col, uHigh, smoothstep(0.1, 0.6, h));

  // The sun's brightening, and a small hot disc.
  col += vec3(1.0, 0.97, 0.88) * (pow(toSun, 6.0) * 0.18 + pow(toSun, 400.0) * 1.2);

  // Fair-weather cumulus: soft-edged, white on top, a little grey beneath,
  // thinning toward the horizon where they would be too small to read.
  vec2 uv = d.xz / (h + 0.22) * 1.2 + vec2(uTime * 0.006, uTime * 0.002);
  float n = fbm(uv);
  float c = smoothstep(0.5, 0.72, n) * smoothstep(0.0, 0.1, h);
  vec3 cloud = mix(vec3(0.78, 0.82, 0.88), vec3(1.0), smoothstep(0.55, 0.85, n) + 0.3 * pow(toSun, 2.0));
  col = mix(col, cloud, c * 0.9);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default function Sky() {
  const { geo, mat } = useMemo(() => {
    const m = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uHorizon: { value: new Color(SKY_HAZE) },
        uLow: { value: new Color("#5f9fdc") },
        uHigh: { value: new Color("#2f6bc0") },
        uSun: { value: SUN },
        uTime: { value: 0 },
      },
    });
    return { geo: new SphereGeometry(40, 48, 24), mat: m };
  }, []);
  const still = reducedMotion();
  const ref = useRef<Mesh>(null);
  useFrame(({ clock, camera }) => {
    if (!still) mat.uniforms.uTime.value = clock.elapsedTime;
    // Centred on the eye, so it is infinitely far away from every seat.
    ref.current?.position.copy(camera.position);
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-1} frustumCulled={false} />;
}
