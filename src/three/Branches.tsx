import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";
import { canopy, leafCloud, type CanopyNode } from "./canopy";
import { CANOPY_LAYER } from "./reflect";
import { leafGeometry } from "./geometry";
import { CANOPY } from "./pond";
import { quality, reducedMotion } from "./quality";
import { withFog } from "./uniforms";

/**
 * The boughs hanging into the top of the frame.
 *
 * This is geometry, not a backdrop. There is no sky in this scene, so there is
 * nothing above the water for a canopy to be painted on — the only way to be
 * under a tree here is for the ends of its branches to be real objects between
 * the lens and the pond. That also means they are subject to everything else
 * the scene is: they fog with distance, the water is visible through the gaps
 * in them, and they leave the frame properly when the camera drops out of the
 * hero rather than sliding off it.
 *
 * Where they are allowed to be is in `CANOPY` in three/pond.ts, and it is a
 * tighter box than it looks. Above, the hero's own top edge, which the boughs
 * hug: a bough placed as a height is at the top of the picture at one distance
 * and out of it at every other, so these are placed as a *dip* below that
 * plane. Below and in front, the four acts the camera spends near the ground at
 * z 0.85 to 1.2 — the whole canopy stops short of that corridor, which is why
 * it simply is not there from the bloom onward.
 *
 * Two draws. The wood is one merged mesh of four-sided tapered tubes, because a
 * dozen strands is not worth an instanced draw and a tube read from a fixed
 * near-overhead camera needs no more sides than that. The leaves are one
 * instanced blade, which is where all the geometry actually is.
 *
 * Nothing here answers a light. A bough's top is painted lighter than its
 * underside and a leaf is filled in one colour dealt when it is placed — the
 * grass's rule (three/Grass.tsx), for the same reason.
 *
 * Where the tree is *grown* is three/canopy.ts rather than here, and that is
 * not tidiness. The water reflects this canopy, and a reflection worked out
 * from a second, separately seeded set of boughs is a tree in the pond that is
 * not the tree in the frame. So the strands and the leaves are made once over
 * there and this file is only what draws them.
 */

/** How many sides a tube has. */
const SIDES = 4;

/** Four-sided tapered tubes down every strand, merged into one buffer. */
function woodGeometry(strands: CanopyNode[][], dark: Color, lit: Color): BufferGeometry {
  const rings = strands.reduce((n, s) => n + s.length, 0);
  const pos = new Float32Array(rings * SIDES * 3);
  const col = new Float32Array(rings * SIDES * 3);
  const wind = new Float32Array(rings * SIDES);
  const idx: number[] = [];

  const fwd = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const at = new Vector3();
  let v = 0;

  for (const s of strands) {
    const base = v;
    for (let i = 0; i < s.length; i++) {
      const n = s[i];
      fwd.subVectors(s[Math.min(i + 1, s.length - 1)].p, s[Math.max(i - 1, 0)].p).normalize();
      right.set(fwd.z, 0, -fwd.x).normalize();
      up.crossVectors(right, fwd).normalize();
      for (let k = 0; k < SIDES; k++) {
        const a = (k / SIDES) * Math.PI * 2;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        at.copy(n.p)
          .addScaledVector(right, nx * n.r)
          .addScaledVector(up, ny * n.r);
        pos[v * 3] = at.x;
        pos[v * 3 + 1] = at.y;
        pos[v * 3 + 2] = at.z;
        // The top of a bough is painted lighter than its underside. It is a
        // decided colour and not a light: the ring's own turn is read here,
        // once, and never again.
        const face = right.y * nx + up.y * ny;
        const m = 0.5 + 0.5 * face;
        col[v * 3] = dark.r + (lit.r - dark.r) * m;
        col[v * 3 + 1] = dark.g + (lit.g - dark.g) * m;
        col[v * 3 + 2] = dark.b + (lit.b - dark.b) * m;
        wind[v] = n.w;
        v++;
      }
    }
    for (let i = 0; i < s.length - 1; i++) {
      for (let k = 0; k < SIDES; k++) {
        const a = base + i * SIDES + k;
        const b = base + i * SIDES + ((k + 1) % SIDES);
        idx.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
      }
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new BufferAttribute(col, 3));
  geo.setAttribute("aWind", new BufferAttribute(wind, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The stir. Two unrelated frequencies, applied hardest at the tips, and it is
 * the same field for the wood and the leaves so a leaf never leaves its twig.
 */
const WIND_GLSL = /* glsl */ `
uniform float uTime;

vec3 canopyWind(vec3 p, float w) {
  float a = sin(uTime * 0.61 + p.x * 1.3 + p.z * 0.8);
  float b = sin(uTime * 1.09 - p.z * 1.7 + p.x * 0.5);
  return vec3(a * 0.030 + b * 0.011, b * 0.009, a * 0.015 - b * 0.007) * w;
}
`;

const WOOD_VERT = /* glsl */ `
attribute vec3  aColor;
attribute float aWind;

varying vec3 vColor;

#include <fog_pars_vertex>

${WIND_GLSL}

void main() {
  vec3 world = position + canopyWind(position, aWind);
  vColor = aColor;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FLAT_FRAG = /* glsl */ `
varying vec3 vColor;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

void main() {
  gl_FragColor = vec4(vColor, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

/**
 * The leaves, which are the one thing in this canopy anybody looks at.
 *
 * The wood can be a flat fill -- it is a dark line against water and reads as
 * one. A leaf cannot: there are fifteen hundred of them across the top of the
 * hero, they are the only warm thing in a cold frame, and filled flat they are
 * fifteen hundred identical orange chips. Everything below is per pixel and
 * costs no geometry, which matters at this instance count.
 *
 * Three things, in the order they matter:
 *
 *  - The MAPLE OUTLINE, cut out of an oversized blank. This is the whole
 *    reason the geometry above is as broad as it is long. A maple is not a
 *    blade -- it is five lobes on deep sinuses, and that silhouette is what
 *    says maple at any size where you can still count the points. Cutting it
 *    here rather than building it means one sheet, no extra triangles, and a
 *    different outline on every leaf.
 *  - The VEINS, palmate. Five ribs leaving the petiole together, which is the
 *    other half of what makes a maple a maple, plus a fine net between them
 *    that only resolves on the near leaves.
 *  - The BLOTCHING. A turning leaf does not turn evenly: it goes at the margin
 *    and along the veins first and holds its green in the panels between. Two
 *    scales of it, so the frame has leaves partway through the turn rather than
 *    a uniform autumn.
 */
const LEAF_FRAG = /* glsl */ `
varying vec3 vColor;
varying vec2 vUv;
varying float vSeed;

#include <common>
#include <dithering_pars_fragment>
#include <fog_pars_fragment>

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

/** Value noise, for the blotching. Cheap and smooth is all it has to be. */
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  // Out of the sheet and into the leaf: x across from the midrib, y along from
  // the petiole. The blade proper starts a little way up, so everything below
  // is measured from where it opens rather than from the vertex.
  float along = clamp((vUv.y - 0.16) / 0.84, 0.0, 1.0);
  float across = (vUv.x - 0.5) * 2.0;

  // Polar about the petiole, which is the frame a palmate leaf is actually
  // described in: five lobes are five peaks in the radius as the angle sweeps.
  float ang = atan(across, max(along, 1e-3));
  float rad = length(vec2(across, along));

  /*
   * The outline.
   *
   * cos(5 * angle) puts a lobe on the midrib and two either side, which is a
   * maple. The sinuses are cut deep -- a shallow one gives a scalloped disc,
   * and the gaps between the points are as much of the silhouette as the points
   * are. Phased per leaf so no two are cut identically, and the reach falls off
   * toward the petiole so the base closes into the stalk instead of ending in
   * a straight cut.
   */
  float phase = vSeed * 6.283;
  float lobes = 0.62 + 0.38 * pow(max(cos(ang * 5.0 + sin(phase) * 0.35), 0.0), 0.55);
  // Teeth, an order finer, along the margin. A maple is toothed as well as
  // lobed and this is what stops the cut edge reading as a template.
  lobes += 0.035 * sin(ang * 47.0 + phase * 3.0);
  // How far the blade may reach at this angle, closing toward the base.
  float reach = lobes * (0.52 + 0.48 * smoothstep(0.0, 0.42, along));
  if (rad > reach) discard;

  vec3 col = vColor;

  /*
   * Autumn, unevenly. The margin and the veins go first and the panels between
   * hold on, so the mix runs on distance from the edge as well as on noise --
   * a leaf whose blotches ignore its own outline reads as a printed pattern
   * laid over a shape.
   */
  float edge = smoothstep(0.0, 0.42, reach - rad);
  float blot = vn(vec2(across, along) * 5.5 + vSeed * 31.0) * 0.65
             + vn(vec2(across, along) * 15.0 - vSeed * 17.0) * 0.35;
  float turn = clamp(blot * 0.85 + (1.0 - edge) * 0.5 + vSeed * 0.25, 0.0, 1.0);
  // Toward the ember end at the margin, and holding a cooler, deeper stop in
  // the middle of the panels. Both are the leaf s own colour moved, not a new
  // one introduced -- the palette of this canopy is decided in pond.ts.
  col = mix(col * vec3(0.72, 0.62, 0.52), col * vec3(1.12, 1.02, 0.82), turn);

  /*
   * Veins. Five from the petiole, and the net between them.
   *
   * Drawn as a lightening rather than a darkening: a leaf overhead is lit
   * through, and what a backlit vein does is carry more light than the panel
   * beside it, not less.
   */
  float rib = abs(fract(ang / (6.283 / 5.0) + 0.5) - 0.5) * (6.283 / 5.0);
  float main = 1.0 - smoothstep(0.0, 0.10, rib * max(rad, 0.12));
  float net = 1.0 - smoothstep(0.0, 0.045,
    abs(fract((ang * 9.0 + rad * 26.0) / 6.283) - 0.5) * 0.7);
  col *= 1.0 + 0.30 * main * smoothstep(0.0, 0.3, along)
             + 0.10 * net * edge;

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

const LEAF_VERT = /* glsl */ `
attribute vec4 iPose;    // x, y, z, yaw
attribute vec4 iForm;    // scale, tilt, wind weight, tone
attribute vec3 iTint;

varying vec3 vColor;
varying vec2 vUv;
varying float vSeed;

#include <fog_pars_vertex>

${WIND_GLSL}

void main() {
  vec3 q = position * iForm.x;
  float ct = cos(iForm.y);
  float st = sin(iForm.y);
  q = vec3(q.x, q.y * ct - q.z * st, q.y * st + q.z * ct);
  float cy = cos(iPose.w);
  float sy = sin(iPose.w);
  q = vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);

  vec3 world = iPose.xyz + q + canopyWind(iPose.xyz, iForm.z);

  // The blade's own length is the only form these get: a leaf is lighter at
  // the tip than at the stalk it is still drawing sap through, and that one
  // gradient is what stops several hundred of them reading as confetti.
  vColor = iTint * (0.78 + 0.34 * uv.y) * iForm.w;
  vUv = uv;
  // Its own number, so no two leaves are cut, veined or blotched alike. Off the
  // pose rather than a new attribute -- the position is already unique.
  vSeed = fract(sin(dot(iPose.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);

  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

export default function Branches() {
  const wood = useRef<ShaderMaterial>(null);
  const foliage = useRef<ShaderMaterial>(null);
  const calm = reducedMotion();
  const count = CANOPY.leaves[quality()];

  const { trunks, leaves } = useMemo(() => {
    const trunks = woodGeometry(
      canopy().strands,
      new Color(CANOPY.bark[0]),
      new Color(CANOPY.bark[1]),
    );

    const blade = leafGeometry({
      /*
       * Broad, and broader than a leaf shape has any business being, because
       * the maple outline is cut out of this sheet per pixel in the fragment
       * stage rather than built into it. What is wanted here is a blank wide
       * enough to hold five lobes and their sinuses; the silhouette that
       * reaches the screen is a good deal narrower than this.
       */
      length: 0.108,
      width: 0.108,
      stalk: 0.30,
      droop: 0.5,
      fold: 0.26,
      twist: 0.3,
      sweep: 0.08,
      // Six columns instead of three. The cut is per pixel and costs nothing
      // extra, but the sheet still has to be able to fold and twist across its
      // own width or the lobes come out on a flat card.
      nu: 7,
      nv: 6,
    });
    const geo = new InstancedBufferGeometry();
    geo.setAttribute("position", blade.getAttribute("position") as BufferAttribute);
    geo.setAttribute("uv", blade.getAttribute("uv") as BufferAttribute);
    geo.setIndex(blade.getIndex());
    geo.instanceCount = count;

    const cloud = leafCloud(count);
    geo.setAttribute("iPose", new InstancedBufferAttribute(cloud.pose, 4));
    geo.setAttribute("iForm", new InstancedBufferAttribute(cloud.form, 4));
    geo.setAttribute("iTint", new InstancedBufferAttribute(cloud.tint, 3));
    // The wind moves every blade and no bound computed from the attributes
    // would know it, so the whole canopy is one sphere and is never culled out
    // of a frame it is only just inside.
    geo.boundingSphere = new Sphere(new Vector3(0, 1.6, -1.2), 6);
    return { trunks, leaves: geo };
  }, [count]);

  const woodUniforms = useMemo(() => withFog({ uTime: { value: 0 } }), []);
  const leafUniforms = useMemo(() => withFog({ uTime: { value: 0 } }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime * (calm ? 0 : 1);
    if (wood.current) wood.current.uniforms.uTime.value = t;
    if (foliage.current) foliage.current.uniforms.uTime.value = t;
  });

  /*
   * Both meshes also sit on the canopy layer, which is what the water's mirror
   * camera renders and the only thing it renders. `enable` rather than `set`:
   * they have to stay on the default layer too, or the tree is in the pond and
   * not in the sky.
   */
  const onCanopyLayer = (m: Mesh | null) => m?.layers.enable(CANOPY_LAYER);

  return (
    <group>
      <mesh ref={onCanopyLayer} geometry={trunks} frustumCulled={false}>
        <shaderMaterial
          ref={wood}
          vertexShader={WOOD_VERT}
          fragmentShader={FLAT_FRAG}
          uniforms={woodUniforms}
          side={DoubleSide}
          fog
          dithering
        />
      </mesh>
      <mesh ref={onCanopyLayer} geometry={leaves} frustumCulled={false}>
        <shaderMaterial
          ref={foliage}
          vertexShader={LEAF_VERT}
          fragmentShader={LEAF_FRAG}
          uniforms={leafUniforms}
          side={DoubleSide}
          fog
          dithering
        />
      </mesh>
    </group>
  );
}
