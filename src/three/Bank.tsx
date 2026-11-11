import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  Color,
  PlaneGeometry,
  ShaderMaterial,
  type PerspectiveCamera,
} from "three";
import type { Biome } from "@/lib/biomes";
import { FLOWER } from "@/lib/flowerLayout";
import { reducedMotion } from "./quality";
import { moundHeight, SOIL } from "./soil";
import { withFog } from "./uniforms";
import {
  BANK,
  BANK_GLSL,
  BANK_LIGHT_GLSL,
  bankEdgeZ,
  NOISE_GLSL,
  PIXEL_GLSL,
  pixelAngle,
  SHALLOW_GLSL,
  SHORE,
  SHORE_GLSL,
  SHORE_LIGHT,
  SILT_Y,
  siltRelief,
} from "./pond";

/**
 * The near bank: wet silt, and the light coming off the water onto it.
 *
 * The pond used to be a hero skin. Everything that said "pond" was out on the
 * open water, and from the bloom onward the camera is under half a metre off
 * the ground with a flower filling the frame, so four of the six acts had no
 * water in them at all and the biome quietly became a meadow with bluer
 * blades. The answer is not to force open water into a shot that is looking at
 * a plant — it is to notice that a reader standing on a bank knows perfectly
 * well there is water beside them without ever looking at it, and to draw the
 * things that tell them so.
 *
 * Those are: ground that is saturated rather than dusty, and reads colder and
 * darker for it; a wet sheen that comes up as the view flattens, which is why
 * it is strongest in the last act where the camera is nearly lying in it; and
 * the broken sun coming off the surface, crossing the mud in slow wandering
 * lines. The last is the one that carries it. Nothing else in a field does
 * that, and it is legible at any camera angle, including one pointed the other
 * way.
 *
 * It is a second sheet laid a couple of millimetres over the soil rather than
 * a change to the soil, because the soil is shared with three biomes that are
 * not wet. Being millimetres *over* the water as well as over the soil is what
 * lets it own the shoreline: it runs out past the waterline by a ragged few
 * centimetres and stops there, so the edge of the pond is the edge of this
 * sheet — broken at the size of the grit it runs over, and arriving at the
 * water's own shallow colour rather than at a cut.
 */

const VERT = /* glsl */ `
attribute float aFace;

varying vec3  vWorld;
varying float vFace;

#include <fog_pars_vertex>

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vFace = aFace;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3  uWet;
uniform vec3  uDry;
uniform vec3  uDeep;
uniform vec3  uSheen;
uniform vec3  uSun;

varying vec3  vWorld;
varying float vFace;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

${BANK_GLSL}
${NOISE_GLSL}
${PIXEL_GLSL}
${SHORE_GLSL}
${SHALLOW_GLSL}
${BANK_LIGHT_GLSL}

void main() {
  vec2 p = vWorld.xz;
  float toWater = vWorld.z - bankEdgeZ(vWorld.x);

  // How far the wet margin lies out over the water here. This sheet is a
  // couple of millimetres above the pond, so where it reaches past the
  // waterline it simply covers it — which is how the shore stops being a line
  // between two surfaces and becomes a strip belonging to neither.
  //
  // Asked for only near the shore. This sheet can fill the frame in the last
  // two acts and every noise lookup in here is paid for by every pixel of it,
  // so the ones that only ever matter within a hand's width of the water are
  // behind the branch that says so.
  float film = toWater < 0.4 ? shoreMargin(p) : 0.0;
  if (toWater < -film) discard;

  // Everything below is band-limited on this: see fbm3 in three/pond.ts. The
  // last two acts read this ground at two degrees off edge-on, and a grain
  // finer than the pixel it lands in is not grain there, it is a moire.
  float px = groundPixel(vWorld, vec3(0.0, 1.0, 0.0));

  // Wet at the water and drying out up the bank. The *tideline moves*; the
  // ramp does not change gain. Multiplying one ramp by a noise field — which
  // is what used to happen here — makes the distance it takes to dry out vary
  // along the shore, and a ramp whose slope varies along its own length is a
  // set of bands to any camera lying in it. Displacing the distance instead
  // gives one monotone ramp on a line that wanders, which is what a tideline
  // is. It is held straight at the water's edge, because the last hand's width
  // before a pond is wet wherever you stand.
  //
  // How fast the displacement is allowed to grow is the other half of it. The
  // wander is faded in over a metre and a half rather than over half a metre,
  // because a displacement that reaches full strength in the same distance the
  // ramp takes to run can cancel that ramp's own slope outright — and a ramp
  // with a flat spot in it is a band, whatever put it there.
  // And how long it takes. Nearly two metres, where it used to be one: the
  // soil act stands on ground between twenty centimetres and a metre and a
  // half from the water, so a ramp that reached the dry crust inside a metre
  // put the whole of the last two acts on the pale end of it — and pale, even,
  // cool ground a hand's width from the lens is a poured floor. A bank this
  // close to a pond is wet.
  float wander = (fbm3(p * 2.1, px * 2.1) - 0.47) * 0.50 * smoothstep(0.0, 1.40, toWater);
  float dry = smoothstep(0.02, ${(SHORE * 5.2).toFixed(5)}, toWater + wander);
  vec3 col = mix(uWet, uDry, dry);

  // The swell of the silt, painted. The sheet is modelled — see buildSilt
  // below — so it has a silhouette, but nothing in this scene answers a light
  // and a modelled surface with one flat colour on it reads as a flat surface
  // however it is shaped. So the slope the vertices actually carry comes
  // through as an attribute and is read here, exactly the way a blade of grass
  // carries its lit sliver: decided in advance, and not a lamp.
  col *= 0.86 + 0.30 * vFace;

  // Two scales of mottle, not three: silt is a damp blotch at the hand's width
  // and a grain at the fingertip, and a third field multiplied on top of those
  // takes the swing to three to one on a base this dark, which is where the
  // black in the black ribbons came from. Two is also the most a camera lying
  // in this can resolve — see the band limit in fbm3, which flattens anything
  // finer than the pixel it lands in and takes the grain out of the far ground
  // on its own.
  col *= 0.80 + 0.40 * fbm3(p * 7.0,  px * 7.0);
  col *= 0.88 + 0.24 * fbm3(p * 46.0, px * 46.0);
  // Grit standing in the mud, added rather than multiplied. A term that can
  // only ever lighten a scattering of pixels cannot take a region down with
  // it, which is the whole difference between grain and a ribbon — and it
  // fades to nothing on its own where a pixel is too big to hold it, because
  // its own mean is under the threshold.
  col += uDry * 0.15 * smoothstep(0.60, 0.86, fbm3(p * 90.0, px * 90.0));

  // Grit and small stones washed up along the edge. Bright only in the sense
  // that wet gravel is: this is the one thing in the biome that is allowed to
  // be lighter than the silt around it, and it is thickest in the last few
  // centimetres, which is what breaks the waterline at the size of a stone.
  float shoreward = 1.0 - smoothstep(0.0, 0.9, toWater);
  float bed = 0.0;
  if (shoreward > 0.001) {
    float stones = smoothstep(0.72, 0.92, fbm3(p * 26.0 + 11.0, px * 26.0));
    col = mix(col, uDry * 1.5, stones * 0.30 * shoreward);

    // Past the waterline this is not ground any more, it is a film of water
    // lying on ground — and it arrives at exactly what the pond arrives at
    // from the other side, out of the same function, so the two meet with
    // nothing at the join for the eye to catch.
    bed = 1.0 - smoothstep(-film * 0.85, 0.05, toWater);
    col = mix(col, shallowBed(p, px, uWet, uDeep), bed);
  }

  // Wet ground is a mirror at a glancing angle and matt from above, which is
  // the whole difference between mud and dust and is why the last act — the
  // one that is nearly lying on this — is where it reads hardest. There is no
  // sky, so what it gives back is the same haze everything else reflects.
  //
  // It is also a *broken* mirror, and that is the half that was missing. Mud
  // is glassy where water still stands on it and matt where it has drained,
  // so laying the sheen on as one even sheet — which at two degrees off
  // edge-on is most of the value in the frame — flattened every grain out of
  // the bank and left poured concrete. Patched at the scale of a puddle, the
  // same term reads as what it is.
  vec3 V = normalize(cameraPosition - vWorld);
  float wetness = 1.0 - smoothstep(0.0, ${(SHORE * 3.4).toFixed(5)}, toWater);
  float pools = 0.30 + 0.70 * smoothstep(0.34, 0.64, fbm3(p * 3.2 + 21.0, px * 3.2));
  float sheen = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0) * (0.2 + 0.8 * max(wetness, bed)) * pools;
  col = mix(col, uSheen, sheen * 0.46);

  // The light off the water, which used to be the only thing on this bank with
  // any value in it at all: a twelve percent add of a saturated orange over
  // silt that tonemapped to almost nothing. That is not light on mud — it is
  // mud-shaped nothing with orange painted along whatever the pattern happened
  // to reach, which is to say ribbons of brown on black. The silt below now
  // carries its own tone, so this can be what it always should have been: a
  // thin broken glint, only just warm, saying the surface it came off moves.
  // Squared, because what a broken surface throws are lines and not a wash.
  float reach = 1.0 - smoothstep(0.0, ${SHORE_LIGHT.toFixed(5)}, toWater);
  float band = bankLight(p, uTime);
  col += mix(uSheen, uSun, 0.55) * band * band * reach * 0.085;

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

export default function Bank({ biome }: { biome: Biome }) {
  const material = useRef<ShaderMaterial>(null);
  const calm = reducedMotion();
  const pond = biome.pond!;

  const uniforms = useMemo(
    () =>
      withFog({
        uTime: { value: 0 },
        uPixel: { value: 0.001 },
        uWet: { value: new Color(pond.silt[0]) },
        uDry: { value: new Color(pond.silt[1]) },
        uDeep: { value: new Color(pond.deep) },
        uSheen: { value: new Color(pond.sheen) },
        uSun: { value: new Color(pond.sun) },
      }),
    [pond],
  );

  useFrame((state) => {
    const m = material.current;
    if (!m) return;
    // Read off the shared clock rather than accumulated, so the light crossing
    // the mud is the same age as the water that threw it.
    m.uniforms.uTime.value = state.clock.elapsedTime * (calm ? 0.25 : 1);
    // The rig retimes the field of view along the journey and the canvas can be
    // resized under it, so how much ground a pixel covers is a per-frame fact.
    const cam = state.camera as PerspectiveCamera;
    m.uniforms.uPixel.value = pixelAngle(cam.fov, state.size.height * state.viewport.dpr);
  });

  const { sheet, cap } = useMemo(() => buildSilt(), []);

  return (
    <group>
      <mesh geometry={sheet}>
        <shaderMaterial
          ref={material}
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          fog
          dithering
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-4}
        />
      </mesh>
      {/* The cap over the throw of earth the stem comes out of, which is the
          one piece of the modelled floor that stands higher than the sheet
          could ever be laid. It carries the same shader and a heavier offset
          again, so the order down there is decided rather than fought over. */}
      <mesh geometry={cap}>
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          fog
          dithering
          polygonOffset
          polygonOffsetFactor={-5}
          polygonOffsetUnits={-6}
        />
      </mesh>
    </group>
  );
}

/**
 * The two pieces of silt, solved into geometry on the processor.
 *
 * The sheet is deep enough to cover every metre of ground the journey frames
 * from the bank and no deeper — nothing ever sees it end — and it is
 * tessellated at a hand's width so it can carry `siltRelief`. Its relief dies
 * out at the water, because a bank standing a centimetre proud of the pond it
 * runs into is a kerb, which is the same reason the modelled soil under it
 * does the same.
 *
 * The cap is a small square over the mound, displaced by the *soil's* own
 * height function rather than by a second opinion about it, so the silt lies on
 * the earth the plant is rooted in instead of cutting through it. Outside the
 * mound's radius that function is exactly zero, so the cap flattens into the
 * sheet at its own rim with nothing to fade.
 */
function buildSilt() {
  const depth = BANK.depth + 1.4;
  const midZ = depth / 2 - 0.9;

  const sheet = new PlaneGeometry(BANK.halfWidth * 2.4, depth, 148, 46);
  displace(sheet, 0, midZ, false);

  const capSide = SOIL.moundRadius * 3.2;
  const cap = new PlaneGeometry(capSide, capSide, 64, 64);
  displace(cap, FLOWER.x, FLOWER.z, true);

  return { sheet, cap };
}

/**
 * Where the light this bank is painted with is coming from, on the ground.
 *
 * The same bearing the sun road on the water is drawn from, because the two
 * surfaces meet and a bank keyed to a different hour than the pond beside it
 * reads as two photographs. It is not a light — nothing here answers one — it
 * is the direction a slope has to face to be painted as the pale side of a
 * swell, and it is baked into the mesh once.
 */
const KEY_X = -0.38;
const KEY_Z = -0.92;

/** Lay a plane flat at the origin given, and lift every vertex onto the silt. */
function displace(geo: PlaneGeometry, cx: number, cz: number, mound: boolean) {
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const pos = geo.getAttribute("position") as BufferAttribute;
  const face = new Float32Array(pos.count);

  const height = (x: number, z: number) => {
    const ashore = Math.min(1, Math.max(0, (z - bankEdgeZ(x)) / 0.34));
    const h = SILT_Y + siltRelief(x, z) * ashore * ashore;
    return mound ? h + moundHeight(x - FLOWER.x, z - FLOWER.z) : h;
  };

  const d = 0.012;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, height(x, z));
    // Central differences on the same function, so the paint and the
    // silhouette can never disagree about which way a swell is turned. The
    // gain is high and then clipped, for the reason the water's is: the slopes
    // in a couple of millimetres of silt are a fiftieth, and read honestly that
    // is one level of difference across a hand's width.
    const gx = (height(x + d, z) - height(x - d, z)) / (2 * d);
    const gz = (height(x, z + d) - height(x, z - d)) / (2 * d);
    face[i] = Math.max(-1, Math.min(1, -(gx * KEY_X + gz * KEY_Z) * 9));
  }
  pos.needsUpdate = true;
  geo.setAttribute("aFace", new BufferAttribute(face, 1));
  geo.computeBoundingSphere();
}
