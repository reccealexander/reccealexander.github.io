import { forwardRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Effect } from "postprocessing";
import { Uniform, Vector3 } from "three";
import { daylight, nightness, stepDaylight } from "@/lib/timeOfDay";
import { reducedMotion } from "./quality";

/**
 * The time of day, as a grade over the finished frame.
 *
 * The scene was lit for morning, and most of it does not answer light at all —
 * the grass, the flowers and the soil are painted from their palettes — so the
 * one place a change of light can reach all of it at once is here, on the
 * picture. Sunset warms it toward amber and lifts the colour; evening takes it
 * down to a dark, cool, desaturated blue.
 *
 * Except for what is meant to shine in the dark. The frame buffers are eight
 * bits (see three/Scene.tsx), so nothing can be brighter than white going in,
 * and a grade that took the whole frame down to a third would take a glowing
 * flower down with it. So the things that glow mark themselves in the alpha
 * channel, which the rest of the scene always writes at 1: a flower petal at
 * night writes less than 1, and the fireflies blend in a way that lowers the
 * alpha under them. Here, the less alpha a pixel has, the less of the grade it
 * takes — the dark comes down around them and they keep their own light.
 */
const FRAG = /* glsl */ `
uniform vec3 shade;   // what the shadows are tinted by
uniform vec3 light;   // what the lit tops are tinted by
uniform vec3 lift;
uniform float sat;
uniform float keep;
uniform vec3 sky;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 s = mix(vec3(l), c, sat);
  // Split by brightness, as low light splits a scene: the lit tops of things
  // take one colour and what is in shadow takes another. One tint over the
  // lot turns green grass brown; gold over violet is a sunset.
  vec3 graded = max(s * mix(shade, light, smoothstep(0.04, 0.42, l)) + lift, 0.0);
  // The light of the sky itself, strongest toward the horizon — the top of
  // these frames — as a low sun or the last of the dusk would lay it.
  graded += sky * uv.y * uv.y;
  float glow = clamp(1.0 - inputColor.a, 0.0, 1.0) * keep;
  outputColor = vec4(mix(graded, c, glow), 1.0);
}
`;

/** The three looks: [shadow tint, lit tint, lift, saturation, sky glow].
    Morning is no change at all. */
const LOOKS: readonly [Vector3, Vector3, Vector3, number, Vector3][] = [
  [new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(0, 0, 0), 1, new Vector3(0, 0, 0)],
  // Low sun: the lit grass gold-orange, the shade a dusky violet-rose, colour
  // pushed, and the warm glow coming in off the horizon.
  [new Vector3(0.6, 0.44, 0.74), new Vector3(1.42, 0.9, 0.44), new Vector3(0.018, 0.004, 0.016), 1.15, new Vector3(0.15, 0.055, 0.045)],
  // After dark: a third of the light, cool and grey, the shadows lifted to
  // blue so the field is still there rather than gone to black.
  [new Vector3(0.28, 0.33, 0.55), new Vector3(0.34, 0.4, 0.58), new Vector3(0.004, 0.009, 0.024), 0.5, new Vector3(0.0, 0.012, 0.045)],
];

class TimeGradeEffect extends Effect {
  constructor() {
    super("TimeGrade", FRAG, {
      uniforms: new Map<string, Uniform>([
        ["shade", new Uniform(new Vector3(1, 1, 1))],
        ["light", new Uniform(new Vector3(1, 1, 1))],
        ["lift", new Uniform(new Vector3())],
        ["sat", new Uniform(1)],
        ["keep", new Uniform(0)],
        ["sky", new Uniform(new Vector3())],
      ]),
    });
  }
}

export const TimeGrade = forwardRef<TimeGradeEffect>(function TimeGrade(_, ref) {
  const effect = useMemo(() => new TimeGradeEffect(), []);
  const calm = reducedMotion();

  useFrame((_, dt) => {
    stepDaylight(Math.min(0.05, dt), calm);
    const v = daylight.value;
    const i = Math.min(1, Math.floor(v));
    const t = Math.min(1, v - i);
    const [da, ha, la, sa, ka] = LOOKS[i];
    const [db, hb, lb, sb, kb] = LOOKS[i + 1];
    const u = effect.uniforms;
    (u.get("shade")!.value as Vector3).lerpVectors(da, db, t);
    (u.get("light")!.value as Vector3).lerpVectors(ha, hb, t);
    (u.get("lift")!.value as Vector3).lerpVectors(la, lb, t);
    u.get("sat")!.value = sa + (sb - sa) * t;
    u.get("keep")!.value = nightness();
    (u.get("sky")!.value as Vector3).lerpVectors(ka, kb, t);
  });

  return <primitive ref={ref} object={effect} dispose={null} />;
});
