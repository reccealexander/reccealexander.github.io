import { Color, Vector3 } from "three";
import { COLOR, SUN_DIRECTION } from "@/lib/palette";
import { withFog } from "./uniforms";

/**
 * One material for everything thin the sun shines through: petals, leaves, a
 * scrap of paper. The lit side is almost incidental — what makes any of them
 * read as organic is the light coming through from behind, which is why the
 * backlight term is the strongest thing in here.
 */

export const PETAL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNrm;
varying vec3 vWorld;

#include <fog_pars_vertex>

void main() {
  vUv = uv;
  vNrm = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const PETAL_FRAG = /* glsl */ `
uniform vec3  uInner;
uniform vec3  uOuter;
uniform vec3  uUnder;
uniform vec3  uSun;
uniform vec3  uSky;
uniform vec3  uSunDir;
uniform float uBacklight;
uniform float uGlow;
uniform float uVeins;
uniform float uMidrib;
uniform float uUnderside;
uniform float uTint;
uniform float uFlat;
uniform float uOpacity;
uniform float uDetail;
uniform float uSeed;
uniform float uNight;

varying vec2 vUv;
varying vec3 vNrm;
varying vec3 vWorld;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

float petalHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float petalNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(petalHash(i), petalHash(i + vec2(1.0, 0.0)), u.x),
    mix(petalHash(i + vec2(0.0, 1.0)), petalHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  bool back_ = !gl_FrontFacing;
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(uSunDir);

  vec3 base = mix(uInner, uOuter, smoothstep(0.05, 0.95, vUv.y));
  // Ribs running the length of it — invisible at a distance, and the reason
  // a petal a hand's width across your view does not look like plastic.
  float ribs = sin(vUv.x * 46.0) * 0.5 + 0.5;
  base *= 1.0 - uVeins * 0.16 * ribs * smoothstep(0.05, 0.4, vUv.y);

  // Close-up detail, for the petals the camera spends a whole act among. The
  // ribs above are a regular grating; a real petal under it has finer veins
  // that wander, colour that is never even across the face, warm streaks
  // running out from the base, and a margin thin enough to be paler.
  if (uDetail > 0.0) {
    float along = vUv.y;
    float fine = sin(vUv.x * 150.0 + sin(along * 11.0 + vUv.x * 7.0 + uSeed) * 1.8) * 0.5 + 0.5;
    base *= 1.0 - uDetail * 0.07 * smoothstep(0.55, 1.0, fine) * smoothstep(0.08, 0.5, along);

    float mottle = petalNoise(vec2(vUv.x * 7.0, along * 16.0) + uSeed) * 0.6
                 + petalNoise(vec2(vUv.x * 19.0, along * 41.0) + uSeed * 1.7) * 0.4;
    base *= 1.0 + uDetail * 0.16 * (mottle - 0.5);

    float guide = smoothstep(0.4, 0.02, along)
                * smoothstep(0.55, 0.95, sin(vUv.x * 31.0 + 0.6 + uSeed * 0.3) * 0.5 + 0.5);
    base = mix(base, base * vec3(0.84, 0.58, 0.4), uDetail * 0.45 * guide);

    float margin = smoothstep(0.36, 0.5, abs(vUv.x - 0.5));
    base = mix(base, base * 1.1 + 0.02, uDetail * 0.6 * margin);
  }

  // A leaf is not a ribbed sheet. It has one spine holding it open and a set
  // of veins running off that spine toward the tip, and at the range this
  // camera reads a leaf from, that structure is most of what says leaf rather
  // than green ellipse.
  if (uMidrib > 0.0) {
    float across = abs(vUv.x - 0.5);
    float spine = 1.0 - smoothstep(0.008, 0.045, across);
    float side = sin(vUv.y * 27.0 - across * 30.0 + 1.2);
    side = smoothstep(0.5, 0.98, side) * (1.0 - spine);
    base *= 1.0 - uMidrib * 0.17 * side;
    base = mix(base, base * 1.28, uMidrib * spine * smoothstep(0.02, 0.22, vUv.y));
  }

  // The far side of a leaf is not the near side repainted: it is paler, greyer
  // and almost matte. A plant whose undersides match its tops is the clearest
  // tell there is that it was made out of cards, and the soil act is read from
  // below the lowest leaves.
  if (back_) base = mix(base, uUnder, uUnderside);

  float diff = max(dot(N, L), 0.0);
  float backl = pow(max(dot(-N, L), 0.0), 1.4);
  float rim  = pow(1.0 - max(dot(N, V), 0.0), 2.6);

  // uFlat trades the smooth falloff for a graphic one. A tube shaded
  // photographically at this range is a dowel, and the field standing beside
  // it answers no light at all.
  float shade = mix(0.30 + 0.80 * diff, 0.40 + 0.36 * smoothstep(0.0, 0.95, diff), uFlat);

  vec3 col = base * shade;
  // What comes through a thin thing is the colour of the thing. On a petal the
  // difference is small enough to ignore and the raw warmth is what makes the
  // bloom glow; on a leaf it is the whole difference between a backlit leaf and
  // a bar of sunlight, and four bars of sunlight across the stem act took the
  // frame off the plant they were attached to.
  col += mix(uSun, uSun * (base * 2.4 + 0.12), uTint) * backl * uBacklight * 0.85;
  col += uSky * rim * 0.20;
  col += base * uGlow;
  // After dark the bloom gives off its own light, and lowers its alpha so the
  // time-of-day grade leaves it bright (see three/TimeGrade.tsx). Zero on
  // everything else that shares this shader — leaves, stem, sepals.
  col += base * uNight * 0.7;

  gl_FragColor = vec4(col, uOpacity * (1.0 - 0.85 * uNight));

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

export type PetalUniformOptions = {
  inner?: string;
  outer?: string;
  /** What the far side of it is, and how much of it shows there. */
  under?: string;
  underside?: number;
  backlight?: number;
  /** How far the light coming through is coloured by what it comes through. */
  tint?: number;
  veins?: number;
  /** Spine and side veins, for the things that are leaves. */
  midrib?: number;
  /** How far toward a flat, graphic falloff, for the things that are tubes. */
  flat?: number;
  opacity?: number;
  /** Fine veins, mottling, base streaks and a pale margin — for the bloom only. */
  detail?: number;
  /** Decorrelates `detail` between petals. */
  seed?: number;
};

export function petalUniforms({
  inner = "#f2c744",
  outer = "#fbf6ea",
  under = "#cdd6c4",
  underside = 0,
  backlight = 1,
  tint = 0,
  veins = 1,
  midrib = 0,
  flat = 0,
  opacity = 1,
  detail = 0,
  seed = 0,
}: PetalUniformOptions = {}) {
  return withFog({
    uInner: { value: new Color(inner) },
    uOuter: { value: new Color(outer) },
    uUnder: { value: new Color(under) },
    uSun: { value: new Color(COLOR.sun) },
    uSky: { value: new Color(COLOR.skyLow) },
    uSunDir: { value: new Vector3(...SUN_DIRECTION).normalize() },
    uBacklight: { value: backlight },
    uGlow: { value: 0 },
    uVeins: { value: veins },
    uMidrib: { value: midrib },
    uUnderside: { value: underside },
    uTint: { value: tint },
    uFlat: { value: flat },
    uOpacity: { value: opacity },
    uDetail: { value: detail },
    uSeed: { value: seed },
    uNight: { value: 0 },
  });
}
