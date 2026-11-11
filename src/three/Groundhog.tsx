import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Quaternion,
  Raycaster,
  MeshPhysicalMaterial,
  SphereGeometry,
  SplineCurve,
  Vector2,
  Vector3,
  type Camera,
  type Material,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLOWER } from "@/lib/flowerLayout";
import { pointer } from "@/lib/pointer";
import { scrollState } from "@/lib/scroll";
import { closeGroundhogMenu, groundhogMenu, openGroundhogMenu, placeGroundhogMenu } from "@/lib/groundhogMenu";
import { SOIL } from "./soil";
import { swayGrid } from "./swayGrid";
import { reducedMotion } from "./quality";

/**
 * A groundhog, in the field the page ends on.
 *
 * The last act brings the camera back up to the opening shot, and with nothing
 * left to read there the field needed one thing in it that is alive and not
 * the grass. So: every so often, somewhere in frame, a groundhog comes up out
 * of its burrow, stands bolt upright the way they do — forelegs held to its chest —
 * has a look round, and drops back out of sight. Then, a little later,
 * somewhere else.
 *
 * Built from the reference rather than drawn flat: warm orange-tan fur with a
 * darker crown and back, a pale cream muzzle, chin and belly, glossy black
 * eyes, a dark nose and two incisors showing. The fur is coloured per vertex
 * and wears a sheen, which is what gives it the soft lit fringe a backlit
 * animal has. About sixty centimetres standing, so in a meadow that comes up
 * to its shoulders the head and chest clear the grass.
 *
 * In the field the page opens on and the one it ends on — the same shot — and
 * not at the pond, where a burrow could open in the water. At the opening it
 * waits for the leaf to land first, and keeps out from behind it.
 */

/* ---------------------------------------------------------------- fur */

const FUR = new Color("#c98a45");
const FUR_DARK = new Color("#7d5029");
const CREAM = new Color("#f2d6a2");

/**
 * Colour a geometry by where each vertex faces and how high it is: darker over
 * the crown and down the back, cream on the front below the face.
 */
function furColours(
  geo: BufferGeometry,
  pick: (p: Vector3, n: Vector3) => Color,
): BufferGeometry {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const out = new Float32Array(pos.count * 3);
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    const c = pick(p, n);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new BufferAttribute(out, 3));
  return geo;
}

const mix = (a: Color, b: Color, t: number, out = new Color()) =>
  out.copy(a).lerp(b, Math.min(1, Math.max(0, t)));

const bell = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
const ramp = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/*
 * Body and head are one surface.
 *
 * A groundhog standing up has no neck to speak of. Seen from the front it is a
 * teardrop — broad haunches, the body narrowing through the chest and
 * shoulders straight into a small, low, flattish head about half the width of
 * the hips — and the head turning is the top of that shape turning, not a ball
 * swivelling on it. So the outline is one continuous taper, radius against
 * height, with no pinch anywhere; the head is made by shaping the top of it.
 */
const OUTLINE = new SplineCurve(
  (
    [
      [0.0, -0.05],
      [0.13, -0.05],
      [0.15, 0.0],
      [0.165, 0.08],
      [0.163, 0.16],
      [0.15, 0.24],
      [0.131, 0.31],
      [0.11, 0.37],
      [0.094, 0.42],
      [0.085, 0.465],
      [0.08, 0.5],
      [0.073, 0.53],
      [0.06, 0.555],
      [0.042, 0.575],
      [0.022, 0.588],
      [0.0, 0.594],
    ] as const
  ).map(([r, y]) => new Vector2(r, y)),
);
const OUTLINE_POINTS = OUTLINE.getPoints(64);
/** The outline's radius at height y (front-to-back before shaping). */
function radiusAt(y: number): number {
  const pts = OUTLINE_POINTS;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].y >= y) {
      const a = pts[i - 1];
      const b = pts[i];
      return a.x + ((b.x - a.x) * (y - a.y)) / Math.max(1e-6, b.y - a.y);
    }
  }
  return 0;
}

/**
 * From the lathe to the animal: the body flatter front to back than it is
 * wide, the head rounder; fuller cheeks; a short, blunt snout pushed forward
 * out of the face rather than stuck on it; a low, flattened crown; a little
 * belly. +z is forward.
 */
function shape(p: Vector3): Vector3 {
  const r = Math.hypot(p.x, p.z);
  const fwd = r > 1e-6 ? p.z / r : 0;
  const y = p.y;
  p.z *= 0.86 + 0.1 * ramp(0.4, 0.48, y);
  p.z += 0.012 * bell(y, 0.2, 0.1) * Math.max(0, fwd);
  p.x *= 1 + 0.07 * bell(y, 0.48, 0.03);
  const snout = bell(y, 0.497, 0.026) * Math.max(0, fwd) ** 3;
  p.z += 0.05 * snout;
  p.y -= 0.006 * snout;
  if (p.y > 0.545) p.y = 0.545 + (p.y - 0.545) * 0.72;
  return p;
}

/** A point on the skin at bearing `theta` (0 = straight ahead) and height `y`,
    lifted `out` along the surface normal; and that normal. */
function onSkin(theta: number, y: number, out = 0) {
  const at = (t: number, h: number) => {
    const r = radiusAt(h);
    return shape(new Vector3(Math.sin(t) * r, h, Math.cos(t) * r));
  };
  const p = at(theta, y);
  const du = at(theta + 0.01, y).sub(at(theta - 0.01, y));
  const dv = at(theta, y + 0.002).sub(at(theta, y - 0.002));
  const n = new Vector3().crossVectors(dv, du).normalize();
  if (n.dot(new Vector3(p.x, 0, p.z)) < 0) n.negate();
  return { p: p.addScaledVector(n, out), n };
}

const BODY = (() => {
  const lathe = new LatheGeometry(OUTLINE_POINTS, 48);
  const pos = lathe.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    shape(v.fromBufferAttribute(pos, i));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  lathe.deleteAttribute("normal");
  lathe.deleteAttribute("uv");
  const g = mergeVertices(lathe, 1e-5);
  g.computeVertexNormals();
  return furColours(g, (p) => {
    const r = Math.hypot(p.x, p.z) || 1;
    const fwd = p.z / r;
    const c = FUR.clone();
    // Down the back, and the grizzled darker crown, as in the reference.
    c.lerp(FUR_DARK, Math.max(0, -fwd) * 0.45);
    c.lerp(FUR_DARK, ramp(0.5, 0.575, p.y) * (0.75 - 0.4 * Math.max(0, fwd)));
    // A brown wash between and around the eyes, down the bridge of the snout.
    c.lerp(FUR_DARK, bell(p.y, 0.527, 0.022) * Math.max(0, fwd) ** 2 * 0.35);
    // Cream on the muzzle and chin. The chest and belly are not cream — in
    // the reference they are the same orange-tan as the flanks, only a shade
    // lighter where the fur is thinner — and a cream front all the way down
    // reads as a meerkat.
    const muzzle = bell(p.y, 0.488, 0.03) * Math.max(0, fwd) ** 3;
    const chin = bell(p.y, 0.455, 0.03) * ramp(0.3, 0.9, fwd);
    const belly = ramp(0.42, 0.15, p.y) * ramp(0.2, 0.9, fwd);
    return c.lerp(CREAM, Math.min(1, muzzle * 1.15 + chin * 0.6 + belly * 0.22));
  });
})();

/* The face, placed on that skin rather than guessed at. */
const PIVOT = new Vector3(0, 0.4, 0);
const local = (v: Vector3): [number, number, number] => [v.x - PIVOT.x, v.y - PIVOT.y, v.z - PIVOT.z];
const FACE = {
  nose: local(onSkin(0, 0.503, 0.001).p),
  teeth: ([-1, 1] as const).map((side) => local(onSkin(side * 0.055, 0.468, -0.002).p)),
  eyes: ([-1, 1] as const).map((side) => {
    const { p, n } = onSkin(side * 0.62, 0.531, -0.0045);
    return { at: local(p), glint: local(p.clone().addScaledVector(n, 0.0108).add(new Vector3(0, 0.0035, 0))) };
  }),
  // Small and rounded, low on the sides of the head and set into the fur.
  ears: ([-1, 1] as const).map((side) => ({ at: local(onSkin(side * 1.32, 0.552, 0.003).p), side })),
};

const EAR = furColours(new SphereGeometry(0.017, 12, 8).scale(0.45, 0.85, 1), () => FUR_DARK.clone());
/*
 * Forelegs: one short limb each side, rounded at the end — shaped so they
 * read as part of the body rather than as pegs pushed into it. Each starts
 * inside the chest, a little wider at the top, and runs down along it at a
 * shallow angle, so it rises out of the fur rather than meeting it at an edge
 * — no end cap anywhere in sight — in the chest's own colour, so there is no
 * seam in tone either.
 */
const ARM_LEN = 0.085;
const ARM = (() => {
  const g = new LatheGeometry(
    (
      [
        // A rounded end where the paw used to be.
        [0.0, -ARM_LEN - 0.017],
        [0.01, -ARM_LEN - 0.014],
        [0.016, -ARM_LEN - 0.007],
        [0.019, -ARM_LEN],
        [0.021, -0.06],
        [0.024, -0.04],
        [0.028, -0.022],
        [0.032, -0.006],
        [0.034, 0.012],
      ] as const
    ).map(([r, y]) => new Vector2(r, y)),
    16,
  );
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const welded = mergeVertices(g, 1e-5);
  welded.computeVertexNormals();
  return furColours(welded, () => mix(FUR, CREAM, 0.06));
})();
/** Where each limb leaves the chest, and which way it lies: down the chest's
    own surface, tipped a little outward so it stands proud of it. */
const ARMS = ([-1, 1] as const).map((side) => {
  const top = onSkin(side * 0.6, 0.355, -0.024);
  const below = onSkin(side * 0.6, 0.29, -0.024).p;
  const down = below.clone().sub(top.p).normalize().addScaledVector(top.n, 0.38).normalize();
  return {
    side,
    at: top.p.toArray() as [number, number, number],
    rest: new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), down),
  };
});
const BEAD = new SphereGeometry(1, 14, 10);
const TOOTH = new CylinderGeometry(0.0042, 0.0042, 0.013, 6);

const M_FUR = new MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.92,
  // Sheen is what makes it fur rather than felt: a soft warm fringe where the
  // surface turns away, the lit halo the reference animal has.
  sheen: 1,
  sheenColor: new Color("#ffd08a"),
  sheenRoughness: 0.45,
});
/*
 * Warm fill from its own fur colour. The scene's sun is behind it — it faces
 * the camera, the light comes from the far side of the field — so its whole
 * front was lit only by the green sky and ground fill, and the cream face and
 * belly came out a murky olive. The reference animal is backlit too, but its
 * front is filled with warm bounce; this is that bounce, per vertex, so cream
 * stays cream and the crown stays dark.
 */
const warmFill = (shader: { fragmentShader: string }) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * 0.5;",
  );
};
M_FUR.onBeforeCompile = warmFill;

/*
 * The head turns by twisting the top of the body. With the head part of the
 * same surface there is nothing to rotate on its own, so the vertex shader
 * turns everything above the shoulders about the axis — fully from the cheeks
 * up, blending to nothing at the shoulders — which is what a groundhog's neck
 * does under the fur. The face features ride in a group turned by the same
 * angles about the same pivot.
 */
const TWIST = { uYaw: { value: 0 }, uRoll: { value: 0 } };
const M_BODY = M_FUR.clone();
M_BODY.onBeforeCompile = (shader) => {
  warmFill(shader);
  Object.assign(shader.uniforms, TWIST);
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
uniform float uYaw;
uniform float uRoll;
const vec3 NECK_PIVOT = vec3(${PIVOT.x.toFixed(4)}, ${PIVOT.y.toFixed(4)}, ${PIVOT.z.toFixed(4)});
float neckWeight(float y) { return smoothstep(0.36, 0.47, y); }
vec3 neckTurn(vec3 v, float w) {
  float a = uYaw * w;
  float c = cos(a), s = sin(a);
  v = vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
  float b = uRoll * w;
  float cb = cos(b), sb = sin(b);
  return vec3(cb * v.x - sb * v.y, sb * v.x + cb * v.y, v.z);
}`,
    )
    .replace(
      "#include <beginnormal_vertex>",
      "#include <beginnormal_vertex>\n  objectNormal = neckTurn(objectNormal, neckWeight(position.y));",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  transformed = neckTurn(transformed - NECK_PIVOT, neckWeight(position.y)) + NECK_PIVOT;",
    );
};
M_BODY.customProgramCacheKey = () => "groundhog-body";
const M_EYE = new MeshPhysicalMaterial({ color: "#120b07", roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 });
const M_NOSE = new MeshPhysicalMaterial({ color: "#4a3730", roughness: 0.45, clearcoat: 0.4 });
// Self-lit a little for the same reason as the fur: facing away from the sun,
// unlit they took the green of the fill and read as specks of grass.
const M_TOOTH = new MeshPhysicalMaterial({ color: "#efe3c4", roughness: 0.3, emissive: "#b8aa86", emissiveIntensity: 0.55 });
const M_GLINT = new MeshBasicMaterial({ color: "#ffffff" });

/* Whiskers: fine pale lines fanning back off each side of the snout, in the
   head's own frame. */
const WHISKERS = (() => {
  const v: number[] = [];
  for (const side of [-1, 1]) {
    const root = onSkin(side * 0.42, 0.49, 0.001).p.sub(PIVOT);
    for (let k = 0; k < 6; k++) {
      const a = -0.3 + k * 0.12;
      const len = 0.05 + (k % 3) * 0.009;
      v.push(
        root.x, root.y + k * 0.002, root.z,
        root.x + side * Math.cos(a) * len, root.y + k * 0.002 + Math.sin(a) * len * 0.55, root.z - len * 0.3,
      );
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  return g;
})();

/* ---------------------------------------------------------------- burrow */

const HOLE = new CylinderGeometry(0.15, 0.15, 0.002, 28);
const RIM = (() => {
  // A low ring of thrown-up earth, lumpy so it is not a torus.
  const g = new LatheGeometry(
    (
      [
        [0.13, 0.0],
        [0.15, 0.022],
        [0.185, 0.03],
        [0.23, 0.012],
        [0.26, 0.0],
      ] as const
    ).map(([r, y]) => new Vector2(r, y)),
    32,
  );
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const s = 1 + 0.18 * Math.sin(a * 5 + 1.2) + 0.1 * Math.sin(a * 11);
    pos.setY(i, pos.getY(i) * s);
  }
  g.computeVertexNormals();
  return g;
})();
const M_HOLE = new MeshBasicMaterial({ color: "#140d07", transparent: true, opacity: 0 });
const M_RIM = new MeshPhysicalMaterial({ color: "#5c3f24", roughness: 1, transparent: true, opacity: 0 });

/* ---------------------------------------------------------------- behaviour */

const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/** The opening view runs to here, and the end view from here to the bottom of
    the page — the camera is in the same place for both. */
const UNTIL_CHAPTER = 0.3;
const FROM_CHAPTER = 5.38;
/** The first time, on opening: soon — while the leaf is still flying in, so
    it keeps out of where the leaf is going to land as well as where it is. */
const FIRST_WAIT = 1.8;
/** If no clear spot has turned up this long after it was due, take any spot
    in frame: the first appearance must not stall on a crowded screen. */
const GIVE_UP_AVOIDING = 1;
const RISE = 0.55;
const DUCK = 0.28;
/** Touched by the cursor: a flinch on the spot, not a retreat — it has to
    stay up long enough to be picked up. */
const FLINCH = 0.26;
/** Dropped: the fall, and the bump on landing. */
const FALL = 0.2;
const LAND = 0.32;
/** How high it is carried, with its feet trailing in the grass tops. */
const LIFT = 0.2;
/** How long a press has to be held, in milliseconds, before it is a hold and
    not a click. It is picked up the moment it is pressed either way; let go
    inside this and that was a click — it is put straight back where it stood
    and its menu opens. */
const HOLD_MS = 220;
/** How close the cursor has to be, in screen units, before it looks round. */
const NOTICE = 0.45;
/** Larger than life by a third, so in a meadow the head and chest clear the
    grass rather than an ear and an eye. */
const SIZE = 1.3;
/** How far below the ground it hides. */
const DEPTH = 0.66 * SIZE;
/** The nose's half-extents — a flattened bead. */
const NOSE: [number, number, number] = [0.0145, 0.0105, 0.0095];
/** Where it may be carried to: the ground the end view frames, off the plant. */
const BOUNDS = { minX: -2.6, maxX: 2.6, minZ: -3.6, maxZ: 1.1 };

type Phase = "hidden" | "rise" | "look" | "flinch" | "held" | "fall" | "land" | "duck";

export default function Groundhog() {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  // Each eye on its own pivot, so a blink closes it where it is rather than
  // sliding it toward the neck.
  const eyes = useRef<(Group | null)[]>([]);
  const arms = useRef<(Group | null)[]>([]);
  const nose = useRef<Mesh>(null);
  const burrow = useRef<Group>(null);
  const hull = useRef<Mesh>(null);
  const calm = reducedMotion();
  const sway = swayGrid();
  const ray = useMemo(() => new Raycaster(), []);

  const state = useMemo(
    () => ({
      phase: "hidden" as Phase,
      t0: 0,
      wait: FIRST_WAIT,
      look: 3,
      blinkAt: 1,
      seed: Math.random() * 100,
      holeFade: 0,
      spot: new Vector3(),
      probe: new Vector3(),
      yaw: 0,
      roll: 0,
      wide: 1,
      ndc: new Vector2(),
      hovering: false,
      // Dragging.
      grab: false,
      press: null as null | { x: number; y: number },
      released: false,
      // When the press that picked it up went down, and where it was standing
      // — so a click can put it back.
      downAt: 0,
      from: new Vector3(),
      lift: 0,
      grabOffset: new Vector3(),
      plane: new Plane(new Vector3(0, 1, 0), 0),
      hit: new Vector3(),
      last: new Vector3(),
      vel: new Vector3(),
      swingX: 0,
      swingZ: 0,
      swingVX: 0,
      swingVZ: 0,
      cursorSet: false,
      paddle: [0, 0],
      turn: new Quaternion(),
      turn2: new Quaternion(),
    }),
    [],
  );

  /*
   * Picking it up. The scene sits behind the page and takes no pointer events
   * of its own, so presses are read off the window and tested against the
   * groundhog in the frame loop. Only a press that lands on it is kept; the
   * page behaves as normal otherwise.
   */
  useEffect(() => {
    const s = state;
    const ndc = (e: PointerEvent) => ({
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -((e.clientY / window.innerHeight) * 2 - 1),
    });
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Its own menu is not the animal.
      if ((e.target as Element).closest?.("[data-groundhog-menu]")) return;
      s.press = ndc(e);
      // Every press, not just one over it: on a touch screen there is no
      // hover, and the press is only found to be on it in the next frame.
      s.downAt = performance.now();
      if (s.hovering) {
        e.preventDefault(); // no text selection starting under it
        // Capture the pointer, so the release comes back here even if it
        // happens outside the window — otherwise letting go past the edge of
        // the page never arrives and it stays stuck to the cursor.
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          /* the target may not accept capture; the backstops below cover it */
        }
      }
    };
    const letGo = () => {
      if (s.grab) s.released = true;
      s.press = null;
    };
    const move = (e: PointerEvent) => {
      if (!s.grab) return;
      // A move with no button down means the release was missed somewhere —
      // swallowed, or over something that kept it. Treat it as the release.
      if (e.pointerType !== "touch" && e.buttons === 0) {
        letGo();
        return;
      }
      s.press = ndc(e);
    };
    // While it is held on a touch screen, a drag moves it, not the page.
    const touch = (e: TouchEvent) => {
      if (s.grab) e.preventDefault();
    };
    // Capture phase throughout, so nothing on the page can stop these first.
    const opts = { capture: true };
    window.addEventListener("pointerdown", down, opts);
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerup", letGo, opts);
    window.addEventListener("pointercancel", letGo, opts);
    window.addEventListener("lostpointercapture", letGo, opts);
    window.addEventListener("blur", letGo);
    window.addEventListener("touchmove", touch, { capture: true, passive: false });
    return () => {
      window.removeEventListener("pointerdown", down, opts);
      window.removeEventListener("pointermove", move, opts);
      window.removeEventListener("pointerup", letGo, opts);
      window.removeEventListener("pointercancel", letGo, opts);
      window.removeEventListener("lostpointercapture", letGo, opts);
      window.removeEventListener("blur", letGo);
      window.removeEventListener("touchmove", touch, opts);
      if (s.cursorSet) document.body.style.cursor = "";
    };
  }, [state]);

  /** A spot in frame, clear of the plant, or null if none turned up. */
  const pickSpot = (camera: Camera, opening: boolean, avoidLeaf: boolean) => {
    // At the opening the middle of the frame is the leaf's, with the name on
    // it; find where it actually is on this screen (it scales with the
    // viewport, and once it has been sent off there is nothing to avoid).
    let leaf: { x0: number; x1: number; y0: number; y1: number } | null = null;
    if (opening && avoidLeaf) {
      const el = document.querySelector<HTMLElement>('button[aria-label="Send the leaf off"]');
      const name = document.querySelector<HTMLElement>("#top h1");
      if (el && el.style.visibility !== "hidden") {
        // Where it is now (it may still be flying in) and where it will rest:
        // centred on the name, at its own size.
        const r = el.getBoundingClientRect();
        let left = r.left;
        let right = r.right;
        let top = r.top;
        let bottom = r.bottom;
        if (name) {
          const n = name.getBoundingClientRect();
          const cx = (n.left + n.right) / 2;
          const cy = (n.top + n.bottom) / 2;
          left = Math.min(left, cx - el.offsetWidth * 0.55);
          right = Math.max(right, cx + el.offsetWidth * 0.55);
          top = Math.min(top, cy - el.offsetHeight * 0.55);
          bottom = Math.max(bottom, cy + el.offsetHeight * 0.6);
        }
        const pad = 0.04;
        leaf = {
          x0: (left / window.innerWidth) * 2 - 1 - pad,
          x1: (right / window.innerWidth) * 2 - 1 + pad,
          y0: 1 - (bottom / window.innerHeight) * 2 - pad,
          y1: 1 - (top / window.innerHeight) * 2 + pad,
        };
      }
    }
    const card = cardBox();
    // With the card up, the field left to it is the strips at the edges of the
    // screen: reach for those, across more of the ground, and closer to the
    // frame's edge than it otherwise would.
    const reachX = card ? 2.5 : 1.7;
    // Its middle this far in, so the whole animal is on screen, not half of it.
    const edgeX = card ? 0.86 : 0.72;
    const edgeTop = card ? 0.86 : 0.6;
    const edgeBottom = card ? -0.86 : -0.72;
    for (let k = 0; k < (card ? 48 : 24); k++) {
      const x = -reachX + Math.random() * reachX * 2;
      const z = card ? -3.4 + Math.random() * 3.9 : -2.7 + Math.random() * 3.0;
      if (Math.hypot(x - FLOWER.x, z - FLOWER.z) < 0.5) continue;
      // Its head, not its feet, has to be on screen — and well inside the edge
      // on a narrow phone frame as much as a wide one.
      state.probe.set(x, SOIL.bed + 0.5 * SIZE, z).project(camera);
      if (Math.abs(state.probe.x) > edgeX || state.probe.y < edgeBottom || state.probe.y > edgeTop) continue;
      if (leaf && overLeaf(camera, x, z, leaf)) continue;
      // The card is never relaxed: behind it, it could not be seen at all.
      if (card && overLeaf(camera, x, z, card)) continue;
      return state.spot.set(x, SOIL.bed, z);
    }
    return null;
  };

  /**
   * The leaf come back as a card in the middle of the screen (ui/Hero.tsx),
   * as a box in screen units — or null if it is not there. While it is, the
   * groundhog only lives in what is left of the field either side: it does not
   * come up behind it, and cannot be carried behind it.
   */
  const cardBox = () => {
    if (scrollState.smooth > UNTIL_CHAPTER) return null;
    const el = document.querySelector<HTMLElement>("[data-leaf-panel]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const pad = 0.03;
    return {
      x0: (r.left / window.innerWidth) * 2 - 1 - pad,
      x1: (r.right / window.innerWidth) * 2 - 1 + pad,
      y0: 1 - (r.bottom / window.innerHeight) * 2 - pad,
      y1: 1 - (r.top / window.innerHeight) * 2 + pad,
    };
  };

  /** Whether the animal standing at (x, z) would be drawn over the leaf. */
  const overLeaf = (
    camera: Camera,
    x: number,
    z: number,
    leaf: { x0: number; x1: number; y0: number; y1: number },
  ) => {
    const head = state.probe.set(x, SOIL.bed + 0.62 * SIZE, z).project(camera);
    const hx = head.x;
    const hy = head.y;
    const foot = state.probe.set(x, SOIL.bed + 0.05, z).project(camera);
    const half = Math.abs(hx - foot.x) + 0.1;
    return hx + half > leaf.x0 && hx - half < leaf.x1 && hy > leaf.y0 && foot.y < leaf.y1;
  };

  useFrame(({ camera, clock }, delta) => {
    const g = root.current;
    if (!g) return;
    const now = clock.elapsedTime;
    const dt = Math.min(0.05, delta);
    const opening = scrollState.smooth <= UNTIL_CHAPTER;
    const atEnd = opening || scrollState.smooth >= FROM_CHAPTER;
    const s = state;
    const begin = (phase: Phase) => {
      s.phase = phase;
      s.t0 = now;
    };
    const standing = s.phase === "look" || s.phase === "rise" || s.phase === "flinch";

    // Leaving the end view: whatever it is doing, it goes home.
    if (!atEnd && s.phase !== "hidden" && s.phase !== "duck") {
      closeGroundhogMenu();
      s.grab = false;
      s.lift = 0;
      begin("duck");
    }

    // Is the cursor on it? A ray from the lens through the cursor, against the
    // body — the head is part of the same surface.
    let over = false;
    if (pointer.active && hull.current && standing) {
      s.ndc.set(pointer.ndcX, pointer.ndcY);
      ray.setFromCamera(s.ndc, camera);
      over = ray.intersectObject(hull.current, false).length > 0;
    }

    /*
     * Pressed on it: picked up, straight away. Whether that was a click or a
     * hold is settled when it is let go (below).
     */
    const pickUp = (at: Vector3) => {
      s.grab = true;
      s.released = false;
      s.from.copy(g.position);
      closeGroundhogMenu();
      // Carry it on a level plane through the point that was grabbed, lifted,
      // so that point stays under the cursor as it comes up out of the hole.
      s.plane.constant = -(at.y + LIFT);
      s.grabOffset.set(at.x - g.position.x, 0, at.z - g.position.z);
      s.last.copy(g.position);
      s.vel.set(0, 0, 0);
      begin("held");
      // Out of the ground in a rush of grass.
      sway.impulse(g.position.x, g.position.z, 0.45 * SIZE, 12);
    };
    if (s.press && standing && !s.grab) {
      s.ndc.set(s.press.x, s.press.y);
      ray.setFromCamera(s.ndc, camera);
      const hits = hull.current ? ray.intersectObject(hull.current, false) : [];
      if (hits.length) pickUp(hits[0].point);
      else if (!s.hovering) s.press = null;
    }

    // The cursor: an open hand over it, a closed one while carrying it.
    const wantCursor = s.grab ? "grabbing" : over ? "grab" : "";
    if (wantCursor || s.cursorSet) {
      document.body.style.cursor = wantCursor;
      s.cursorSet = !!wantCursor;
    }

    if (s.phase === "hidden" && atEnd) {
      const overdue = now - s.t0 - s.wait;
      if (overdue > 0 && pickSpot(camera, opening, overdue < GIVE_UP_AVOIDING)) {
        begin("rise");
        s.look = 2.4 + Math.random() * 2.4;
        s.blinkAt = now + 0.8 + Math.random();
        s.seed = Math.random() * 100;
        s.wide = 1;
        g.position.copy(s.spot);
        burrow.current?.position.copy(s.spot);
        // Face the camera, with a little turn so it is not posed square on.
        g.rotation.y =
          Math.atan2(camera.position.x - s.spot.x, camera.position.z - s.spot.z) +
          (Math.random() - 0.5) * 0.5;
        // Breaking the surface: the grass round the hole is thrown outward.
        sway.impulse(s.spot.x, s.spot.z, 0.42 * SIZE, 12);
      }
    } else if (s.phase === "held") {
      if (s.released || !pointer.active) {
        s.grab = false;
        const click = s.released && performance.now() - s.downAt < HOLD_MS;
        s.released = false;
        if (click) {
          // A click, not a carry: back on its spot, and its menu.
          g.position.copy(s.from);
          s.last.copy(s.from);
          s.lift = 0;
          begin("look");
          s.look = Math.max(s.look, 2.5);
          openGroundhogMenu();
        } else {
          begin("fall");
        }
      }
    } else if (over && !s.hovering && (s.phase === "look" || s.phase === "rise")) {
      begin("flinch");
    } else if (s.phase === "rise" && now - s.t0 > RISE) {
      begin("look");
    } else if (s.phase === "flinch" && now - s.t0 > FLINCH) {
      begin("look");
      s.look = Math.max(s.look, 2.5);
    } else if (s.phase === "look" && !s.grab && (() => {
      const card = cardBox();
      return !!card && overLeaf(camera, g.position.x, g.position.z, card);
    })()) {
      // The card has come down over it: gone, to come up somewhere it can be seen.
      closeGroundhogMenu();
      begin("duck");
    } else if (s.phase === "look" && now - s.t0 > s.look && !over && !groundhogMenu.open) {
      begin("duck");
    } else if (s.phase === "fall" && now - s.t0 > FALL) {
      // Landed: a new burrow where it came down, and the grass knocked flat.
      s.spot.set(g.position.x, SOIL.bed, g.position.z);
      burrow.current?.position.copy(s.spot);
      s.holeFade = 0;
      sway.impulse(s.spot.x, s.spot.z, 0.5 * SIZE, 16);
      begin("land");
    } else if (s.phase === "land" && now - s.t0 > LAND) {
      // A moment to collect itself, then down the new hole.
      begin("look");
      s.look = 1.1 + Math.random() * 0.8;
    } else if (s.phase === "duck" && now - s.t0 > DUCK) {
      begin("hidden");
      s.wait = 1.5 + Math.random() * 3.5;
    }
    s.hovering = over || s.grab;

    // Carrying: follow the cursor across the field on the grab plane.
    if (s.phase === "held") {
      s.lift += (LIFT - s.lift) * (1 - Math.exp(-dt * 14));
      if (s.press) {
        s.ndc.set(s.press.x, s.press.y);
      } else {
        s.ndc.set(pointer.ndcX, pointer.ndcY);
      }
      ray.setFromCamera(s.ndc, camera);
      if (ray.ray.intersectPlane(s.plane, s.hit)) {
        const x = Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, s.hit.x - s.grabOffset.x));
        const z = Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, s.hit.z - s.grabOffset.z));
        // Not into the plant.
        const fx = x - FLOWER.x;
        const fz = z - FLOWER.z;
        const fd = Math.hypot(fx, fz);
        const keep = 0.3;
        g.position.x = fd < keep ? FLOWER.x + (fx / (fd || 1)) * keep : x;
        g.position.z = fd < keep ? FLOWER.z + (fz / (fd || 1)) * keep : z;
        // Not behind the card: out to whichever side of it is nearer.
        const card = cardBox();
        if (card && overLeaf(camera, g.position.x, g.position.z, card)) {
          const x0 = g.position.x;
          for (let step = 1; step <= 80; step++) {
            const d = step * 0.04;
            const l = x0 - d;
            const r = x0 + d;
            if (l >= BOUNDS.minX && !overLeaf(camera, l, g.position.z, card)) {
              g.position.x = l;
              break;
            }
            if (r <= BOUNDS.maxX && !overLeaf(camera, r, g.position.z, card)) {
              g.position.x = r;
              break;
            }
          }
        }
      }
    } else if (s.phase === "fall") {
      const u = Math.min(1, (now - s.t0) / FALL);
      s.lift = LIFT * (1 - u * u);
    } else {
      s.lift = 0;
    }

    // How fast it is being moved, smoothed, for the swing and the grass.
    if (dt > 0) {
      s.vel.x += ((g.position.x - s.last.x) / dt - s.vel.x) * 0.3;
      s.vel.z += ((g.position.z - s.last.z) / dt - s.vel.z) * 0.3;
    }
    s.last.copy(g.position);
    const speed = Math.hypot(s.vel.x, s.vel.z);

    // How far out of the ground: 0 hidden, 1 standing.
    const t = now - s.t0;
    let up = 0;
    if (s.phase === "rise") {
      const u = Math.min(1, t / RISE);
      // A pop with a little overshoot — out, a touch too far, settle.
      up = calm ? u : 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);
    } else if (s.phase === "look" || s.phase === "held" || s.phase === "fall") {
      up = 1;
    } else if (s.phase === "flinch") {
      // A jump straight up on the spot.
      up = 1 + (calm ? 0 : 0.07 * Math.sin(Math.PI * Math.min(1, t / FLINCH)));
    } else if (s.phase === "land") {
      // Down a little into the ground on impact, and back up.
      up = 1 - (calm ? 0 : 0.1 * Math.sin(Math.PI * Math.min(1, t / LAND)));
    } else if (s.phase === "duck") {
      const u = Math.min(1, t / DUCK);
      up = 1 - u * u;
    }
    const visible = s.phase !== "hidden";
    const k0 = s.seed;
    g.visible = visible;
    if (body.current) {
      body.current.position.y = (up - 1) * DEPTH + s.lift;
    }

    /*
     * Swinging: carried by the scruff it hangs like a pendulum, trailing the
     * way it is being moved and swinging back past upright when it stops.
     * Worked out in the world and turned into its own frame.
     */
    const held = s.phase === "held" || s.phase === "fall";
    const targetX = held && !calm ? Math.max(-0.5, Math.min(0.5, -s.vel.x * 0.35)) : 0;
    const targetZ = held && !calm ? Math.max(-0.5, Math.min(0.5, s.vel.z * 0.35)) : 0;
    s.swingVX += ((targetX - s.swingX) * 90 - s.swingVX * 9) * dt;
    s.swingVZ += ((targetZ - s.swingZ) * 90 - s.swingVZ * 9) * dt;
    s.swingX += s.swingVX * dt;
    s.swingZ += s.swingVZ * dt;
    if (body.current) {
      const c = Math.cos(g.rotation.y);
      const sn = Math.sin(g.rotation.y);
      // World tilt about z (from x motion) and about x (from z motion), into
      // the animal's own axes.
      const aboutX = c * s.swingZ + sn * s.swingX;
      const aboutZ = -sn * s.swingZ + c * s.swingX;
      body.current.rotation.set(aboutX + (calm ? 0 : Math.sin(now * 2.6) * 0.012), 0, aboutZ);
    }

    /*
     * The grass, while it is moving through it: thrashing all the time it is
     * going up or down, a wake behind it while it is carried, and the faint
     * stir of something breathing in it while it stands. A steady outward
     * shove with a wobble on it, driven near the grass's own rate (the springs
     * ring at about 2.4 Hz and are heavily damped — pushed faster than that,
     * each shove cancels the last and the grass barely moves).
     */
    if (!calm && visible) {
      const moving = s.phase === "rise" || s.phase === "duck" || s.phase === "flinch" || s.phase === "land";
      const force = held ? 40 + speed * 90 : moving ? 130 : 16;
      sway.impulse(g.position.x, g.position.z, 0.36 * SIZE, force * (0.5 + Math.sin(now * 16 + k0)) * dt);
    }

    // The burrow shows while it is in it, and fades once it has been carried
    // away from it or has gone down it.
    const inHole = visible && !held;
    s.holeFade += ((inHole ? 1 : 0) - s.holeFade) * Math.min(1, (inHole ? 6 : 1.6) * dt);
    M_HOLE.opacity = 0.85 * s.holeFade;
    M_RIM.opacity = s.holeFade;
    if (burrow.current) {
      burrow.current.visible = s.holeFade > 0.01;
      burrow.current.scale.setScalar(0.7 + 0.3 * s.holeFade);
    }

    // Its menu rides along with it, anchored at its chest.
    if (groundhogMenu.open) {
      if (s.phase === "duck" || s.phase === "hidden") {
        closeGroundhogMenu();
      } else {
        const chest = s.probe
          .set(g.position.x, g.position.y + (body.current?.position.y ?? 0) + 0.42 * SIZE, g.position.z)
          .project(camera);
        placeGroundhogMenu(((chest.x + 1) / 2) * window.innerWidth, ((1 - chest.y) / 2) * window.innerHeight);
      }
    }

    if (!visible || calm) return;

    // Forelegs: held to the chest — paddling the air while it is carried.
    arms.current.forEach((arm, i) => {
      if (!arm) return;
      const side = i === 0 ? -1 : 1;
      const paddle = held ? Math.sin(now * 13 + i * Math.PI) * 0.6 : 0;
      s.paddle[i] += (paddle - s.paddle[i]) * (1 - Math.exp(-dt * 20));
      arm.quaternion
        .copy(ARMS[i].rest)
        .multiply(s.turn.setFromAxisAngle(X_AXIS, s.paddle[i]))
        .multiply(s.turn2.setFromAxisAngle(Z_AXIS, held ? side * -0.25 : 0));
    });

    /*
     * Where it looks: a slow, continuous sweep from side to side — unless the
     * cursor is close, in which case it turns and watches it. Carried, it
     * looks about wildly. Either way the head eases toward its target.
     */
    let yawTarget = Math.sin(now * 0.75 + k0) * 0.42 + Math.sin(now * 1.6 + k0 * 2) * 0.12;
    let rollTarget = Math.sin(now * 0.55 + k0 * 3) * 0.06;
    if (held) {
      yawTarget = Math.sin(now * 5.5 + k0) * 0.6;
      rollTarget = Math.sin(now * 4.1) * 0.12;
    } else if (pointer.active) {
      s.probe.set(g.position.x, SOIL.bed + 0.5 * SIZE, g.position.z).project(camera);
      const near = Math.hypot(pointer.ndcX - s.probe.x, pointer.ndcY - s.probe.y);
      if (near < NOTICE) {
        let a = Math.atan2(pointer.worldX - g.position.x, pointer.worldZ - g.position.z) - g.rotation.y;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        yawTarget = Math.max(-0.85, Math.min(0.85, a));
        // A curious tilt, the way an animal cocks its head at something new.
        rollTarget = 0.12 * Math.sign(a || 1);
      }
    }
    const ease = 1 - Math.exp(-dt * (s.phase === "flinch" || held ? 12 : 5));
    s.yaw += (yawTarget - s.yaw) * ease;
    s.roll += (rollTarget - s.roll) * ease;
    TWIST.uYaw.value = s.yaw;
    TWIST.uRoll.value = s.roll;
    head.current?.rotation.set(0, s.yaw, s.roll, "ZYX");

    // A twitch on the nose's own height — a fraction of it, never a value of
    // its own, or the nose stretches into a rod through the whole animal.
    if (nose.current) {
      nose.current.scale.y = NOSE[1] * (1 + Math.sin(now * 22) * 0.15 * (Math.sin(now * 1.7) > 0 ? 1 : 0));
    }
    // Eyes: blinking at rest; wide open, and not blinking, when alarmed.
    const alarmed = s.phase === "flinch" || held || s.phase === "land";
    s.wide += ((alarmed ? 1.35 : 1) - s.wide) * (1 - Math.exp(-dt * 18));
    if (now > s.blinkAt + 0.12) s.blinkAt = now + 1.4 + Math.random() * 2.2;
    const blink = !alarmed && now > s.blinkAt ? 0.12 : 1;
    for (const eye of eyes.current) eye?.scale.set(s.wide, s.wide * blink, s.wide);
  });

  const fur = M_FUR as Material;

  return (
    <>
      {/* The burrow stays where it was dug; the animal can be carried off. */}
      <group ref={burrow} visible={false}>
        <mesh geometry={HOLE} material={M_HOLE} position={[0, 0.002, 0]} renderOrder={1} />
        <mesh geometry={RIM} material={M_RIM} />
      </group>

      <group ref={root} visible={false}>
        <group ref={body} scale={SIZE}>
          <mesh ref={hull} geometry={BODY} material={M_BODY} />

          {/* Forelegs against the chest. */}
          {ARMS.map((a, i) => (
            <group
              key={a.side}
              position={a.at}
              quaternion={a.rest}
              ref={(el) => {
                arms.current[i] = el;
              }}
            >
              <mesh geometry={ARM} material={fur} />
            </group>
          ))}

          <group ref={head} position={PIVOT.toArray()} rotation={[0, 0, 0, "ZYX"]}>
            <mesh ref={nose} geometry={BEAD} material={M_NOSE} position={FACE.nose} scale={NOSE} />
            {FACE.teeth.map((at, i) => (
              <mesh key={i} geometry={TOOTH} material={M_TOOTH} position={at} />
            ))}
            {FACE.eyes.map((eye, i) => (
              <group
                key={i}
                position={eye.at}
                ref={(el) => {
                  eyes.current[i] = el;
                }}
              >
                <mesh geometry={BEAD} material={M_EYE} scale={0.0115} />
                {/* Catchlight, so the eye reads wet from any angle. */}
                <mesh
                  geometry={BEAD}
                  material={M_GLINT}
                  position={[eye.glint[0] - eye.at[0], eye.glint[1] - eye.at[1], eye.glint[2] - eye.at[2]]}
                  scale={0.0026}
                />
              </group>
            ))}
            {FACE.ears.map(({ at, side }) => (
              <mesh key={side} geometry={EAR} material={fur} position={at} rotation={[0, side * 1.32, 0]} />
            ))}
            <lineSegments geometry={WHISKERS}>
              <lineBasicMaterial color="#f4e6c8" transparent opacity={0.45} />
            </lineSegments>
          </group>
        </group>
      </group>
    </>
  );
}

/**
 * The same animal standing still, for anywhere else that wants one — the
 * bowling page sets ten of them up as pins. No burrow, no behaviour, and the
 * plain fur rather than the twisting neck: that material's uniforms are shared,
 * so ten heads would all turn as one. Feet at the origin, facing +z, at the
 * model's own size (about sixty centimetres) before any scale is applied.
 * `fur` swaps the coat's material, for light that is nothing like the field's.
 */
export function GroundhogFigure({ shadows = false, fur = M_FUR }: { shadows?: boolean; fur?: Material }) {
  return (
    <group>
      <mesh geometry={BODY} material={fur} castShadow={shadows} receiveShadow={shadows} />
      {ARMS.map((a) => (
        <group key={a.side} position={a.at} quaternion={a.rest}>
          <mesh geometry={ARM} material={fur} castShadow={shadows} />
        </group>
      ))}
      <group position={PIVOT.toArray()}>
        <mesh geometry={BEAD} material={M_NOSE} position={FACE.nose} scale={NOSE} />
        {FACE.teeth.map((at, i) => (
          <mesh key={i} geometry={TOOTH} material={M_TOOTH} position={at} />
        ))}
        {FACE.eyes.map((eye, i) => (
          <group key={i} position={eye.at}>
            <mesh geometry={BEAD} material={M_EYE} scale={0.0115} />
            <mesh
              geometry={BEAD}
              material={M_GLINT}
              position={[eye.glint[0] - eye.at[0], eye.glint[1] - eye.at[1], eye.glint[2] - eye.at[2]]}
              scale={0.0026}
            />
          </group>
        ))}
        {FACE.ears.map(({ at, side }) => (
          <mesh key={side} geometry={EAR} material={fur} position={at} rotation={[0, side * 1.32, 0]} />
        ))}
        <lineSegments geometry={WHISKERS}>
          <lineBasicMaterial color="#f4e6c8" transparent opacity={0.45} />
        </lineSegments>
      </group>
    </group>
  );
}
