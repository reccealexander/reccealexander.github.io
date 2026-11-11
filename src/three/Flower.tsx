import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Biome } from "@/lib/biomes";
import {
  FLOWER,
  leafAt,
  PETAL,
  PETAL_COUNT,
  petalAngle,
  petalTilt,
  STEM,
} from "@/lib/flowerLayout";
import { featureChapter, stationGlow, STEP_COUNT, stepChapter } from "@/lib/journey";
import { clamp, makeRandom } from "@/lib/math";
import { COLOR } from "@/lib/palette";
import { stepLeafHover } from "@/lib/leafHover";
import { scrollState } from "@/lib/scroll";
import { nightness } from "@/lib/timeOfDay";
import {
  leafGeometry,
  mergeGeometries,
  petalGeometry,
  petalSolid,
  petalSurface,
  separateSteps,
  transformSurface,
} from "./geometry";
import { settled } from "./growth";
import { PETAL_FRAG, PETAL_VERT, petalUniforms } from "./petalShader";
import { quality, reducedMotion } from "./quality";
import { moundHeight } from "./soil";

/**
 * One flower out of the field, and the only thing in the scene that is
 * modelled rather than scattered.
 *
 * Its eight petals are the eight things Petal does and its four leaves are the
 * four steps in the walkthrough, so both are laid out from the same numbers the
 * DOM labels are placed with — a petal lighting up and its caption arriving are
 * the same event read twice.
 *
 * The plant is read from beside it and from below it, never from in front, and
 * that decides most of what is here: a stalk on every leaf so the blade has a
 * visible junction with the stem, a different colour on the far side of a leaf
 * from the near side, and roots surfacing out of the mound, because at eight
 * centimetres off the floor a stem that meets the ground at a line is a post.
 */

/*
 * The stem's centre line and its taper now live in lib/flowerLayout, beside the
 * petal geometry and for the same reason: the leaves carry DOM labels pinned to
 * where they are in the world, so the mesh and the document have to be reading
 * one set of numbers. The ridges below are shaped into the surface rather than
 * into the curve, so nothing here needs its own copy.
 */

/**
 * A tube's own idea of its texture coordinates runs along its length in x and
 * around it in y, which is upside down for everything this material does with
 * them: the length ramp came out as a band down one side of the stem — the pale
 * stripe that made it read as turned wood — and the ribs came out as rings.
 */
function swapUv(geo: BufferGeometry) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  uv.needsUpdate = true;
  return geo;
}

/** A tube, thinned along its length by `shrink` and rippled around it. */
function taperTube(
  geo: BufferGeometry,
  curve: CatmullRomCurve3,
  segments: number,
  radial: number,
  shrink: (t: number) => number,
  ridges = 0,
) {
  const pos = geo.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // TubeGeometry lays its rings out by arc length, so ring `i`'s centre is
    // getPointAt, not getPoint.
    const centre = curve.getPointAt(t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const s = shrink(t) * (1 + ridges * Math.cos((j / radial) * Math.PI * 8));
      pos.setXYZ(
        k,
        centre.x + (pos.getX(k) - centre.x) * s,
        centre.y + (pos.getY(k) - centre.y) * s,
        centre.z + (pos.getZ(k) - centre.z) * s,
      );
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function Stem({ biome }: { biome: Biome }) {
  const geometry = useMemo(() => {
    const segments = quality() === "low" ? 46 : 96;
    // Twenty around, because the ridges below are four cycles and a tube with
    // fewer samples than that aliases them into one broad flat facet — which
    // is the pale band down one side that made it read as turned wood twice.
    const radial = 20;
    const geo = new TubeGeometry(STEM, segments, 0.0105, radial, false);
    // Taper, because a stem the same thickness at the head as at the root reads
    // as a pipe; and five shallow ridges up it, because a circle in silhouette
    // reads as one whatever it is painted.
    return swapUv(
      taperTube(
        geo,
        STEM,
        segments,
        radial,
        // Taper, plus a flare in the last two centimetres before the soil. A
        // stem that meets the ground at the width it has at the head is a post
        // pushed into a lawn; the flare is the only part of the plant the last
        // act reads at arm's length, and it is on the tube rather than on a
        // collar of its own so it can never sit off the axis the stem leans on.
        (t) => (1 - 0.4 * t * t) * (1 + 1.6 * Math.exp(-t / 0.045)),
        0.07,
      ),
    );
  }, []);

  const uniforms = useMemo(
    () =>
      petalUniforms({
        // Dark where it comes out of the ground, and taking the field's own
        // colour by the time it reaches the head.
        inner: biome.deep,
        outer: biome.bright,
        // Nothing goes through a stem. The shared material's backlight is what
        // gives a petal its glow, and left on here it laid a band of raw sun
        // down whichever side of the tube faced away from it — which is exactly
        // the hard pale stripe that made this read as a turned dowel.
        backlight: 0,
        veins: 0.8,
        flat: 0.6,
      }),
    [biome],
  );

  return (
    <mesh geometry={geometry}>
      <shaderMaterial
        vertexShader={PETAL_VERT}
        fragmentShader={PETAL_FRAG}
        uniforms={uniforms}
        side={DoubleSide}
        fog
      />
    </mesh>
  );
}

/**
 * Surface roots.
 *
 * The stem's own flare is where it stops being a rod; these are where it stops
 * being a plant standing on the soil and becomes one growing out of it. Five of
 * them, riding a few millimetres proud of the mound before they dive under it,
 * which is why they read the mound's own height function rather than guessing:
 * a root that surfaced through the wrong centimetre would be a stick lying on
 * the ground.
 */
function Roots() {
  const roots = useMemo(() => {
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.55;
      const len = 0.075 + 0.055 * (0.5 + 0.5 * Math.sin(i * 2.7 + 1.1));
      const bend = (i % 2 === 0 ? 1 : -1) * 0.62;
      const points: Vector3[] = [];
      for (let s = 0; s <= 5; s++) {
        const t = s / 5;
        const r = 0.014 + t * len;
        const ang = a + bend * t * t;
        const dx = Math.cos(ang) * r;
        const dz = Math.sin(ang) * r;
        points.push(
          new Vector3(
            FLOWER.x + dx,
            moundHeight(dx, dz) + 0.0035 - 0.024 * t * t,
            FLOWER.z + dz,
          ),
        );
      }
      const curve = new CatmullRomCurve3(points);
      const segments = 14;
      const radial = 7;
      const tube = new TubeGeometry(curve, segments, 0.0068, radial, false);
      parts.push(
        swapUv(taperTube(tube, curve, segments, radial, (t) => 1 - 0.72 * t, 0.09)),
      );
    }
    return mergeGeometries(parts);
  }, []);

  const uniforms = useMemo(
    () =>
      petalUniforms({
        // Root, not stem: what a plant has underground is the colour of what it
        // is standing in, and going green here would put a second bright thing
        // in the one shot that is meant to be all soil.
        inner: "#5d4c33",
        outer: "#2b2318",
        backlight: 0,
        veins: 0.5,
        flat: 0.85,
      }),
    [],
  );

  return (
    <mesh geometry={roots}>
      <shaderMaterial
        vertexShader={PETAL_VERT}
        fragmentShader={PETAL_FRAG}
        uniforms={uniforms}
        side={DoubleSide}
        fog
      />
    </mesh>
  );
}

/** One leaf, one step of the walkthrough. It warms as its step is read. */
function Leaf({ index, biome, under }: { index: number; biome: Biome; under: string }) {
  const material = useRef<ShaderMaterial>(null);
  const mesh = useRef<Mesh>(null);
  const at = stepChapter(index);

  // Placement is lib/flowerLayout's business — the document sets a label on
  // this leaf's surface, and the two cannot be working from different numbers.
  // The rotation here is only the pose it starts at: `leafAt` now folds the
  // hover lift into it, so the live attitude is re-read every frame below.
  const { geometry, position, rotation } = useMemo(() => {
    const leaf = leafAt(index);
    return {
      geometry: leafGeometry({
        length: leaf.length,
        width: leaf.width,
        droop: leaf.droop,
        twist: leaf.twist,
        sweep: leaf.sweep,
      }),
      position: leaf.position,
      rotation: leaf.rotation,
    };
  }, [index]);

  /*
   * The lit half of the biome's ramp, and hard venation.
   *
   * These used to take `deep`→`bright`, which is what a blade of grass takes,
   * and the result was exactly that: four objects the colour of the field,
   * shaded like the field, in a frame that is nothing but field. The label's
   * leader was landing on the right pixels the whole time and still read as
   * pointing at a piece of grass, because there was nothing to tell them apart.
   *
   * biomes.ts is explicit that `bright` is the top of the *shade* and that the
   * lit colours belong to three/sunlight — which the grass gets and the plant,
   * standing in its own small clearing, largely does not. Taking `bright`→
   * `litB` directly puts these a clear stop above the blades behind them
   * without moving the frame's average anywhere, there being four of them.
   *
   * The venation does the rest of the work, and is the part grass cannot copy:
   * a blade of grass in this field is one flat facet with a spine, so a surface
   * with a midrib and veins across it reads as a leaf on sight.
   */
  /** The leaf's two body stops, at rest and at its station. */
  const ramp = useMemo(() => {
    const sun = new Color(COLOR.sun);
    const innerCool = new Color(biome.bright);
    const outerCool = new Color(biome.litB);
    return {
      innerCool,
      outerCool,
      innerHot: innerCool.clone().lerp(outerCool, 0.7).lerp(sun, 0.3),
      outerHot: outerCool.clone().lerp(sun, 0.45),
      /*
       * The far side of the blade, and the reason three rounds of review kept
       * reporting that "leaf 3 never lights up".
       *
       * It always did — the uniforms were byte-identical to the others every
       * frame. What differed was which *face* was pointed at the lens. A leaf
       * here is painted duller and greener underneath than on top, which is
       * true of leaves and is most of what stops a plant reading as flat; but
       * the camera walks 120° round the plant, so on some bearings a leaf shows
       * its back, and a label printed on the back of a leaf was dark ink on
       * mid-green while its neighbours sat on pale yellow.
       *
       * So the underside is relit too. Only for the leaf being read, and only
       * while it is being read: the rest of the time a leaf still has a top and
       * a bottom.
       */
      underCool: new Color(under),
      underHot: new Color(under).lerp(outerCool, 0.55).lerp(sun, 0.4),
    };
  }, [biome, under]);

  const uniforms = useMemo(
    () =>
      petalUniforms({
        inner: biome.bright,
        outer: biome.litB,
        under,
        underside: 0.6,
        // The sun is behind the field, so anything thin in front of it lights
        // up from the far side — through the leaf's own colour, which is what
        // uTint is for.
        backlight: 0.55,
        tint: 1,
        veins: 0.85,
        midrib: 1,
        /*
         * Flatter than a leaf would otherwise be shaded, because these four
         * are written on.
         *
         * The default smooth falloff takes the upper third of a blade well
         * down, which is correct for a curved sheet and ruinous for a page:
         * the label's first line was landing on the dark part of the leaf in
         * dark ink and simply disappearing, while its last line sat on the lit
         * part and read cleanly. `uFlat` trades the falloff for a graphic one
         * — narrower range, so the surface stays one legible tone across its
         * width and only the veins and the midrib break it up.
         */
        flat: 0.82,
      }),
    [biome, under],
  );

  /*
   * The leaf being read lights up, and keeps a little of it afterwards.
   *
   * This used to peak at 0.3, which was the right number while the copy was in
   * a card floating beside the plant and the leaf was decoration. It is not
   * decoration now: the card is gone and the label is type printed on this
   * blade, so the reader has to be able to find the page the words are on in a
   * frame that is otherwise a wall of grass. It is lit nearly as hard as a
   * petal at its own station, and it holds a trace of it after, so a leaf you
   * have already opened is still findable.
   *
   * The hover is the same idea one step further: the cursor is on the leaf, so
   * the leaf answers. It tips up toward the reader and takes another stop of
   * light — the lift through `leafAt`, so the type printed on it turns by
   * exactly the same amount and stays where it was written.
   */
  /*
   * The leaf being read is *relit*, not brightened.
   *
   * `uGlow` adds `base * uGlow`, which is proportional to the colour already
   * there — so it lifts a leaf that is already catching the light and does
   * almost nothing for one facing away from it. That is the whole reason the
   * fourth leaf stayed unreadable through three rounds of trying to fix its
   * label: it sits in shadow at its own chapter, dark ink on dark green, and no
   * amount of a multiply was ever going to rescue it.
   *
   * So the two body stops themselves are moved. At its station a leaf's ramp
   * runs to `hot` — the biome's lit green taken up toward the sun's own colour —
   * which is a floor on how bright the surface can be regardless of which way it
   * happens to point. It is the same thing a highlighter does: not more light on
   * the page, a different page.
   */
  useFrame((_, dt) => {
    const lift = stepLeafHover(index, dt);
    if (mesh.current) mesh.current.rotation.x = leafAt(index).rotation[0];
    if (!material.current) return;
    const c = scrollState.smooth;
    const read = clamp(stationGlow(c, at, 0.06) + lift * 0.3);
    const u = material.current.uniforms;
    u.uInner.value.copy(ramp.innerCool).lerp(ramp.innerHot, read);
    u.uOuter.value.copy(ramp.outerCool).lerp(ramp.outerHot, read);
    u.uUnder.value.copy(ramp.underCool).lerp(ramp.underHot, read);
    /*
     * And the lift goes through `uGlow`, not through the ramp alone.
     *
     * The ramp is multiplied by the surface's own shading, which runs 0.40 to
     * 0.76 here — so a leaf turned away from the key light kept only two fifths
     * of whatever colour it was given, and the third leaf, which faces away at
     * its own chapter, stayed mid-green through three rounds of being handed a
     * hotter and hotter ramp. `uGlow` is added *after* shading, so it is the one
     * term that does not care which way a blade points. It is what makes all
     * four arrive at the same brightness rather than at the same tint.
     *
     * A trace stays afterwards, so a leaf you have already opened is findable.
     */
    u.uGlow.value = (c > at ? 0.08 : 0) + read * 0.85;

    /*
     * No fade. Every leaf is solid, all the time.
     *
     * The other three used to drop to a tenth while one was being read, which
     * worked and was a plaster: it stopped a leaf standing in front of the leaf
     * whose label was on screen by making the offender nearly invisible, at the
     * cost of a plant that thinned out whenever you looked at it. The
     * arrangement solves it instead — see LEAF_YAW in lib/flowerLayout, where
     * every leaf's heading is chosen so that at any leaf's own chapter, every
     * leaf above it is turned to the far side of the stem and cannot be between
     * the lens and the blade being read.
     */
  });

  return (
    <mesh ref={mesh} geometry={geometry} position={position} rotation={rotation}>
      <shaderMaterial
        ref={material}
        vertexShader={PETAL_VERT}
        fragmentShader={PETAL_FRAG}
        uniforms={uniforms}
        side={DoubleSide}
        fog
      />
    </mesh>
  );
}

/**
 * One petal, one feature. It lights when its card is being read and stays a
 * shade brighter afterwards, so the bloom fills in as you go round it — the
 * same behaviour the DOM site's petals have.
 */
/*
 * What makes each petal its own. Seeded, so the flower is the same flower on
 * every load. Length and tilt are held within a few millimetres of nominal —
 * the feature labels hang off the nominal tips — and everything else is free
 * to vary: width, cup, curl, a lean and a twist, unequal halves, ruffled
 * margins, an uneven outline, and a colour a shade off its neighbours.
 */
function petalCharacter(index: number) {
  const rnd = makeRandom(0x5eed + index * 7919);
  const r = () => rnd() * 2 - 1;
  return {
    length: PETAL.length * (1 + 0.02 * r()),
    width: PETAL.width * (1 + 0.08 * r()),
    /*
     * Opposite cupping per whorl, which is what lets them overlap at all. The
     * outer petals are domed, edges falling away; the inner ones are cupped,
     * edges rising. Wherever they overlap, the inner petal's raised margin
     * then rides over the outer one and the outer's lowered margin tucks under
     * the inner — where with every petal domed alike, each inner margin dived
     * a couple of centimetres through its neighbour's midrib.
     */
    cup: (index % 2 === 1 ? -0.35 : 0.2) + 0.05 * r(),
    curl: 0.3 + 0.07 * r(),
    tip: 0.7 + 0.08 * r(),
    lean: 0.018 * r(),
    twist: 0.14 * r(),
    asym: 0.07 * r(),
    ruffle: 0.0022 + 0.0016 * rnd(),
    ruffleWaves: 5 + 2.5 * rnd(),
    rufflePhase: rnd() * Math.PI * 2,
    wobble: 0.025 + 0.02 * rnd(),
    wobblePhase: rnd() * Math.PI * 2,
    tilt: 0.018 * r(),
    yaw: 0.025 * r(),
    hue: 0.012 * r(),
    light: 0.035 * r(),
    seed: rnd() * 40,
  };
}

/** How petal `i` is set on the head: aimed round it, then lifted. YXZ, because
    under the default order the lift is about a world axis and the ring comes
    out lopsided. */
function petalPose(i: number, look: ReturnType<typeof petalCharacter>) {
  return new Euler(-petalTilt(i) - look.tilt, -petalAngle(i) + Math.PI / 2 + look.yaw, 0, "YXZ");
}

/*
 * All eight are shaped together, because no petal can be shaped on its own any
 * more: each is placed in the head and the overlapping neighbours are pushed
 * clear of each other — inner whorl resting on the outer — before they are
 * thickened.
 *
 * That pass is a few tens of milliseconds, so it is not paid at startup. The
 * petals go up first as built — the whorls and cupping above already keep the
 * worst contact to a millimetre or so at the base, invisible from the opening
 * shot where the flower is a speck — and the separated set is worked out in
 * idle time after the grow-in and swapped in, long before the camera arrives.
 * Done once; the petals do not change with the biome.
 */
let bloomPetals: BufferGeometry[] | null = null;
const petalListeners = new Set<() => void>();

function petalGeometries(): BufferGeometry[] {
  if (bloomPetals) return bloomPetals;
  const looks = Array.from({ length: PETAL_COUNT }, (_, i) => petalCharacter(i));
  const poses = looks.map((look, i) => new Matrix4().makeRotationFromEuler(petalPose(i, look)));
  const surfaces = looks.map((look) =>
    petalSurface({
      length: look.length,
      width: look.width,
      cup: look.cup,
      curl: look.curl,
      tip: look.tip,
      lean: look.lean,
      twist: look.twist,
      asym: look.asym,
      ruffle: look.ruffle,
      ruffleWaves: look.ruffleWaves,
      rufflePhase: look.rufflePhase,
      wobble: look.wobble,
      wobblePhase: look.wobblePhase,
      // Tapered to a claw at the base. Without it, petals of the same whorl —
      // a quarter turn apart — crowded through each other just outside the
      // disc, which is exactly what the view from above looks at.
      claw: 0.5,
      // A solid with an edge, not a sheet: 2 mm at the base, under 1 mm at
      // the tip, thinner again at the margins.
      thickness: 0.002,
      thicknessTip: 0.0007,
      // The bloom is seen from underneath through the whole of the first
      // project, and the ruffles need the rows to show.
      nu: 40,
      nv: 18,
    }),
  );
  bloomPetals = surfaces.map(petalSolid);
  separateLater(
    surfaces.map((surface, i) => transformSurface(surface, poses[i])),
    poses,
  );
  return bloomPetals;
}

function separateLater(surfaces: ReturnType<typeof petalSurface>[], poses: Matrix4[]) {
  if (typeof window === "undefined") return;
  type Deadline = { timeRemaining(): number };
  const idle =
    (window as { requestIdleCallback?: (cb: (d: Deadline) => void) => number }).requestIdleCallback ??
    ((cb: (d: Deadline) => void) => window.setTimeout(() => cb({ timeRemaining: () => 8 }), 60));
  /*
   * Who lies on whom, for every pair that can touch, as (lower, upper). Inner
   * whorl over outer; and within each whorl the arrangement is contorted, as
   * in a hibiscus — every petal over its clockwise neighbour and under the
   * other, one margin up and one tucked, which goes round the ring without
   * contradiction. Opposite petals only meet under the disc and are skipped.
   */
  const pairs: [number, number][] = [];
  for (let a = 0; a < PETAL_COUNT; a++) {
    for (let b = a + 1; b < PETAL_COUNT; b++) {
      const apart = b - a;
      if (apart === PETAL_COUNT / 2) continue;
      const aInner = a % 2 === 1;
      const bInner = b % 2 === 1;
      if (aInner !== bInner) pairs.push(aInner ? [b, a] : [a, b]);
      else if (apart === 2) pairs.push([b, a]);
      else if (apart === PETAL_COUNT - 2) pairs.push([a, b]);
    }
  }
  const steps = separateSteps(surfaces, pairs, {
    minRadius: 0.021,
    verify: import.meta.env.DEV,
  });
  const solids: BufferGeometry[] = [];
  let separated = false;

  const work = (deadline: Deadline) => {
    // Not while the field is still coming up.
    if (!settled()) {
      window.setTimeout(() => idle(work), 300);
      return;
    }
    while (deadline.timeRemaining() > 4) {
      if (!separated) {
        const step = steps.next();
        if (step.done) {
          separated = true;
          if (import.meta.env.DEV) {
            (window as unknown as { __petals?: unknown }).__petals = step.value;
          }
        }
      } else if (solids.length < surfaces.length) {
        const n = solids.length;
        solids.push(petalSolid(transformSurface(surfaces[n], poses[n].clone().invert())));
      } else {
        const old = bloomPetals;
        bloomPetals = solids;
        petalListeners.forEach((swap) => swap());
        // Give the swap a frame to land before the old buffers go.
        window.setTimeout(() => old?.forEach((g) => g.dispose()), 1000);
        return;
      }
    }
    idle(work);
  };
  idle(work);
}

function Petal({ index }: { index: number }) {
  const material = useRef<ShaderMaterial>(null);
  const at = featureChapter(index);
  const look = useMemo(() => petalCharacter(index), [index]);
  const [geometry, setGeometry] = useState(() => petalGeometries()[index]);
  useEffect(() => {
    const swap = () => bloomPetals && setGeometry(bloomPetals[index]);
    petalListeners.add(swap);
    swap(); // in case the separated set landed before this mounted
    return () => {
      petalListeners.delete(swap);
    };
  }, [index]);
  const pose = useMemo(() => petalPose(index, look), [index, look]);
  const uniforms = useMemo(() => {
    const shade = (hex: string) =>
      `#${new Color(hex).offsetHSL(look.hue, 0, look.light).getHexString()}`;
    return petalUniforms({
      inner: shade("#e0913d"),
      outer: shade("#f6dfa6"),
      detail: 1,
      seed: look.seed,
    });
  }, [look]);

  useFrame(() => {
    if (!material.current) return;
    const c = scrollState.smooth;
    const reached = c > at ? 0.16 : 0;
    material.current.uniforms.uGlow.value =
      reached + stationGlow(c, at, 0.045) * 0.5;
    material.current.uniforms.uNight.value = nightness();
  });

  return (
    <mesh
      geometry={geometry}
      rotation={pose}
    >
      <shaderMaterial
        ref={material}
        vertexShader={PETAL_VERT}
        fragmentShader={PETAL_FRAG}
        uniforms={uniforms}
        side={DoubleSide}
        fog
      />
    </mesh>
  );
}

/*
 * The receptacle: the swelling at the top of the stem that the petals grow out
 * of. Without it the stem ran straight into eight petal points meeting at
 * nothing, and from below — which is where the camera spends the whole of the
 * first project — the open bottom of the floret cushion showed through the gaps
 * between the petal bases as flat brown facets. It sits below the petals at
 * every radius (they rise at ~30°, it at less), so it closes the head from
 * underneath without touching the bloom as seen from above. It is widest at
 * the height of the cushion's open rim (4 mm, 24 mm out), which is what it has
 * to cover, and stays under 7 mm so it never shows through the petals' dipped
 * edges from above.
 */
const RECEPTACLE = new LatheGeometry(
  (
    [
      [0.0, -0.014],
      [0.0062, -0.014],
      [0.0064, -0.009],
      [0.0078, -0.005],
      [0.0115, -0.0022],
      [0.0175, 0.0],
      [0.0228, 0.0016],
      [0.0258, 0.0034],
      [0.0267, 0.005],
      [0.0252, 0.0062],
      [0.02, 0.0068],
      [0.0, 0.007],
    ] as const
  ).map(([r, y]) => new Vector2(r, y)),
  40,
);
// The lathe's v runs bottom to top, which is the stem material's dark-to-bright,
// and it brings its own seamless normals.

const SEPAL_COUNT = PETAL_COUNT;
/** Where on the receptacle the sepals leave it, and how far below level they
    point: out and a little down, well clear of the petals above them. */
const SEPAL = { length: 0.04, width: 0.02, root: 0.02, rise: 0.003, droop: 0.14 };

function Calyx({ biome }: { biome: Biome }) {
  const sepal = useMemo(
    () => petalGeometry({ length: SEPAL.length, width: SEPAL.width, cup: 0.35, curl: 0.08, tip: 0.9, nu: 20, nv: 8 }),
    [],
  );
  const receptacleUniforms = useMemo(
    () =>
      petalUniforms({
        inner: biome.bright,
        outer: biome.litA,
        backlight: 0,
        veins: 0.5,
        flat: 0.6,
      }),
    [biome],
  );
  const sepalUniforms = useMemo(
    () =>
      petalUniforms({
        inner: biome.bright,
        outer: biome.litA,
        under: biome.deep,
        underside: 0.35,
        backlight: 0.5,
        tint: 1,
        veins: 0,
        midrib: 0.8,
        flat: 0.35,
      }),
    [biome],
  );

  return (
    <group>
      <mesh geometry={RECEPTACLE}>
        <shaderMaterial
          vertexShader={PETAL_VERT}
          fragmentShader={PETAL_FRAG}
          uniforms={receptacleUniforms}
          side={DoubleSide}
          fog
        />
      </mesh>
      {Array.from({ length: SEPAL_COUNT }, (_, i) => {
        // Between the petals, not under them, so each one shows in a gap.
        const a = petalAngle(i) + Math.PI / PETAL_COUNT;
        return (
          <mesh
            key={i}
            geometry={sepal}
            position={[Math.cos(a) * SEPAL.root, SEPAL.rise, Math.sin(a) * SEPAL.root]}
            rotation={[SEPAL.droop, -a + Math.PI / 2, 0, "YXZ"]}
          >
            <shaderMaterial
              vertexShader={PETAL_VERT}
              fragmentShader={PETAL_FRAG}
              uniforms={sepalUniforms}
              side={DoubleSide}
              fog
            />
          </mesh>
        );
      })}
    </group>
  );
}

/*
 * The disc: a dome of florets rather than a smooth brown cap.
 *
 * A composite flower's centre is hundreds of tiny flowers packed in the two
 * crossing spirals the golden angle makes — the pattern is the detail the eye
 * looks for, and a featureless dome is what made the centre read as a button.
 * Closed buds in the middle, dark and tight; opening and turning gold toward
 * the rim; a ring of stamens standing out of the last of them. All instanced:
 * three draws for the lot.
 */
const CUSHION = { radius: 0.024, y: 0.004, cap: 1.15 };
const FLORETS = 380;
const STAMENS = 30;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FLORET = new SphereGeometry(1, 9, 6);
const FILAMENT = new CylinderGeometry(1, 1, 1, 5, 1).translate(0, 0.5, 0);
const ANTHER = new SphereGeometry(1, 8, 6);
const UP_Y = new Vector3(0, 1, 0);

function Disc() {
  const florets = useRef<InstancedMesh>(null);
  const filaments = useRef<InstancedMesh>(null);
  const anthers = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const rnd = makeRandom(0xd15c);
    const m = new Matrix4();
    const q = new Quaternion();
    const n = new Vector3();
    const p = new Vector3();
    const sc = new Vector3();
    const col = new Color();
    const bud = new Color("#2f2410");
    const mid = new Color("#5a3517");
    const ring = new Color("#b9802a");
    const open = new Color(COLOR.bloom);
    const { radius, y, cap } = CUSHION;
    const onDome = (theta: number, phi: number, lift: number) => {
      n.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
      return p.copy(n).multiplyScalar(radius + lift).add(sc.set(0, y, 0));
    };

    const f = florets.current;
    if (f) {
      const cosCap = Math.cos(cap);
      for (let i = 0; i < FLORETS; i++) {
        const s = (i + 0.5) / FLORETS;
        // Equal area over the cap, turned by the golden angle each step.
        const theta = Math.acos(1 - s * (1 - cosCap));
        const phi = i * GOLDEN;
        const at = onDome(theta, phi, -0.0003).clone();
        q.setFromUnitVectors(UP_Y, n);
        // Bigger and more open toward the rim; buds in the middle sit proud.
        const r = (0.00092 + 0.0006 * s) * (0.85 + 0.3 * rnd());
        const tall = s < 0.6 ? 1.15 + 0.25 * rnd() : 0.8 + 0.25 * rnd();
        m.compose(at, q, sc.set(r, r * tall, r));
        f.setMatrixAt(i, m);
        if (s < 0.35) col.copy(bud).lerp(mid, s / 0.35);
        else if (s < 0.78) col.copy(mid).lerp(ring, (s - 0.35) / 0.43);
        else col.copy(ring).lerp(open, (s - 0.78) / 0.22);
        col.multiplyScalar(0.88 + 0.24 * rnd());
        f.setColorAt(i, col);
      }
      f.instanceMatrix.needsUpdate = true;
      if (f.instanceColor) f.instanceColor.needsUpdate = true;
      f.computeBoundingSphere();
    }

    const fil = filaments.current;
    const ant = anthers.current;
    if (fil && ant) {
      for (let i = 0; i < STAMENS; i++) {
        const phi = (i / STAMENS) * Math.PI * 2 + (rnd() - 0.5) * 0.15;
        const theta = 0.92 + 0.16 * rnd();
        const base = onDome(theta, phi, -0.0004).clone();
        // Out along the dome's normal, leaning up a little more than it does.
        const dir = n.clone().lerp(UP_Y, 0.35).normalize();
        const len = 0.0042 + 0.0022 * rnd();
        q.setFromUnitVectors(UP_Y, dir);
        m.compose(base, q, sc.set(0.00028, len, 0.00028));
        fil.setMatrixAt(i, m);
        const tip = base.addScaledVector(dir, len);
        m.compose(tip, q, sc.set(0.00055, 0.001, 0.00055));
        ant.setMatrixAt(i, m);
      }
      fil.instanceMatrix.needsUpdate = true;
      ant.instanceMatrix.needsUpdate = true;
      fil.computeBoundingSphere();
      ant.computeBoundingSphere();
    }
  }, []);

  return (
    <group>
      {/* What shows between the florets: the receptacle's dark top. */}
      <mesh position={[0, CUSHION.y, 0]}>
        <sphereGeometry args={[CUSHION.radius, 32, 16, 0, Math.PI * 2, 0, CUSHION.cap]} />
        <meshStandardMaterial color="#2a1d10" roughness={0.9} />
      </mesh>
      <instancedMesh ref={florets} args={[FLORET, undefined, FLORETS]}>
        <meshStandardMaterial roughness={0.7} emissive={COLOR.ember} emissiveIntensity={0.06} />
      </instancedMesh>
      <instancedMesh ref={filaments} args={[FILAMENT, undefined, STAMENS]}>
        {/* Lit from within a little: hair-thin, they catch almost no light. */}
        <meshStandardMaterial color="#e6d08a" emissive="#b8913a" emissiveIntensity={0.35} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={anthers} args={[ANTHER, undefined, STAMENS]}>
        <meshStandardMaterial
          color={COLOR.bloom}
          emissive={COLOR.bloom}
          emissiveIntensity={0.45}
          roughness={0.55}
        />
      </instancedMesh>
    </group>
  );
}

function Bloom({ biome }: { biome: Biome }) {
  const group = useRef<Group>(null);
  const calm = reducedMotion();

  useFrame((state) => {
    if (!group.current || calm) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.55) * 0.022;
    group.current.rotation.x = Math.cos(t * 0.43) * 0.018;
  });

  return (
    <group ref={group} position={[FLOWER.x, FLOWER.height, FLOWER.z]}>
      {Array.from({ length: PETAL_COUNT }, (_, i) => (
        <Petal key={i} index={i} />
      ))}
      <Calyx biome={biome} />

      {/* The centre, which is the part the camera is closest to for the whole
          of the features act. Only the dome above where it meets the petals —
          about 22 mm out — is kept: the full hemisphere's lower rim hung
          under the petals and showed from below as flat brown facets. */}
      <Disc />
    </group>
  );
}


/**
 * A shadow behind the plant.
 *
 * The field is deliberately dense and deliberately one colour, which is right
 * for a meadow and wrong for a subject standing in it: through the middle
 * three acts the flower is competing with several hundred blades that are the
 * same size on screen and about as bright. This is the cheapest thing that
 * fixes it — a soft dark disc, always square to the lens, sitting a hand's
 * width behind the plant, so the grass immediately around it falls off and the
 * bloom has something to be lighter than.
 *
 * It is not a drop shadow and there is no light casting it. It is the same
 * trick as the copy's backdrop: an edgeless darkening, present only where it
 * is needed, gone before you could point at it.
 */
function Halo() {
  const mesh = useRef<Mesh>(null);
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uColor: { value: new Color(COLOR.void) }, uOpacity: { value: 0 } }),
    [],
  );
  const toCamera = useMemo(() => new Vector3(), []);
  /** What it is a shadow of: a point on the stem, a little under the head. */
  const anchor = useMemo(
    () => new Vector3(FLOWER.x, FLOWER.height * 0.62, FLOWER.z),
    [],
  );

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const c = scrollState.smooth;
    // Up as the camera closes on the plant, down as it leaves the stem.
    const on =
      clamp((c - 1.5) / 0.35) * (1 - clamp((c - 3.75) / 0.5)) * 0.72;
    uniforms.uOpacity.value = on;
    m.visible = on > 0.004;
    if (!m.visible) return;

    // Behind the plant from wherever the lens happens to be, and square to it.
    //
    // The bearing is taken from the plant, not from the group the disc hangs
    // in: that group sits at the world origin, and a bearing measured from
    // there is only the same line while the camera is far enough away for the
    // two to converge. Close in it is not — it put the shadow five centimetres
    // off through the bloom and seventeen off at the plant's foot, which is
    // furthest wrong exactly where the camera is nearest and the error shows.
    toCamera.copy(state.camera.position).sub(anchor).normalize();
    m.position.copy(anchor).addScaledVector(toCamera, -0.16);
    m.quaternion.copy(state.camera.quaternion);
  });

  return (
    <mesh ref={mesh} renderOrder={-5}>
      <circleGeometry args={[0.62, 48]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        // A disc this soft is nearly all ramp, and by the stem act it is wider
        // than the frame — a hundred-odd steps of alpha spread over the whole
        // picture, which is the exact shape that comes out as rings.
        dithering
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;

          #include <common>
          #include <dithering_pars_fragment>

          void main() {
            // Spent well inside its own rim, so there is no edge to see.
            float r = length(vUv - 0.5) * 2.0;
            float a = pow(1.0 - clamp(r, 0.0, 1.0), 2.1);
            gl_FragColor = vec4(uColor, a * uOpacity);
            #include <dithering_fragment>
          }
        `}
      />
    </mesh>
  );
}

export default function Flower({ biome }: { biome: Biome }) {
  // The pale side of a leaf, mixed back toward the haze it is standing in. The
  // lit tip colour on its own is the brightest thing in the biome's palette,
  // and the one rule the scene has is that nothing averages brighter than a
  // mid-dark green.
  const under = useMemo(
    () => `#${new Color(biome.litB).lerp(new Color(biome.haze), 0.6).getHexString()}`,
    [biome],
  );

  return (
    <group>
      <Halo />
      <Stem biome={biome} />
      <Roots />
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <Leaf key={i} index={i} biome={biome} under={under} />
      ))}
      <Bloom biome={biome} />
    </group>
  );
}
