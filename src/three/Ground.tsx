import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { Color, DoubleSide } from "three";
import type { Biome } from "@/lib/biomes";
import { highlight } from "@/lib/timeOfDay";
import { FLOWER } from "@/lib/flowerLayout";
import { COLOR, HEX } from "@/lib/palette";
import { withFog } from "./uniforms";
import { quality } from "./quality";
import {
  LITTER_FRAG,
  LITTER_VERT,
  SOIL,
  SOIL_GLSL,
  scatterLitter,
} from "./soil";
import { SUNLIGHT_GLSL, SUN_RAMP, SUN_STRENGTH } from "./sunlight";

/**
 * The soil, and the little of it that is ever visible.
 *
 * For most of the scroll this is a dark floor behind the grass, doing the job
 * the DOM site's rasterised ground does: giving the canopy something to stand
 * against. That part is still one plane, because at a bird's eye it is a colour
 * and nothing else.
 *
 * It becomes a *surface* at the end of the pan down the stem, where the camera
 * is a hand's width off it and the questions are read. So the two and a half
 * metres around the plant are a second, modelled floor laid over the first: a
 * height field with the throw of earth the stem comes out of built into it, a
 * couple of hundred stones and clods lying in it, and grain down to the
 * millimetre. Both floors run the same fragment shader, so the seam between
 * them is a change of relief and never a change of ground.
 *
 * The relief only ever heaps. Every blade in the field is rooted at y = 0, and
 * ground that dropped below that would leave the near grass standing on air.
 */

const VERT = /* glsl */ `
uniform float uRelief;   // 1 on the modelled patch, 0 on the flat floor
uniform float uPond;

varying vec3  vWorld;
varying vec3  vNrm;
varying float vCrumb;
varying float vMound;

#include <fog_pars_vertex>

${SOIL_GLSL}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);

  vec3 nrm = vec3(0.0, 1.0, 0.0);
  float crumb = 0.0;
  float mound = 0.0;

  if (uRelief > 0.5) {
    vec2 p = world.xz;
    float h = soilHeightFull(p, uPond, crumb, mound);
    // Two more samples, one cell apart, for the normal. Doing it here rather
    // than per pixel is the whole reason the patch can afford to be modelled:
    // the finest thing the field carries is a four-centimetre crumb and the
    // cells are two, so there is nothing between the vertices to miss.
    float e = ${(((2 * SOIL.patchHalf) / SOIL.segments) * 1.5).toFixed(5)};
    float hx = soilHeight(p + vec2(e, 0.0), uPond);
    float hz = soilHeight(p + vec2(0.0, e), uPond);
    nrm = normalize(vec3(h - hx, e, h - hz));
    world.y += h;
  }

  vWorld = world.xyz;
  vNrm = nrm;
  vCrumb = crumb;
  vMound = mound;

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3  uNear;
uniform vec3  uFar;
uniform vec3  uSoil;
uniform vec3  uSoilLit;
uniform vec3  uSoilDark;
uniform vec3  uSun;
uniform vec3  uSunWarm;
uniform float uSunPool;
uniform float uPond;
uniform float uRelief;

varying vec3  vWorld;
varying vec3  vNrm;
varying float vCrumb;
varying float vMound;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

${SOIL_GLSL}
${SUNLIGHT_GLSL}

void main() {
  // In a pond biome the soil is a bank, and the bank ends. Cutting it here
  // rather than shortening the plane is what lets the waterline meander, and
  // it leaves the water — which is a separate plane, a centimetre lower — to
  // fill everything past it.
  float toWater = vWorld.z - bankEdgeZ(vWorld.x);
  if (uPond > 0.5 && toWater < 0.0) discard;

  vec2 p = vWorld.xz;

  float coarse = soilFbm(p * 1.9);
  float fine   = soilFbm(p * 34.0);
  float grit   = soilFbm(p * 260.0);

  // The biome's own two ground stops, mottled — the far one reads under the
  // canopy, the near one where the trodden soil around the plant shows.
  float toPlant = length(p - vec2(${FLOWER.x.toFixed(5)}, ${FLOWER.z.toFixed(5)}));
  /*
   * Away from the plant this is not soil at all.
   *
   * It used to mix the warm soil stops in across the whole floor, which gave
   * every gap in the canopy a brown cast — and a brown gap in a meadow reads
   * as a bald patch however dark it is. Out here it is only the biome's own
   * two ground greens, held well down, because the only thing it has to be is
   * the shade the canopy is casting on itself.
   */
  float earthy = 1.0 - smoothstep(0.06, 0.34, toPlant);
  vec3 col = mix(uFar, uNear, clamp(coarse * 1.25 - 0.1, 0.0, 1.0)) * 0.66;
  col = mix(col, uSoil, smoothstep(0.35, 0.75, fine) * 0.5 * earthy);
  col = mix(col, uSoilLit, smoothstep(0.72, 0.98, fine) * 0.35 * earthy);
  col *= 0.8 + 0.4 * grit;

  // Bare earth. The ground a plant is standing in is not the ground three
  // metres away: it is what the roots have turned over, the canopy has been
  // pushed aside for it, and the mound is earth thrown up this season. So the
  // apron around the stem drops the biome's two green stops and takes the
  // soil's own — mottled at the edge, because a circle of bare ground is worse
  // than none. It only happens on the modelled patch; everywhere else the
  // ground is a colour behind grass and has no business being brown.
  // Turned earth reaches about as far as the plant does. Keying it off the
  // relief alone made every heap on the patch bare, which is the whole patch —
  // and since the patch has an edge, so did the bare ground.
  float near = 1.0 - smoothstep(0.05, 0.15, toPlant);
  float bare = max(
    smoothstep(0.004, 0.02, vMound) * near,
    1.0 - smoothstep(0.03, 0.11, toPlant));
  bare = clamp(bare * (0.45 + 0.85 * coarse), 0.0, 1.0) * uRelief;
  // Pulled a little back toward the biome's own far ground: bare earth in a
  // meadow still has the meadow in it, and a clean warm brown against cold
  // green blades reads as two photographs.
  vec3 earth = mix(mix(uSoil, uSoilLit, 0.06 + 0.4 * grit), uFar, 0.16);
  col = mix(col, earth, bare);
  // Turned earth is not smooth earth. What the roots pushed up this season is
  // clods with the fine stuff knocked out of them, so the apron takes a
  // coarser and harder mottle of its own — without it the mound is the one
  // thing in the soil act with no texture at all, a pale dune a hand's width
  // from the lens with the crumb of the floor around it stopping at its foot.
  col *= mix(
    1.0,
    mix(0.52, 1.18, smoothstep(0.34, 0.62, soilFbm(p * 46.0)))
      * mix(0.7, 1.22, smoothstep(0.36, 0.68, soilNoise(p * 230.0))),
    bare);
  // Damp and dry, at the scale a patch of ground dries out in. Without it the
  // apron is one tan, and one tan over a whole frame is sand. Twice, a metre
  // apart in scale, because ground dries in patches inside patches — one
  // frequency of mottle is a pattern the moment you can see two periods of it.
  col *= mix(0.66, 1.12, smoothstep(0.28, 0.72, soilFbm(p * 4.6)));
  col *= mix(0.80, 1.14, smoothstep(0.30, 0.70, soilFbm(p * 0.85)));

  // Sand, which catches what light there is. Smooth noise rather than a cell
  // hash — cells at this scale rasterise into hard squares, and a floor of
  // squares is a texture map rather than dirt.
  col += uSoilLit * smoothstep(0.7, 0.94, soilNoise(p * 430.0)) * 0.1;

  /*
   * The organic crumb, which swallows it.
   *
   * This used to be one smoothstep over one noise field, and one smoothstep
   * over one field is an even pepper: the same dot at the same spacing across
   * the whole floor, which is the one thing broken ground never looks like.
   * Crumb is not spread, it is *collected* — rain and wind scour it off
   * anything standing proud and pile it in the hollows — so where it lands has
   * to be the height field's own low ground rather than a second, unrelated
   * opinion about the floor. The field below is exactly the one the relief
   * digs its hollows out of, thresholded around the same 0.44, so the dark
   * collects in the dips the vertices actually made.
   *
   * And it is not one size. A five centimetre fleck over a millimetre grain is
   * how ground under trees actually breaks up; one frequency of dot is a
   * halftone screen.
   *
   * The mask has to move the *level* the noise clears rather than scale what
   * comes out of it. Multiplying an even pepper by a patchiness leaves every
   * dot exactly where it was and only turns some of them down, which is what
   * this did and why it still read as evenly spread — a threshold that varies
   * decides where there are dots at all, so the floor gets banks of crumb with
   * scoured ground between them.
   */
  // Not named "patch": that is a reserved word in GLSL ES 3 and compiles
  // nowhere, and the build is perfectly happy to ship a shader that never
  // links.
  float low    = 1.0 - smoothstep(0.30, 0.58, soilFbm3(p * 21.0));
  float banked = smoothstep(0.36, 0.64, soilFbm(p * 9.0));
  // The apron gets a floor under the mask. Turned earth is the one ground in
  // the frame that is *all* crumb — it has just been broken open — and the
  // scoured-clean half of the mask landing on the mound left a pale smooth
  // dune a hand's width from the lens with textured floor all round it.
  float hold   = clamp(low * (0.2 + 1.0 * banked) + bare * 0.34, 0.0, 1.0);
  float level  = mix(0.93, 0.36, hold);
  float crumbs = smoothstep(level, level + 0.13, soilFbm(p * 76.0)) * 0.8
               + smoothstep(level + 0.06, level + 0.14, soilNoise(p * 19.0)) * 0.45
               // ...and a grain a third of a centimetre across, for the twenty
               // centimetres in front of the lens where the two above have
               // already gone smooth. Its own fixed threshold, with only its
               // weight coming off the mask: run through the moving one it is
               // solid dark inside a bank and absent outside it, which is a
               // blot rather than a grain.
               + smoothstep(0.60, 0.80, soilNoise(p * 320.0)) * (0.2 + 0.55 * hold) * uRelief;
  col = mix(col, uSoilDark, clamp(crumbs, 0.0, 1.0) * 0.72);

  // Relief the vertices are too coarse to carry, as a normal bumped off the
  // same fields the colour came from. Three octaves, each sampled at its own
  // step: one epsilon across all three gives the finest one every scrap of the
  // relief and the coarsest one none, which is most of why this read as a flat
  // sheet with sandpaper laid over it.
  float e = 0.004;
  float e2 = 0.03;
  float c0 = soilFbm(p * 7.5);
  float cx = soilFbm((p + vec2(e2, 0.0)) * 7.5);
  float cz = soilFbm((p + vec2(0.0, e2)) * 7.5);
  float h0 = soilFbm(p * 34.0);
  float hx = soilFbm((p + vec2(e, 0.0)) * 34.0);
  float hz = soilFbm((p + vec2(0.0, e)) * 34.0);
  // And once more at a fifth of that, single octave, because the last twenty
  // centimetres in front of the lens are otherwise a wash: the three
  // centimetre grain above is already flat by the time it gets that close.
  float g0 = soilNoise(p * 150.0);
  float gx = soilNoise((p + vec2(e, 0.0)) * 150.0);
  float gz = soilNoise((p + vec2(0.0, e)) * 150.0);
  vec3 N = normalize(
    vNrm
    + vec3(c0 - cx, 0.0, c0 - cz) * 3.2 * uRelief
    + vec3(h0 - hx, 0.0, h0 - hz) * 2.4
    + vec3(g0 - gx, 0.0, g0 - gz) * 1.3 * uRelief);
  float lit = max(dot(N, normalize(vec3(-0.4, 0.7, -0.6))), 0.0);

  // Held well down: any soil the canopy fails to cover should read as the
  // shade under it rather than as bare ground. Wider than it was about the
  // same middle: the mean has to stay where it is for the type's sake, but a
  // floor with nothing between its lightest and darkest is a floor with no
  // form, and this is the only term in the shader that answers the relief.
  vec3 out_ = col * (0.19 + 0.48 * lit) + uSun * lit * 0.03;

  // What actually makes broken ground read as broken: the light does not
  // reach the bottom of the gaps between the crumbs. It is the height field's
  // own depth, so it costs a varying and nothing else.
  out_ *= mix(1.0, mix(0.32, 1.2, smoothstep(-0.012, 0.009, vCrumb)), uRelief);

  // The pool of sun reaches the floor as well as what is standing in it, and
  // for the same reason: this is a field over the ground, not a lamp. A gap in
  // the canopy inside the light is a bright gap; the same gap a metre outside
  // it is still only the shade the canopy is casting on itself. Held below the
  // grass's own lit stop — the floor is under the canopy even where the canopy
  // is lit, and a floor as bright as the blades over it is a floor with nothing
  // standing on it.
  out_ = mix(out_, mix(uSunWarm * 0.62, out_, 0.35), sunPool(vWorld.xz) * uSunPool * 0.8);

  // The last hand's width before the water is saturated mud, and wet ground is
  // darker than dry. Without it the bank ends on a hard bright line and the
  // pond reads as a hole cut in a lawn.
  if (uPond > 0.5) out_ *= mix(0.42, 1.0, smoothstep(0.0, 0.5, toWater));

  gl_FragColor = vec4(out_, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

/**
 * What bare ground is made of in this biome.
 *
 * Everywhere but the pond that is the palette's own soil, which is warm and
 * dead on purpose. A bank is silt: cold, and the biome already owns the two
 * stops for it, so the earth thrown up around the stem is in the same key as
 * the mud it was thrown out of.
 */
function bareStops(biome: Biome): [string, string] {
  return biome.pond ? [biome.pond.silt[0], biome.pond.silt[1]] : [HEX.soil, HEX.soilLit];
}

/** How many stones are worth dropping, by how much the machine can spare. */
const STONES = { low: 140, medium: 280, high: 440 } as const;

function Grit({ biome }: { biome: Biome }) {
  const { geometry } = useMemo(
    () => scatterLitter(STONES[quality()], Boolean(biome.pond)),
    [biome],
  );

  const uniforms = useMemo(() => {
    const [dark, lit] = bareStops(biome);
    return withFog({
      uPond: { value: biome.pond ? 1 : 0 },
      uDark: { value: new Color(dark).multiplyScalar(0.42) },
      // Pulled toward the ground it is lying on, and further than it was. A
      // warm stone on a green floor reads as rust; the same stone in the bare
      // apron reads as a stone — and a stone lighter than the soil around it
      // reads as a chip of crockery, which is what these became the moment the
      // floor they lie on got its contrast back.
      uLit: { value: new Color(lit).lerp(new Color(biome.groundFar), 0.42) },
      // Whatever grows on a stone here grows in this biome's key, so the
      // forest's is warm and the pond's a wet blue-green.
      uMoss: { value: new Color(biome.deep) },
    });
  }, [biome]);

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

export default function Ground({ biome }: { biome: Biome }) {
  const common = useMemo(() => {
    const [bareA, bareB] = bareStops(biome);
    return {
      uNear: { value: new Color(biome.groundNear) },
      uFar: { value: new Color(biome.groundFar) },
      uSoil: { value: new Color(bareA) },
      uSoilLit: { value: new Color(bareB) },
      uSoilDark: { value: new Color(COLOR.soilDark) },
      uSun: { value: new Color(COLOR.sun) },
      uSunWarm: { value: new Color(SUN_RAMP.warm) },
      uSunPool: { value: SUN_STRENGTH[biome.id] ?? 0 },
      uPond: { value: biome.pond ? 1 : 0 },
    };
  }, [biome]);

  // The pool on the soil takes the same light as the pool on the grass. Both
  // materials share these uniform objects, so one update reaches both.
  useFrame(() => {
    highlight("warm", common.uSunWarm.value);
  });

  const flat = useMemo(() => withFog({ ...common, uRelief: { value: 0 } }), [common]);
  const near = useMemo(() => withFog({ ...common, uRelief: { value: 1 } }), [common]);

  const side = SOIL.patchHalf * 2;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -1.5]}>
        <planeGeometry args={[120, 120, 1, 1]} />
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={flat}
          side={DoubleSide}
          fog
          dithering
        />
      </mesh>

      {/* The modelled floor, laid over the flat one. It is only ever above it,
          so the two never fight for the same pixel except at the rim where the
          relief has already gone to nothing — which the offset settles. */}
      <mesh rotation-x={-Math.PI / 2} position={[FLOWER.x, 0, FLOWER.z]}>
        <planeGeometry args={[side, side, SOIL.segments, SOIL.segments]} />
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={near}
          side={DoubleSide}
          fog
          dithering
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-2}
        />
      </mesh>

      <Grit biome={biome} />
    </group>
  );
}
