import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ShaderMaterial, Vector3, type PerspectiveCamera } from "three";
import type { Biome } from "@/lib/biomes";
import { pointer } from "@/lib/pointer";
import Branches from "./Branches";
import { createSchool, KOI_GLSL } from "./koi";
import { quality, reducedMotion } from "./quality";
import { withFog } from "./uniforms";
import { LITTER_FRAG, LITTER_VERT, scatterShoreRocks } from "./soil";
import { usePlanarReflection } from "./reflect";
import {
  BANK_GLSL,
  NOISE_GLSL,
  PIXEL_GLSL,
  pixelAngle,
  ripple,
  SHALLOW_GLSL,
  stepRipple,
  WATER_Y,
  WAVE_GLSL,
} from "./pond";

/**
 * The pond.
 *
 * One plane, no reflection pass and no second camera. Everything the water does
 * it does in its own fragment shader: the ripple, the fish under it, and the
 * sun coming off it.
 *
 * It keeps the field's rule — nothing here answers a light. A wave face is not
 * shaded by a lamp, it is *painted*, the same way a blade of grass is: the two
 * water stops are mixed by which way the facet is turned, and that flat,
 * decided-in-advance colour is what lets a pond sit in the same frame as the
 * grass without looking like it was rendered by a different program.
 *
 * The one exception is what the surface gives back, which is a reflection and
 * has to behave like one or the whole thing reads as painted card. Two things
 * are ever above this water — the haze, because this scene has no sky, and the
 * boughs hanging into the top of the hero — and both of them are ours and
 * procedural, so the mirror is evaluated rather than rendered: the wave normal
 * bends a ray upward, the ray is asked where it leaves the canopy's ceiling
 * plane, and three/canopy.ts answers what is there. No render target, no second
 * camera, and the reflection is broken by the ripple because it is traced
 * through it rather than slid about underneath it.
 *
 * The sun is the third thing, and it is a reflection of something that is not
 * in the scene at all: the broken road of small highlights a low sun leaves on
 * ripple, which is the only thing in this biome allowed anywhere near white.
 */

const KOI_COUNT: Record<string, number> = { low: 4, medium: 6, high: 7 };

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec4 vMirrorUv;
uniform mat4 uReflectMatrix;

#include <fog_pars_vertex>

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vMirrorUv = uReflectMatrix * world;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

function frag(koiCount: number) {
  return /* glsl */ `
#define KOI ${koiCount}

uniform float uTime;
uniform vec3  uDeep;
uniform vec3  uSurface;
uniform sampler2D uReflect;
uniform vec3  uSilt;
uniform vec3  uSun;
uniform vec3  uSunDir;
uniform vec4  uKoi[KOI];
uniform vec4  uKoiForm[KOI];
uniform float uKoiBend[KOI];

varying vec3 vWorld;
varying vec4 vMirrorUv;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

${BANK_GLSL}
${NOISE_GLSL}
${PIXEL_GLSL}
${SHALLOW_GLSL}
${WAVE_GLSL}
${KOI_GLSL}

void main() {
  // The bank owns everything nearer than the waterline. Cutting the water here
  // rather than ending the plane is what lets the edge meander.
  float shore = bankEdgeZ(vWorld.x) - vWorld.z;
  if (shore < 0.0) discard;

  vec2 p = vWorld.xz;
  // How much of what this pixel shows is bottom rather than water. For the
  // first metre or so out from the edge a pond is shallow enough to see
  // through, and the colour of the bed coming up through it is the thing that
  // stops the shoreline being a step from one flat tone to another. It is a
  // gentler curve than a square now, because the square put the whole change
  // into the last twenty centimetres — which is a soft edge in the same place
  // a hard one was.
  float shallow = 1.0 - smoothstep(0.0, 1.75, shore);
  shallow *= shallow * (3.0 - 2.0 * shallow);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float px = groundPixel(vWorld, vec3(0.0, 1.0, 0.0));

  float fine = 1.0 - smoothstep(5.0, 14.0, dist);
  float h;
  vec2 g;
  waterSurface(p, uTime, fine, h, g);
  vec3 N = waterNormal(g);

  // The ripple, drawn rather than lit. A facet turned out toward the far side
  // of the pond takes the paler of the two water stops and one turned back at
  // the camera takes the deeper — which is the whole shading model, and it is
  // the grass's model with the blade's tone read off the geometry instead of
  // off a seed.
  // The gain is high on purpose. A ripple two centimetres tall has a slope of
  // about a twentieth, and read honestly that is eight levels of difference
  // across a wave — which is to say a flat sheet. Clipping the ordinary swell
  // to both stops is what makes this water and not a dark hole, and it is the
  // same decision as painting a lit sliver on a blade that answers no light.
  // Flattened in against the bank: there is no fetch in the last half metre of
  // a pond to build a wave with, so the shallows are glassier than open water
  // and the ripple has to die out before it reaches the edge — a chop that ran
  // all the way to the shore would put a serrated line there instead.
  // ...and the gain comes down with the waves themselves. Left at seven against
  // half the slope this would have put the chop back on the surface in paint
  // after it had been taken out of the geometry — and it is the painted version
  // that reads as texture on the water, so it is the one that has to go.
  float face = clamp((-N.z * 4.4 + N.x * 1.15) * (1.0 - 0.7 * shallow), -1.0, 1.0);
  vec3 col = mix(uDeep, uSurface, face * 0.5 + 0.5);

  // Silt and weed drifting under it, so the pond has a bottom rather than
  // being an infinitely deep hole with fish suspended in it. Halved from what
  // it was: a body colour that swings a third either way at the scale of a
  // metre is not a bottom, it is a fog bank inside the water, and it was doing
  // most of the work of hiding the fish.
  col *= 0.92 + 0.16 * fbm3(p * 1.5 + vec2(uTime * 0.012, uTime * 0.006));

  // And where the bottom is close enough to see, it is the bottom you are
  // looking at. At the waterline this is the whole answer, and it is the same
  // answer the bank's wet margin arrives at from the other side, which is what
  // lets the two meet without a seam.
  col = mix(col, shallowBed(p, px, uSilt, uDeep), shallow);

  // How much of this pixel is mirror rather than window.
  //
  // Schlick's, with the exponent opened from five to a little over two. The
  // shape is the point — water is a mirror seen along it and clear seen down
  // into it, and that gradient across the frame is most of what says "water"
  // rather than "a plane someone painted blue". The exponent is what decides
  // *where across the frame* the sweep from one to the other happens, and read
  // honestly it happens outside this picture: a pond is normally photographed
  // from a metre or so up with a hundred metres of it running away, and this
  // camera is three metres up with the fog closing at five. At five the whole
  // hero sits in the first two percent of the curve, which is a window edge to
  // edge. So the sweep is packed into the three metres of water the shot
  // actually has, and it is the same decision as the ripple's gain above —
  // draw the thing at the size the frame can see it at.
  // The exponent is opened again, from a little over two to a little under it.
  // Same reasoning as before and one step further along it: what decides where
  // across this frame the water stops being a window and starts being a mirror
  // is this number, and the reflection is now something the shot is *for*
  // rather than something it merely has. At 2.15 the near two metres of water —
  // which is the only water the canopy is ever overhead of, and therefore the
  // only water that can give a branch back — sat in the first tenth of the
  // curve.
  float grazing = 1.0 - max(dot(N, V), 0.0);
  float fres = 0.03 + 0.97 * pow(grazing, 1.75);

  // The fish, read through the surface. The point this pixel actually sees on
  // their plane is shifted by the slope of the water above them and further the
  // deeper they are, which is the whole refraction: no ray marching, one offset,
  // and a koi that visibly bends as a wave crosses it.
  //
  // What you can see through the surface is exactly what the surface is not
  // reflecting, so the fish go out as the view flattens. That is not a nicety:
  // at a couple of degrees off the water a koi's footprint is a horizontal
  // smear a metre wide, and the only thing that reads as is a rendering fault.
  //
  // How much the surface takes out of what is under it is a separate number
  // from how much it gives back, and treating them as one — one minus the
  // Fresnel term — is what made this pond opaque. The fifth power that puts a
  // convincing rim of haze on a wave face has taken four fifths of the
  // transmission out of the frame by the time the view is forty degrees off
  // the water, which is most of the hero. So the fish are read through a much
  // flatter curve with a floor under it, and the water above them still
  // reflects exactly what it did.
  // Clearer again, at both ends of it. The floor — what the water gives up even
  // looked straight down into — is nearly halved, and the rate the window
  // closes as the view flattens is down by a quarter. Between them they are
  // most of what the word "clarity" means here: the surface is still a mirror
  // where a mirror is what a surface is, and the water under it is now
  // something you are looking *into* over the whole hero rather than over the
  // near third of it.
  // Clearer again, and this is the pass that was asked for as "extremely".
  //
  // Both ends move. The floor — what the water takes out of what is under it
  // even looked straight down into — goes to a thirtieth, which is glass. The
  // rate the window shuts as the view flattens comes down by a third. And the
  // distance at which the fish give up is pushed out by two and a half metres,
  // because the previous number was set when the water was murky enough that
  // nothing was legible out there anyway and it is now the binding constraint
  // rather than a safety net.
  //
  // None of this costs the reflection anything, which is the part worth being
  // clear about: what the surface gives back is the Fresnel term below and is
  // computed separately. Transmission and reflection are two numbers here, not
  // one and its complement — treating them as one is what made this pond opaque
  // in the first place, and it is why "extremely clear" and "shows the
  // reflection" are not the contradiction they sound like.
  float murk = 0.018 + 0.28 * grazing * grazing;
  float clarity = (1.0 - murk) * (1.0 - smoothstep(12.0, 20.0, dist));
  if (clarity > 0.01) {
    for (int i = 0; i < KOI; i++) {
      vec4 form = uKoiForm[i];
      vec3 fish;
      float m = koiAt(uKoi[i], form, uKoiBend[i], p + N.xz * form.y * 2.4, uTime, fish);
      if (m > 0.0) {
        // Water takes the light out of what is under it, and it does it fast:
        // the deep fish are ghosts and are meant to be. Slower again, and it
        // costs nothing now that the stop it fades into is a teal rather than
        // very nearly black — a fish two thirds of the way to the deep stop
        // used to be a fish two thirds of the way to nothing.
        // Slower again, for the same reason as the murk above: in water this
        // clear a fish a foot down is not a ghost.
        // Slower again: the fish were legible against dark water and washed
        // out the moment it went pale and a reflection went over the top of it.
        float veil = 1.0 - exp(-form.y * 0.34);
        col = mix(col, mix(fish, uDeep, veil), m * clarity);
      }
    }
  }

  // And what it gives back: the haze, and the tree it is lying under.
  //
  // The ray is bent by the wave before it is traced, which is where the whole
  // look comes from — a metre and a half of reflected path multiplied by a
  // ripple's slope scatters the hit point by half a metre, so the canopy
  // arrives in the water torn into streaks rather than as a picture of itself.
  // It is also why the reflection settles as the water flattens toward the
  // bank, which is what a real pond does.
  // What the surface gives back is now a render of the tree rather than a
  // description of one -- see three/reflect.ts. The camera is mirrored through
  // the water plane, the canopy alone is drawn from there, and this is where a
  // point on the water finds itself in that image.
  //
  // The offset is the whole of the distortion, and it is deliberately small: a
  // reflection in water this calm is a duplicate of what is above it, bent a
  // little by the slope it happens to be lying on. Scaled by the wave normal,
  // so it settles where the water settles and ripples where the cursor has just
  // been -- which is the same term that used to tear the analytic version into
  // streaks, doing an honest job now that there is a real image to bend.
  // Still wanted below: the sun road is a reflection too, of the one thing that
  // is never in frame and therefore cannot be in the render above.
  vec3 R = reflect(-V, N);
  vec2 mirrorUv = vMirrorUv.xy / max(vMirrorUv.w, 1e-4) + N.xz * 0.042;
  vec3 mirror = texture2D(uReflect, clamp(mirrorUv, 0.002, 0.998)).rgb;

  // Where the bottom is showing there is barely any water to reflect with, and
  // a mirrored canopy laid over the gravel at the waterline is the one thing
  // that would put the shore back to being an edge.
  //
  // No canopy term in here any more. The old floor existed because the analytic
  // mirror only knew the tree was overhead and had to be told to show it; a
  // real reflection carries its own sky in the gaps between the boughs, so what
  // is left is Fresnel and a floor under it -- water gives something back
  // everywhere, and more of it the flatter you look across it.
  float give = clamp(0.27 + fres * 1.40, 0.0, 0.90) * (1.0 - 0.55 * shallow);

  // The sun. Only its reflection is ever in frame, and only where a wave is
  // turned to catch it. Two terms, doing different jobs: a narrow road that
  // says where the mirror image of the sun is, kept nearly invisible on its
  // own because a lit sheet of any size takes the hero's type off the page;
  // and the sparks inside it, which are what a broken surface actually gives
  // back and are the only thing in this biome allowed near white.
  //
  // The sparks are chopped out of the road by two noise fields an octave and a
  // half apart. One would give round blobs at one size; multiplying two gives
  // the sparse, uneven scatter a real sun road has, and it does it without the
  // two-centimetre wave trains it would otherwise take, which at this distance
  // are moire and nothing else.
  // Broader and far stronger than it was. At an exponent of seventy and twelve
  // thousandths of a stop this was a term you could find in a histogram and not
  // on a screen -- which was fine while the water was nearly black and is not
  // now that it is a bright morning. Widening the cone is what turns it from a
  // hot line into the broad gold sheet the low sun actually lays on water.
  float aim = max(dot(R, uSunDir), 0.0);
  // A wide cone, and this is the number that decides whether there is a glare
  // at all. Rendered as a debug channel, an exponent of eighteen put the road
  // at about three hundredths of a stop across the whole upper left -- present
  // in the buffer, invisible on the screen. A low sun on water does not make a
  // hot line, it makes a broad sheet of gold over everything facing it, and six
  // is what draws that.
  float road = pow(aim, 5.0);
  float spark = pow(aim, 300.0);
  vec2 drift = vec2(uTime * 0.11, -uTime * 0.06);
  float facets =
    smoothstep(0.42, 0.72, vnoise(p * 13.0 + drift)) *
    smoothstep(0.30, 0.64, vnoise(p * 31.0 - drift * 1.7));
  // The road is deliberately NOT gated on the fine-detail fade, and the sparks
  // still are.
  //
  // That fade exists to take the two shortest wave trains out past fourteen
  // metres,
  // where a nine-centimetre ripple is under a pixel and reads as moire. That is
  // exactly right for the sparks, which are chopped out of noise at that scale.
  // It is exactly wrong for the road: the glare belongs on the far water at the
  // top of the frame, which is entirely beyond fourteen metres, so the fade was
  // multiplying it by zero everywhere it was meant to be.
  //
  // Held in a variable and added after the mirror below, not into the water
  // here. The sun road IS a reflection -- of the one thing that is never in the
  // frame and so cannot be in the render target -- and the canopy reflection is
  // mixed in at up to nine tenths. Added at this point the glare was being
  // ninety percent overwritten by the branches a few lines later, which is why
  // turning it up eighteen-fold did nothing that could be seen.
  vec3 glare = uSun * (road * 1.15 + spark * 1.6 * facets * fine);

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  /*
   * The reflection is mixed in here, after tone mapping and not before it.
   *
   * It has already been through ACES once, in the pass that drew it -- three
   * tone maps into a render target exactly as it does to the canvas. Mixed in
   * above with the rest of the colour it would go through a second time, which
   * on a scarlet canopy is a visible desaturation toward brick. Here the two
   * sides of the mix are in the same state, and the fog below still lands on
   * the result, which is right: the surface is at a distance whatever is
   * reflected in it.
   */
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mirror, give);
  // ...and the sun on top of both, being the brightest reflection of the three.
  gl_FragColor.rgb += glare;
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;
}

/** How many stones the shore is made of, in one instanced draw. */
const ROCKS: Record<string, number> = { low: 900, medium: 2200, high: 3800 };

/**
 * The shore.
 *
 * Mounted here with the rest of the pond's own furniture, for the reason given
 * at the bottom of this file: what makes this biome is one flag on the palette,
 * and everything that flag switches on hangs off it.
 *
 * It runs the forest's stone material unchanged. The only thing that makes
 * these rocks rather than clods of earth is the three colours handed to it —
 * and they are pulled toward the bank's own silt rather than invented, because
 * a shore is made of the ground it lies on and a belt of stone in a colour the
 * bank does not contain reads as gravel delivered by lorry.
 */
function Shore({ biome }: { biome: Biome }) {
  const pond = biome.pond!;
  const { geometry } = useMemo(() => scatterShoreRocks(ROCKS[quality()]), []);
  const uniforms = useMemo(
    () =>
      withFog({
        uPond: { value: 1 },
        // Wet stone is darker and greyer than the silt it sits in; the lit stop
        // is a dry top facet. Both keyed off the biome's own silt so the belt
        // sits in the bank rather than on it.
        uDark: { value: new Color(pond.silt[0]).multiplyScalar(0.72) },
        uLit: { value: new Color(pond.silt[1]).lerp(new Color("#cfc7b4"), 0.34) },
        // A little green in the crevices: everything at a waterline has weed on
        // it, and it is the one thing that stops a rock belt reading as concrete.
        uMoss: { value: new Color(biome.deep).multiplyScalar(0.62) },
      }),
    [biome, pond],
  );

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

export default function Water({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const calm = reducedMotion();
  const pond = biome.pond!;
  const school = useMemo(() => createSchool(KOI_COUNT[quality()]), []);
  const fragment = useMemo(() => frag(school.count), [school]);
  // The mirror is a render now, not a summary of the tree — three/reflect.ts.
  const reflection = usePlanarReflection();

  const uniforms = useMemo(
    () =>
      withFog({
        uTime: { value: 0 },
        uReflect: { value: reflection.target.texture },
        uReflectMatrix: { value: reflection.matrix },
        uPixel: { value: 0.001 },
        uRipple: { value: new Vector3() },
        uDeep: { value: new Color(pond.deep) },
        uSurface: { value: new Color(pond.surface) },
        // The bed under the shallows, which is the bank's own wet silt: the two
        // surfaces have to agree about the colour where the shore is or the
        // waterline is a seam. This went unwired for a while and an unwired
        // uniform is black, so the shallows were *darker* than the open water
        // and the pond met the bank on a hard edge — which is exactly what the
        // shallows are there to prevent.
        uSilt: { value: new Color(pond.silt[0]) },
        uSun: { value: new Color(pond.sun) },
        uSunDir: { value: new Vector3(...pond.sunDir).normalize() },
        uKoiBody: { value: new Color(pond.koi[0]) },
        uKoiMark: { value: new Color(pond.koi[1]) },
        uKoiSumi: { value: new Color(pond.koi[2]) },
        uKoi: { value: school.pose },
        uKoiForm: { value: school.form },
        uKoiBend: { value: school.bend },
      }),
    [pond, school, reflection],
  );

  useFrame((state, dt) => {
    const m = material.current;
    if (!m) return;
    // One clock, read rather than accumulated, because the petals lying on this
    // surface compute the same wave sum and have to arrive at the same answer.
    const t = state.clock.elapsedTime * (calm ? 0.25 : 1);
    m.uniforms.uTime.value = t;
    const cam = state.camera as PerspectiveCamera;
    m.uniforms.uPixel.value = pixelAngle(cam.fov, state.size.height * state.viewport.dpr);
    if (calm) return;
    stepRipple(pointer, dt);
    m.uniforms.uRipple.value.set(ripple.x, ripple.z, ripple.amp);
    school.step(pointer, dt, t);
  });

  // The canopy hangs off the water rather than off the scene, because the scene
  // graph is shared with three biomes that have no tree in them and the pond's
  // own three components are the only things it switches on. It is the same
  // reason the bank and the blossom are mounted here: what makes this biome is
  // one flag on the palette, and everything that flag turns on lives behind it.
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, WATER_Y, -22]}>
        <planeGeometry args={[90, 90, 1, 1]} />
        <shaderMaterial
          ref={material}
          vertexShader={VERT}
          fragmentShader={fragment}
          uniforms={uniforms}
          fog
          dithering
        />
      </mesh>
      <Shore biome={biome} />
      <Branches />
    </>
  );
}
