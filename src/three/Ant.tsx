import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLOWER } from "@/lib/flowerLayout";
import { sampleCamera } from "@/lib/journey";
import { clamp } from "@/lib/math";
import { scrollState } from "@/lib/scroll";
import { reducedMotion } from "./quality";

/**
 * An ant, coming down the stem ahead of the camera.
 *
 * Her one rule: stride is a function of distance covered, not of elapsed time.
 * She moves when you move and stands still when you stop, which is what keeps
 * her from reading as an animation looping behind the copy — and it is why the
 * walkthrough feels like something you are travelling down rather than
 * something playing at you.
 *
 * She is also never faded in or switched on. She is sitting under the flower
 * head from long before you could resolve her, waits out the whole features
 * act tucked up where the receptacle overhangs the stem, and only starts down
 * as the camera leaves the bloom — so the first time she is legible she is
 * already walking, and nothing ever appears out of empty air.
 *
 * The model is a red wood ant (Formica rufa) built from the anatomy rather than
 * from beads: lathed, flattened body sections with a pronotal hump and a
 * sloping propodeum, an upright scale for a petiole, a gaster made of
 * overlapping plates, compound eyes, toothed mandibles, elbowed antennae of a
 * scape and eleven beaded segments thickening to a club, and legs of coxa,
 * femur, tibia and five-part tarsus. The legs are solved every frame — feet
 * planted on the stem's actual curve through the stance, lifted and swung
 * through in an alternating tripod — so they grip the stem instead of rowing
 * through the air beside it.
 */

/*
 * The stem's centre line and its taper. This repeats the control points in
 * three/Flower.tsx, which keeps its curve private: an ant placed on a straight
 * axis through FLOWER.x/z instead would float a full stem's width clear of the
 * plant around half height, which is exactly where the stem leans furthest out.
 */
const STEM = new CatmullRomCurve3([
  new Vector3(FLOWER.x, 0, FLOWER.z),
  new Vector3(FLOWER.x + 0.022, FLOWER.height * 0.3, FLOWER.z - 0.014),
  new Vector3(FLOWER.x - 0.015, FLOWER.height * 0.62, FLOWER.z + 0.012),
  new Vector3(FLOWER.x, FLOWER.height * 0.9, FLOWER.z),
  new Vector3(FLOWER.x, FLOWER.height, FLOWER.z),
]);
/*
 * The same taper three/Flower.tsx gives the tube — including the flare in the
 * last couple of centimetres above the soil. Without the flare she walked the
 * final stretch of the FAQ half a centimetre inside the stem, and her shadow
 * with her.
 */
const stemRadius = (t: number) => 0.0105 * (1 - 0.4 * t * t) * (1 + 1.6 * Math.exp(-t / 0.045));

/** Where she waits: high enough that the receptacle overhangs her completely. */
const T_WAIT = 0.985;
const T_FOOT = 0.055;
/** The pan down the stem is chapter 3 to 4. */
const DESCENT_FROM = 3;
/*
 * How far she runs ahead of, and falls behind, the camera's own aim. Two cycles
 * over the descent so the drift is zero at both ends, and small enough that her
 * progress stays monotonic — she may dawdle, but she must never climb back up.
 */
const DRIFT = 0.055;

/**
 * The last stretch, walked after the camera has stopped.
 *
 * The descent below tracks the camera, so on its own it would stop when the
 * camera does — and the camera stops early, at about a third of the stem: the
 * soil act is aimed at the plant's foot and holds there for the whole of the
 * questions. That hold is the point of these two numbers. The reader arrives at
 * the floor, the shot settles, and the one thing still moving in the frame is
 * the ant, finishing her climb down over the length of the FAQ.
 *
 * She stays on the stem to do it rather than stepping off onto the soil, which
 * is what this first tried. The ground around the foot is the one part of the
 * shot that is *not* clear: the camera is a third of a metre out and the grass
 * in between is what it is looking through, so an ant out there is behind a
 * blade about half the time. The stem is the subject of the act and is
 * therefore the one surface guaranteed to be in view.
 */
const FOOT_AT = 4.1;
const FOOT_UNTIL = 5.4;
/** Radians of leg cycle per metre travelled: near enough a body length a step.
    The legs' stance stroke is derived from this, so keep the two together. */
const STRIDE = 700;


/*
 * Red wood ant colouring: rust head and mesosoma, a near-black gaster. That
 * split is what the species looks like and it is also what keeps her legible —
 * the field has no red in it anywhere else, so the warm front half separates
 * from the green stem by hue alone, and the dark gaster gives the silhouette a
 * weight at one end the way a real ant's does. Clearcoat stands in for the
 * waxy cuticle: the one low key light catches it as a hard highlight along
 * each section, which is how three segments stay legible at forty pixels.
 */
const chitin = (color: string, roughness: number, clearcoat = 0.7) =>
  new MeshPhysicalMaterial({
    color,
    roughness,
    clearcoat,
    clearcoatRoughness: 0.22,
  });
const M_HEAD = chitin("#8f3a17", 0.42);
const M_MESO = chitin("#a8491f", 0.4);
const M_GASTER = new MeshPhysicalMaterial({
  color: "#2a1610",
  roughness: 0.4,
  clearcoat: 0.85,
  clearcoatRoughness: 0.18,
  // The fine pubescence on a wood ant's gaster, as a soft rim rather than hairs.
  sheen: 0.5,
  sheenColor: "#8a6a4c",
  sheenRoughness: 0.6,
});
const M_FEMUR = chitin("#7a3416", 0.5, 0.5);
const M_TIBIA = chitin("#5a2712", 0.5, 0.5);
const M_ANTENNA = chitin("#4e2310", 0.55, 0.4);
const M_EYE = new MeshPhysicalMaterial({
  color: "#1a0f0a",
  roughness: 0.2,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  flatShading: true,
});
const M_MANDIBLE = new MeshPhysicalMaterial({
  color: "#5c2410",
  roughness: 0.35,
  clearcoat: 0.8,
  side: DoubleSide,
});

/*
 * The whole ant is laid out in units where she is about 34 long from gaster tip
 * to mandible and stands about 11 tall, and scaled once on the way into the
 * scene. Readable numbers for the anatomy; one multiply for the world.
 */
const U = 0.00042;
const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);

type P = readonly [number, number, number];
const v3 = (p: P) => new Vector3(p[0], p[1], p[2]);

/* ---------------------------------------------------------------- geometry */

/**
 * A body section: a profile of [z, radius] pairs, back to front, turned into a
 * solid about the long axis and then shaped per slice — `sx`/`sy` flatten or
 * widen it, `cy` bends the centre line so a section can hump or slope. The seam
 * the lathe leaves is welded so the shading runs round it unbroken.
 */
function section(
  profile: readonly (readonly [number, number])[],
  {
    sx = () => 1,
    sy = () => 1,
    cy = () => 0,
  }: { sx?: (z: number) => number; sy?: (z: number) => number; cy?: (z: number) => number },
): BufferGeometry {
  const lathe = new LatheGeometry(
    profile.map(([z, r]) => new Vector2(Math.max(r, 1e-4), z)),
    28,
  );
  lathe.rotateX(Math.PI / 2); // the lathe's axis onto +z, the ant's forward
  const pos = lathe.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setXYZ(i, pos.getX(i) * sx(z), pos.getY(i) * sy(z) + cy(z), z);
  }
  lathe.deleteAttribute("normal");
  lathe.deleteAttribute("uv");
  const welded = mergeVertices(lathe, 1e-3);
  welded.computeVertexNormals();
  return welded;
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* Head: broad behind the eyes, narrowing to the clypeus, flattened top to
   bottom and carried with the face tipped a little down. */
const HEAD = section(
  [
    [7.6, 0],
    [7.75, 1.5],
    [8.2, 2.6],
    [9.1, 3.25],
    [10.4, 3.45],
    [11.8, 3.3],
    [13.0, 2.85],
    [14.0, 2.1],
    [14.55, 1.2],
    [14.75, 0],
  ],
  {
    sx: (z) => 1 + 0.07 * (1 - smooth(9, 13, z)),
    sy: () => 0.74,
    cy: (z) => 8.7 - (z - 10.5) * 0.14,
  },
);

/* Mesosoma: the pronotum rises into a hump behind the neck, the back dips at
   the mesonotal groove, and the propodeum slopes down to the waist. */
const MESOSOMA = section(
  [
    [-3.7, 0],
    [-3.45, 1.15],
    [-2.8, 1.85],
    [-1.6, 2.05],
    [-0.3, 1.75],
    [0.9, 1.95],
    [2.3, 2.45],
    [3.7, 2.75],
    [5.1, 2.55],
    [6.1, 1.9],
    [6.6, 0.95],
    [6.75, 0],
  ],
  {
    sx: () => 0.84,
    sy: () => 1,
    cy: (z) => 6.9 + 0.55 * Math.exp(-(((z - 3.5) / 2.1) ** 2)) - 0.35 * (1 - smooth(-3.5, -0.5, z)),
  },
);

/* Gaster: an egg of overlapping plates. Each tergite's rim stands a fraction
   proud of the one behind it — the steps are what catch the light as bands. */
const GASTER_BACK = -16.4;
const GASTER_FRONT = -5.9;
const SUTURES = [-8.3, -10.6, -13.0];
const GASTER = section(
  (() => {
    const pts: [number, number][] = [];
    const radius = (z: number) => {
      const s = (z - GASTER_BACK) / (GASTER_FRONT - GASTER_BACK);
      return 4.7 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.94 + 0.03)), 0.72) * (1.04 - 0.2 * s);
    };
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const z = GASTER_BACK + ((GASTER_FRONT - GASTER_BACK) * i) / n;
      let r = i === 0 || i === n ? 0 : radius(z);
      // Just behind each suture the next plate tucks under this one's rim.
      for (const sz of SUTURES) if (z < sz && z > sz - 0.45) r -= 0.16 * (1 - (sz - z) / 0.45);
      pts.push([z, r]);
    }
    return pts;
  })(),
  {
    sy: () => 0.9,
    cy: (z) => 7.7 + (-z - 6) * 0.035,
  },
);

/* Small parts share unit shapes and are scaled per use. */
const BEAD = new SphereGeometry(1, 14, 10);
const EYE = new IcosahedronGeometry(1, 2); // faceted on purpose: ommatidia
/** A unit segment from the origin up +y, tapering from `r0` to `r1`. */
const rod = (r0: number, r1: number, radial = 8) =>
  new CylinderGeometry(r1, r0, 1, radial, 1).translate(0, 0.5, 0);

/* A mandible blade, toothed along its inner edge, in its own plane. */
function mandible(side: 1 | -1): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(2.8, -0.35, 4.3, 2.5); // outer edge round to the tip
  const teeth: [number, number][] = [
    [3.7, 2.35], [3.55, 2.75], [3.0, 2.3], [2.85, 2.6], [2.3, 2.05], [2.15, 2.3], [1.6, 1.85],
  ];
  for (const [u, w] of teeth) s.lineTo(u, w);
  s.lineTo(0.4, 1.6);
  s.lineTo(0, 1.5);
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: 0.4,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 1,
    curveSegments: 8,
  });
  // Shape u → forward (+z), w → inward (toward the midline), depth → up.
  g.applyMatrix4(new Matrix4().set(0, -side, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  g.computeVertexNormals();
  return g;
}
const MANDIBLE_R = mandible(1);
const MANDIBLE_L = mandible(-1);

/* ---------------------------------------------------------------- legs */

type LegType = {
  /** Where the coxa leaves the body, and where it ends (the hip proper). */
  root: P;
  hip: P;
  /** Where the tarsus tip rests mid-stance, before the stem's curve is applied. */
  rest: P;
  femur: number;
  tibia: number;
  tarsus: number;
  phase: number;
  femurGeo: BufferGeometry;
  tibiaGeo: BufferGeometry;
};

/*
 * Fore, mid and hind, right side; the left is the mirror. Hind legs longest,
 * as in the animal, and splayed back; fore legs reach forward under the head.
 * Phases make an alternating tripod: right fore, left mid and right hind
 * together, then the other three.
 */
const LEG_TYPES: readonly LegType[] = [
  {
    root: [0.9, 5.6, 4.7], hip: [2.0, 4.7, 5.0], rest: [7.4, 0, 12.4],
    femur: 6.6, tibia: 6.2, tarsus: 5.0, phase: 0,
    femurGeo: rod(0.7, 0.55), tibiaGeo: rod(0.48, 0.4),
  },
  {
    root: [0.9, 5.5, 1.3], hip: [2.1, 4.6, 1.3], rest: [10.4, 0, 1.6],
    femur: 7.6, tibia: 7.6, tarsus: 5.6, phase: Math.PI,
    femurGeo: rod(0.68, 0.52), tibiaGeo: rod(0.46, 0.38),
  },
  {
    root: [0.9, 5.4, -1.6], hip: [2.1, 4.5, -1.9], rest: [9.6, 0, -11.6],
    femur: 9.0, tibia: 9.6, tarsus: 7.0, phase: 0,
    femurGeo: rod(0.7, 0.52), tibiaGeo: rod(0.46, 0.36),
  },
];
const COXA = rod(0.95, 0.72);
const rodGeo = {
  petiole: rod(0.75, 0.6),
  neck: rod(1.25, 1.05),
};
const TARSUS = rod(0.3, 0.24, 6);
const TARSI = 5;
/** Stance stroke and swing lift, in ant units. The stroke is the distance the
    body covers in half a gait cycle, so a planted foot stays put on the stem. */
const STROKE = (TAU / STRIDE / U) * 0.5;
const LIFT = 2.2;
/** How far the body is carried below the layout's own height — low, the way a
    foraging ant runs, rather than up on tiptoe. */
const BODY_DROP = -1.3;

/** Shared scratch for the per-frame solves. */
const S = {
  a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(),
  pole: new Vector3(), knee: new Vector3(), foot: new Vector3(), tip: new Vector3(),
  dir: new Vector3(),
};

/** Lay a unit segment mesh from `a` to `b`. */
function span(mesh: Mesh | null, a: Vector3, b: Vector3) {
  if (!mesh) return;
  S.dir.subVectors(b, a);
  const len = S.dir.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, S.dir.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

function Leg({
  type,
  side,
  gait,
  stem,
  pose,
}: {
  type: LegType;
  side: 1 | -1;
  gait: { value: number };
  stem: { radius: number };
  /** The body's current offset; the legs ride on the body, the feet must not. */
  pose: { y: number };
}) {
  const femur = useRef<Mesh>(null);
  const tibia = useRef<Mesh>(null);
  const knee = useRef<Mesh>(null);
  const ankle = useRef<Mesh>(null);
  const tarsi = useRef<(Mesh | null)[]>([]);
  const m = (p: P): P => [p[0] * side, p[1], p[2]];
  const root = useMemo(() => v3(m(type.root)), [type, side]); // eslint-disable-line react-hooks/exhaustive-deps
  const hip = useMemo(() => v3(m(type.hip)), [type, side]); // eslint-disable-line react-hooks/exhaustive-deps
  const phase = type.phase + (side < 0 ? Math.PI : 0);

  useFrame(() => {
    // Where the foot is in its cycle: half the cycle planted and sliding back
    // as the body passes over it, half lifted and swung forward.
    const s = ((((gait.value + phase) % TAU) + TAU) % TAU) / TAU;
    let dz: number;
    let lift = 0;
    if (s < 0.5) {
      dz = STROKE * (0.5 - s * 2);
    } else {
      const u = (s - 0.5) * 2;
      dz = STROKE * (-0.5 + u * u * (3 - 2 * u));
      lift = LIFT * Math.sin(Math.PI * u);
    }
    const tip = S.tip.set(type.rest[0] * side, 0, type.rest[2] + dz);
    // The stem is a cylinder round her x axis: a foot planted out to the side
    // has to reach down round the curve to touch it.
    const R = stem.radius;
    tip.y = -(R - Math.sqrt(Math.max(R * R - tip.x * tip.x, 0))) + lift - pose.y;

    // Tarsus: from the tip back up toward the hip, angled down onto the surface.
    S.d.set(tip.x - hip.x, 0, tip.z - hip.z).normalize();
    S.d.multiplyScalar(Math.cos(0.55)).addScaledVector(UP, -Math.sin(0.55)).normalize();
    const foot = S.foot.copy(tip).addScaledVector(S.d, -type.tarsus);

    // Two-bone solve, hip to foot, knee thrown up and out — the high knee is
    // most of what separates an ant from a beetle at a glance.
    S.a.subVectors(foot, hip);
    const d = Math.min(S.a.length(), (type.femur + type.tibia) * 0.999);
    S.a.normalize();
    const along = (type.femur ** 2 - type.tibia ** 2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(type.femur ** 2 - along * along, 0));
    S.pole.set(side * 0.95, 0.7, 0);
    S.pole.addScaledVector(S.a, -S.pole.dot(S.a)).normalize();
    const k = S.knee.copy(hip).addScaledVector(S.a, along).addScaledVector(S.pole, h);
    S.c.copy(hip).addScaledVector(S.a, d); // the foot, as far as the leg reaches

    span(femur.current, hip, k);
    span(tibia.current, k, S.c);
    knee.current?.position.copy(k);
    ankle.current?.position.copy(S.c);

    // Five tarsomeres on a slight arch down to the claw.
    for (let i = 0; i < TARSI; i++) {
      const t0 = i / TARSI;
      const t1 = (i + 1) / TARSI;
      const at = (t: number, out: Vector3) =>
        out.lerpVectors(S.c, tip, t).addScaledVector(UP, Math.sin(Math.PI * t) * 0.5);
      span(tarsi.current[i], at(t0, S.a), at(t1, S.b));
    }
  });

  return (
    <group>
      <mesh geometry={COXA} material={M_FEMUR} ref={(el) => el && span(el, root, hip)} />
      <mesh ref={femur} geometry={type.femurGeo} material={M_FEMUR} />
      <mesh ref={knee} geometry={BEAD} material={M_FEMUR} scale={0.6} />
      <mesh ref={tibia} geometry={type.tibiaGeo} material={M_TIBIA} />
      <mesh ref={ankle} geometry={BEAD} material={M_TIBIA} scale={0.42} />
      {Array.from({ length: TARSI }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            tarsi.current[i] = el;
          }}
          geometry={TARSUS}
          material={M_TIBIA}
        />
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- antennae */

const SCAPE = rod(0.26, 0.36);
const SCAPE_LEN = 6.8;
const FUNICULUS_LEN = 9.2;
const SEGMENTS = 11;

function Antenna({ side, tilt, calm }: { side: 1 | -1; tilt: { value: number }; calm: boolean }) {
  const scape = useRef<Mesh>(null);
  const pedicel = useRef<Mesh>(null);
  const segs = useRef<(Mesh | null)[]>([]);
  const socket = useMemo(() => new Vector3(side * 1.35, 9.4, 13.7), [side]);

  useFrame((state) => {
    const t = calm ? 0 : state.clock.elapsedTime;
    // Scape out, up and forward; pitched by the shared tilt, and each side
    // sweeping on its own beat so the pair never moves as one.
    const d = S.d.set(side * 0.55, 0.5, 0.66).normalize();
    d.applyAxisAngle(X_AXIS, tilt.value * 0.7);
    d.applyAxisAngle(UP, side * Math.sin(t * 1.7 + side) * 0.16);
    const elbow = S.a.copy(socket).addScaledVector(d, SCAPE_LEN);
    span(scape.current, socket, elbow);
    pedicel.current?.position.copy(elbow);

    // Funiculus: forward and down from the elbow, its tip searching.
    const f = S.b.set(side * 0.22, -0.55, 1).normalize();
    f.applyAxisAngle(X_AXIS, Math.sin(t * 2.9 + side * 1.3) * 0.22);
    f.applyAxisAngle(UP, side * Math.sin(t * 2.1 + 0.6) * 0.2);
    const ctrl = S.c.copy(elbow).addScaledVector(d, FUNICULUS_LEN * 0.22).addScaledVector(f, FUNICULUS_LEN * 0.32);
    const tip = S.tip.copy(elbow).addScaledVector(f, FUNICULUS_LEN);
    const bez = (u: number, out: Vector3) => {
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      return out.set(
        a * elbow.x + b * ctrl.x + c * tip.x,
        a * elbow.y + b * ctrl.y + c * tip.y,
        a * elbow.z + b * ctrl.z + c * tip.z,
      );
    };
    for (let i = 0; i < SEGMENTS; i++) {
      const mesh = segs.current[i];
      if (!mesh) continue;
      const p0 = bez(i / SEGMENTS, S.knee);
      const p1 = bez((i + 1) / SEGMENTS, S.foot);
      S.dir.subVectors(p1, p0);
      const len = S.dir.length();
      mesh.position.addVectors(p0, p1).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(UP, S.dir.divideScalar(len || 1));
      // Beaded, and swelling into a club over the last four.
      const r = i < SEGMENTS - 4 ? 0.29 : 0.3 + 0.04 * (i - (SEGMENTS - 5));
      mesh.scale.set(r, len * 0.62, r);
    }
  });

  return (
    <group>
      <mesh ref={scape} geometry={SCAPE} material={M_ANTENNA} />
      <mesh ref={pedicel} geometry={BEAD} material={M_ANTENNA} scale={0.42} />
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            segs.current[i] = el;
          }}
          geometry={BEAD}
          material={M_ANTENNA}
        />
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- shadow */

/*
 * A contact shadow, not a cast one.
 *
 * The scene has no shadow maps, and turning them on for this would be the
 * wrong trade twice over: every material in the field would pay for it, and a
 * twelve-millimetre ant in a shadow camera that has to cover the field gets
 * less than one texel. What sells "standing on the stem" at this size is the
 * occlusion right under her — the dark the body and legs make on the surface
 * they are closest to — so that is what is drawn: a soft ant-shaped patch,
 * densest under the three body sections, with a faint wider pool where the
 * legs splay, laid on the stem's own curve beneath her.
 */
// Wide enough that the softest blob's falloff ends inside the texture, not at a
// hard edge.
const SHADOW_W = 28; // ant units across, x
const SHADOW_Z0 = -25; // gaster end
const SHADOW_Z1 = 24; // mandible end
/*
 * Laid on a cylinder slightly wider than the stem's nominal one. The real stem
 * has shallow ridges standing up to 7% proud of it; on the nominal radius the
 * shadow is buried under every ridge it crosses. The lift costs well under a
 * millimetre of float in the valleys, which a blur this soft does not show.
 */
const SHADOW_RIDGE = 1.06;
const SHADOW_LIFT = 0.12;
/*
 * Which way the shadow falls. The direction the scene's key light travels — its
 * position in three/Scene.tsx, aimed at the origin — so the patch slides out
 * from under her the way a cast shadow would, rather than hiding under the
 * body where the camera, looking nearly straight down at her, cannot see it.
 */
const KEY_LIGHT = new Vector3(3, -5, 4).normalize();
/** How high the body's mass sits, for working out how far the shadow falls. */
const SHADOW_HEIGHT = 5.5;
/** The longest it is allowed to fall, so a grazing light is a small shadow
    rather than a streak down the stem. */
const SHADOW_REACH = 5;

const SHADOW_MAP = (() => {
  if (typeof document === "undefined") return null;
  const px = 8; // per ant unit
  const c = document.createElement("canvas");
  c.width = SHADOW_W * px;
  c.height = (SHADOW_Z1 - SHADOW_Z0) * px;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "lighter";
  // [z, half-width, half-length, strength]: legs' pool first, then the body.
  const blobs: readonly [number, number, number, number][] = [
    [0, 8.2, 15.5, 0.16],
    [-11.0, 4.4, 5.6, 1],
    [-5.0, 1.5, 1.4, 0.7],
    [1.6, 2.3, 4.9, 0.95],
    [11.2, 3.2, 3.5, 0.9],
  ];
  for (const [z, rx, rz, a] of blobs) {
    g.save();
    // Canvas top is the gaster end: the plane's +v runs toward -z.
    g.translate((SHADOW_W / 2) * px, (z - SHADOW_Z0) * px);
    g.scale(rx * px * 1.2, rz * px * 1.2);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${a * 0.8})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    g.fill();
    g.restore();
  }
  return new CanvasTexture(c);
})();

const M_SHADOW = new MeshBasicMaterial({
  color: "#000",
  alphaMap: SHADOW_MAP,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
  // It lies a hair off a surface it is meant to look painted on.
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -4,
});

function ContactShadow({ stem }: { stem: { radius: number } }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(SHADOW_W, SHADOW_Z1 - SHADOW_Z0, 24, 30);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, (SHADOW_Z0 + SHADOW_Z1) / 2);
    return g;
  }, []);
  const mesh = useRef<Mesh>(null);
  const flat = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);
  const scratch = useMemo(() => ({ q: new Quaternion(), l: new Vector3() }), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    // The light in her own frame: y is out of the stem, z is down it.
    m.getWorldQuaternion(scratch.q);
    const l = scratch.l.copy(KEY_LIGHT).applyQuaternion(scratch.q.invert());
    let dx = 0;
    let dz = 0;
    let lit = 0;
    if (l.y < 0) {
      // Follow the ray from the body down onto the surface; past a grazing
      // angle, hold the length rather than let it run away.
      const k = SHADOW_HEIGHT / Math.max(-l.y, 0.25);
      dx = l.x * k;
      dz = l.z * k;
      const len = Math.hypot(dx, dz);
      if (len > SHADOW_REACH) {
        dx *= SHADOW_REACH / len;
        dz *= SHADOW_REACH / len;
      }
      lit = Math.min(1, -l.y * 3);
    }
    // On the side of the stem the light cannot reach there is no cast shadow,
    // only the occlusion right under her, and it is weaker.
    M_SHADOW.opacity = 0.5 + 0.35 * lit;
    m.position.set(dx, 0, dz);

    // Bend it onto the stem where it now lies: the cylinder is centred on her
    // own axis, so each vertex is curved by where it sits after the shift.
    const R = stem.radius;
    const Rs = R * SHADOW_RIDGE;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = flat[i * 3] + dx;
      pos.setY(i, Math.sqrt(Math.max(Rs * Rs - x * x, 0)) - R + SHADOW_LIFT);
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh ref={mesh} geometry={geometry} material={M_SHADOW} renderOrder={1} frustumCulled={false} />
  );
}

/* ---------------------------------------------------------------- the ant */

/**
 * The animal itself, in ant units, feet on the plane y = 0 and facing +z.
 * `stem.radius` is the surface she is standing on, also in ant units, so the
 * feet can wrap it; `gait` is radians of stride; `tilt` pitches the antennae.
 */
export function AntModel({
  gait,
  tilt,
  stem,
  calm = false,
}: {
  gait: { value: number };
  tilt: { value: number };
  stem: { radius: number };
  calm?: boolean;
}) {
  const body = useRef<Group>(null);
  const gaster = useRef<Group>(null);
  const pose = useMemo(() => ({ y: BODY_DROP }), []);

  useFrame(() => {
    // Two bobs per stride — one per tripod — and the gaster swaying on its
    // waist a beat behind.
    pose.y = BODY_DROP + (calm ? 0 : Math.sin(gait.value * 2) * 0.28);
    if (body.current) body.current.position.y = pose.y;
    if (gaster.current && !calm) gaster.current.rotation.y = Math.sin(gait.value - 0.6) * 0.05;
  });

  return (
    <>
      <ContactShadow stem={stem} />
      <group ref={body} position={[0, BODY_DROP, 0]}>
        <group ref={gaster} position={[0, 7.2, GASTER_FRONT + 0.2]}>
          <mesh geometry={GASTER} material={M_GASTER} position={[0, -7.2, -GASTER_FRONT - 0.2]} />
        </group>

        {/* Petiole: a short stalk under an upright scale — the pinched waist. */}
        <mesh geometry={rodGeo.petiole} material={M_MESO} ref={(el) => el && span(el, v3([0, 6.3, -6.3]), v3([0, 6.7, -3.3]))} />
        <mesh geometry={BEAD} material={M_HEAD} position={[0, 7.7, -4.9]} rotation={[-0.25, 0, 0]} scale={[1.55, 2.35, 0.7]} />

        <mesh geometry={MESOSOMA} material={M_MESO} />

        {/* Neck, head, the clypeus over the jaws, compound eyes. */}
        <mesh geometry={rodGeo.neck} material={M_MESO} ref={(el) => el && span(el, v3([0, 7.5, 6.2]), v3([0, 8.2, 8.2]))} />
        <mesh geometry={HEAD} material={M_HEAD} />
        <mesh geometry={BEAD} material={M_HEAD} position={[0, 8.5, 14.1]} scale={[1.7, 0.9, 1.1]} />
        <mesh geometry={EYE} material={M_EYE} position={[2.95, 9.15, 11.1]} rotation={[0, 0.35, 0]} scale={[0.75, 0.95, 1.2]} />
        <mesh geometry={EYE} material={M_EYE} position={[-2.95, 9.15, 11.1]} rotation={[0, -0.35, 0]} scale={[0.75, 0.95, 1.2]} />
        {/* Mandibles, closed to a crossing in front of the clypeus. */}
        <mesh geometry={MANDIBLE_R} material={M_MANDIBLE} position={[1.55, 7.3, 13.5]} rotation={[0.22, -0.18, 0]} scale={0.78} />
        <mesh geometry={MANDIBLE_L} material={M_MANDIBLE} position={[-1.55, 7.3, 13.5]} rotation={[0.22, 0.18, 0]} scale={0.78} />

        <Antenna side={1} tilt={tilt} calm={calm} />
        <Antenna side={-1} tilt={tilt} calm={calm} />

        {LEG_TYPES.map((type, i) => (
          <group key={i}>
            <Leg type={type} side={1} gait={gait} stem={stem} pose={pose} />
            <Leg type={type} side={-1} gait={gait} stem={stem} pose={pose} />
          </group>
        ))}
      </group>
    </>
  );
}

export default function Ant() {
  const root = useRef<Group>(null);
  const gait = useMemo(() => ({ value: 0 }), []);
  const tilt = useMemo(() => ({ value: 0 }), []);
  const stem = useMemo(() => ({ radius: stemRadius(T_WAIT) / U }), []);
  const calm = reducedMotion();

  const basis = useMemo(
    () => ({
      m: new Matrix4(),
      x: new Vector3(),
      y: new Vector3(),
      z: new Vector3(),
      p: new Vector3(),
      last: new Vector3(),
      camera: { pos: new Vector3(), target: new Vector3(), fov: 42 },
    }),
    [],
  );

  useFrame((state) => {
    const g = root.current;
    if (!g) return;
    const c = scrollState.smooth;

    /*
     * She keeps to the face of the stem the camera is on, and that face swings
     * thirty degrees round the plant during the pan, so the bearing is read off
     * the journey rather than guessed at. Held at the descent's bearing while
     * she waits, so she is not seen creeping round the stem before she starts.
     */
    const cam = sampleCamera(Math.max(c, DESCENT_FROM), basis.camera);
    const bearing =
      Math.atan2(cam.pos.z - FLOWER.z, cam.pos.x - FLOWER.x) + 0.28;

    /*
     * How far down the stem she is — taken from where the camera is *looking*,
     * not from a ramp of her own.
     *
     * She used to walk from the head to the foot on a straight line in chapter,
     * which is only the same thing as staying in shot if the camera descends at
     * a matching rate. It does not: the pan slows, and now it also climbs into a
     * bird's-eye partway down. She finished the act a fifth of a frame below
     * centre and, on a short window, out of it. Reading her height off the
     * camera's own target makes her stay where the reader is already looking,
     * whatever the journey does — the drift is what stops that reading as her
     * being glued to the middle of the screen.
     *
     * The stem is near enough vertical over its whole length that a height in
     * metres and a parameter along the curve are the same number to within a
     * millimetre or two, which is well inside the drift.
     */
    const aim = clamp(cam.target.y / FLOWER.height, T_FOOT, T_WAIT);
    const local = clamp((c - DESCENT_FROM) / (FOOT_AT - DESCENT_FROM));
    const drift = Math.sin(local * Math.PI * 2) * DRIFT;
    /*
     * Past the camera's last aim she keeps going, down to the foot, over the
     * whole length of the questions. Eased rather than linear so she does not
     * set off again the instant the camera settles — she arrives with it, takes
     * a moment, and then carries on.
     */
    const last = clamp((c - FOOT_AT) / (FOOT_UNTIL - FOOT_AT));
    const toFoot = last * last * (3 - 2 * last);
    const t = clamp(aim + drift, T_FOOT, T_WAIT) * (1 - toFoot) + T_FOOT * toFoot;

    STEM.getPointAt(t, basis.p);
    STEM.getTangentAt(t, basis.z).negate();
    basis.y.set(Math.cos(bearing), 0, Math.sin(bearing));
    // Square the outward normal to the stem, or she leans off a leaning stem.
    basis.y.addScaledVector(basis.z, -basis.y.dot(basis.z)).normalize();

    // Her own origin is the line her feet stand on, so riding the stem is a
    // matter of putting that line on its surface. Belly to it, head down it.
    basis.p.addScaledVector(basis.y, stemRadius(t));
    stem.radius = stemRadius(t) / U;

    basis.x.crossVectors(basis.y, basis.z).normalize();
    basis.m.makeBasis(basis.x, basis.y, basis.z);
    g.quaternion.setFromRotationMatrix(basis.m);

    // Distance actually covered this frame is what drives the legs.
    if (basis.last.lengthSq() > 0) {
      gait.value += basis.p.distanceTo(basis.last) * STRIDE;
    }
    basis.last.copy(basis.p);
    g.position.copy(basis.p);

    if (calm) return;
    // The antennae are the one part of her that moves while she is standing
    // still — an ant parked under the flower head is not a dead one.
    tilt.value = -0.32 + Math.sin(state.clock.elapsedTime * 2.4) * 0.2;
  });

  return (
    <group ref={root}>
      <group scale={U}>
        <AntModel gait={gait} tilt={tilt} stem={stem} calm={calm} />
      </group>
    </group>
  );
}
