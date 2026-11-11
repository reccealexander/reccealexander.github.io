import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  PMREMGenerator,
  Plane,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  SpotLight,
  Vector2,
  Vector3,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GroundhogFigure } from "@/three/Groundhog";
import Meadow from "./Meadow";
import Sky, { SKY_HAZE } from "./Sky";
import { cursor, game, update } from "./game";
import {
  predict,
  BALL_R,
  BALL_START_Z,
  GUTTER_W,
  HEAD_Z,
  KICKBACK_Z,
  LANE_HALF,
  LANE_LEN,
  MAX_AIM,
  PIN_R,
  PIN_SCALE,
  PIN_SPACING,
  PIT_Z,
  WALL_X,
} from "./physics";


/* ------------------------------------------------------------ textures */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Thirty-nine maple boards, the targeting arrows and dots, and the foul line,
    drawn the length of the lane from the foul line (top) to the pit. */
const LANE_TOTAL = -PIT_Z;
function laneTexture() {
  const W = 512;
  const H = 4096;
  const px = H / LANE_TOTAL;
  return canvasTexture(W, H, (g) => {
    const boards = 39;
    for (let i = 0; i < boards; i++) {
      const t = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const l = 62 + Math.abs(t) * 10;
      g.fillStyle = `hsl(32, 48%, ${l}%)`;
      g.fillRect((i * W) / boards, 0, W / boards + 1, H);
      // Grain.
      g.globalAlpha = 0.08;
      for (let k = 0; k < 40; k++) {
        g.fillStyle = k % 2 ? "#6b4321" : "#fff3d6";
        const x = (i * W) / boards + Math.random() * (W / boards);
        g.fillRect(x, Math.random() * H, 1, 60 + Math.random() * 400);
      }
      g.globalAlpha = 1;
      g.fillStyle = "rgba(70,40,15,0.35)";
      g.fillRect((i * W) / boards, 0, 1, H);
    }
    // The pin deck is a lighter, harder wood.
    g.fillStyle = "rgba(255,240,215,0.18)";
    g.fillRect(0, (LANE_LEN - 0.35) * px, W, H);
    // Foul line.
    g.fillStyle = "#1a1310";
    g.fillRect(0, 0, W, 0.02 * px);
    const board = (n: number) => ((n - 0.5) / boards) * W;
    // Guide dots, and the seven arrows a third of the way down.
    g.fillStyle = "#2a1a10";
    for (const n of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
      g.beginPath();
      g.arc(board(n), 1.8 * px, 5, 0, Math.PI * 2);
      g.fill();
    }
    for (const n of [5, 10, 15, 20, 25, 30, 35]) {
      const off = Math.abs(n - 20) / 5;
      const y = (3.6 + off * 0.3) * px;
      g.beginPath();
      g.moveTo(board(n), y - 0.42 * px);
      g.lineTo(board(n) + 6, y);
      g.lineTo(board(n) - 6, y);
      g.closePath();
      g.fill();
    }
    // Where the pins stand.
    for (let row = 0; row < 4; row++) {
      for (let j = 0; j <= row; j++) {
        const x = W / 2 + ((j - row / 2) * PIN_SPACING * W) / (LANE_HALF * 2);
        const y = (LANE_LEN + row * PIN_SPACING * Math.sin(Math.PI / 3)) * px;
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** The approach: paler boards behind the foul line, with their own dots. */
function approachTexture() {
  return canvasTexture(256, 512, (g) => {
    for (let i = 0; i < 39; i++) {
      g.fillStyle = `hsl(34, 35%, ${54 + ((i * 7) % 5) * 1.5}%)`;
      g.fillRect((i * 256) / 39, 0, 256 / 39 + 1, 512);
    }
    g.fillStyle = "#2a1a10";
    for (const y of [120, 300])
      for (const n of [5, 10, 15, 20, 25, 30, 35]) {
        g.beginPath();
        g.arc(((n - 0.5) / 39) * 256, y, 3, 0, Math.PI * 2);
        g.fill();
      }
  });
}

/** A ball in the site's colours: deep forest green marbled with gold. */
function ballTexture() {
  return canvasTexture(1024, 512, (g) => {
    g.fillStyle = "#0f2a1b";
    g.fillRect(0, 0, 1024, 512);
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = k % 3 ? "rgba(242,199,68,0.45)" : "rgba(228,129,63,0.5)";
      g.lineWidth = 3 + Math.random() * 14;
      g.beginPath();
      let x = Math.random() * 1024;
      let y = Math.random() * 512;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        const nx = x + (Math.random() - 0.5) * 400;
        const ny = y + (Math.random() - 0.5) * 220;
        g.quadraticCurveTo(x + (Math.random() - 0.5) * 300, y + (Math.random() - 0.5) * 300, nx, ny);
        x = nx;
        y = ny;
      }
      g.stroke();
    }
    // Finger holes.
    g.fillStyle = "#050806";
    for (const [x, y, r] of [
      [500, 220, 24],
      [548, 220, 24],
      [524, 300, 30],
    ]) {
      g.beginPath();
      g.ellipse(x, y, r, r * 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function signTexture() {
  const t = canvasTexture(2048, 320, drawSign);
  // Drawn once straight away in whatever font is to hand, and again once the
  // display face has arrived.
  document.fonts
    ?.load("italic 700 150px 'Playfair Display'")
    .then(() => {
      drawSign((t.image as HTMLCanvasElement).getContext("2d")!);
      t.needsUpdate = true;
    })
    .catch(() => {});
  return t;
}

function drawSign(g: CanvasRenderingContext2D) {
  g.fillStyle = "#0c0f0d";
  g.fillRect(0, 0, 2048, 320);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "italic 700 150px 'Playfair Display', Georgia, serif";
  g.shadowColor = "#f2c744";
  g.shadowBlur = 40;
  g.fillStyle = "#f2c744";
  g.fillText("Groundhog Bowling", 1024, 165);
  g.shadowBlur = 0;
}

function blobTexture() {
  return canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(0,0,0,0.75)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
}

/* ------------------------------------------------------------- the room */

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
}

const GUTTER = new CylinderGeometry(GUTTER_W / 2, GUTTER_W / 2, 1, 20, 1, true, -Math.PI / 2, Math.PI);

function Lane() {
  const tex = useMemo(
    () => ({ lane: laneTexture(), approach: approachTexture(), sign: signTexture() }),
    [],
  );
  const len = -PIT_Z;
  return (
    <group>
      {/* The lane, foul line to pit. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -len / 2]} receiveShadow>
        <planeGeometry args={[LANE_HALF * 2, len]} />
        <meshPhysicalMaterial map={tex.lane} roughness={0.32} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      {/* The approach. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 2.6]} receiveShadow>
        <planeGeometry args={[LANE_HALF * 2 + GUTTER_W * 2, 5.2]} />
        <meshStandardMaterial map={tex.approach} roughness={0.6} />
      </mesh>

      {/* Gutters, and the edge boards between them and the grass. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            geometry={GUTTER}
            position={[side * (LANE_HALF + GUTTER_W / 2), 0, -len / 2]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[1, len, 0.65]}
            receiveShadow
          >
            <meshStandardMaterial color="#1b2220" metalness={0.6} roughness={0.35} side={DoubleSide} />
          </mesh>
          <mesh position={[side * (WALL_X + 0.06), -0.045, -len / 2 + 2.6]} receiveShadow>
            <boxGeometry args={[0.12, 0.11, len + 5.2]} />
            <meshStandardMaterial color="#3a2a1c" roughness={0.75} />
          </mesh>
          {/* Kickback walls along the pin deck. */}
          <mesh position={[side * (WALL_X + 0.03), 0.3, (KICKBACK_Z + PIT_Z) / 2 - 0.3]}>
            <boxGeometry args={[0.06, 0.6, KICKBACK_Z - PIT_Z + 0.6]} />
            <meshStandardMaterial color="#1f2a24" roughness={0.6} />
          </mesh>
          {/* A thin gold rail lit along the lane edge. */}
          <mesh position={[side * (WALL_X + 0.005), 0.012, -LANE_LEN / 2]}>
            <boxGeometry args={[0.01, 0.012, LANE_LEN]} />
            <meshBasicMaterial color="#f2c744" toneMapped={false} transparent opacity={0.55} />
          </mesh>
        </group>
      ))}

      {/* The pit, and the curtain behind it. */}
      <mesh position={[0, -0.4, PIT_Z - 0.4]}>
        <boxGeometry args={[WALL_X * 2 + 0.2, 0.5, 0.8]} />
        <meshStandardMaterial color="#050605" roughness={1} />
      </mesh>
      <mesh position={[0, 0.6, PIT_Z - 0.75]}>
        <planeGeometry args={[WALL_X * 2 + 1, 1.6]} />
        <meshStandardMaterial color="#0b0d0c" roughness={1} />
      </mesh>

      {/* Masking unit over the pins. */}
      <mesh position={[0, 1.22, HEAD_Z - 0.35]}>
        <planeGeometry args={[WALL_X * 2 + 1.6, 0.25 * 2.1]} />
        <meshBasicMaterial map={tex.sign} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.65, HEAD_Z - 0.6]}>
        <boxGeometry args={[WALL_X * 2 + 1.6, 0.4, 1.4]} />
        <meshStandardMaterial color="#0a0d0b" roughness={0.9} />
      </mesh>

    </group>
  );
}

/* ---------------------------------------------------------------- pins */

/*
 * The coat, relit. The field's fur carries a warm glow of its own because out
 * there the sun is behind the animal; under the lanes' lights it is lit from
 * the front, and the same glow bleaches it to cream.
 */
const PIN_FUR = new MeshPhysicalMaterial({
  vertexColors: true,
  // Darker and greyer than the field's coat: under the deck light the same
  // colours wash out to a bright orange, where a real groundhog is a
  // grizzled brown.
  color: "#7f766e",
  roughness: 0.9,
  sheen: 1,
  sheenColor: new Color("#ffd08a"),
  sheenRoughness: 0.45,
});

const UP = new Vector3(0, 1, 0);
const AXIS = new Vector3();
const QA = new Quaternion();
const QB = new Quaternion();

function Pins() {
  const refs = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    const pins = game.world.pins;
    const now = clock.elapsedTime;
    const b = game.world.ball;
    // Braced as the ball comes in.
    const brace = b && !b.gone ? Math.max(0, 1 - (b.z - HEAD_Z) / 3) : 0;
    for (let i = 0; i < 10; i++) {
      const g = refs.current[i];
      const p = pins[i];
      if (!g) continue;
      g.visible = !!p && !p.gone;
      if (!p || p.gone) continue;
      let tilt = p.tilt;
      let dx = p.dirX;
      let dz = p.dirZ;
      if (!p.down && p.wobble > 0) {
        tilt = p.wobble * Math.sin(p.wobbleT * 15);
        dx = 0;
        dz = 1;
      }
      const inGutter = Math.abs(p.x) > LANE_HALF + 0.02 && p.z > KICKBACK_Z;
      g.position.set(p.x, p.y + PIN_R * 0.95 * Math.sin(Math.abs(tilt)) - (inGutter ? 0.07 : 0), p.z);
      AXIS.set(dz, 0, -dx).normalize();
      g.quaternion.copy(QA.setFromAxisAngle(AXIS, tilt)).multiply(QB.setFromAxisAngle(UP, p.yaw));
      const breathe = p.down ? 0 : Math.sin(now * 2.2 + i * 1.7) * 0.012;
      const squash = p.down ? 0 : brace * 0.06;
      g.scale.set(PIN_SCALE * (1 + squash * 0.5), PIN_SCALE * (1 + breathe - squash), PIN_SCALE * (1 + squash * 0.5));
    }
  });
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <GroundhogFigure shadows fur={PIN_FUR} />
        </group>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- ball */

function Ball() {
  const mesh = useRef<Mesh>(null);
  const blob = useRef<Mesh>(null);
  const tex = useMemo(() => ({ ball: ballTexture(), blob: blobTexture() }), []);
  const spinAxis = useMemo(() => new Vector3(), []);
  const q = useMemo(() => new Quaternion(), []);
  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(0.05, delta);
    const b = game.world.ball;
    if (b && !b.gone) {
      m.visible = true;
      m.position.set(b.x, b.y, b.z);
      // Rolling: about the axis across its path...
      const v = Math.hypot(b.vx, b.vz);
      if (v > 0.01) {
        spinAxis.set(-b.vz, 0, b.vx).normalize();
        m.quaternion.premultiply(q.setFromAxisAngle(spinAxis, -(v / BALL_R) * dt));
        // ...and the side rotation that makes it hook, about the line of it.
        spinAxis.set(b.vx / v, 0, b.vz / v);
        m.quaternion.premultiply(q.setFromAxisAngle(spinAxis, -b.spin * 9 * dt));
      }
    } else if (game.phase === "aim" || game.phase === "over") {
      // Waiting at the line, turning over the way it is about to be thrown.
      m.visible = true;
      m.position.set(0, BALL_R, BALL_START_Z);
      spinAxis.set(0, 0, -1);
      m.quaternion.premultiply(q.setFromAxisAngle(spinAxis, -game.spin * 5 * dt));
    } else {
      m.visible = false;
    }
    if (blob.current) {
      blob.current.visible = m.visible && m.position.y > 0.05;
      blob.current.position.set(m.position.x, 0.004, m.position.z);
    }
  });
  return (
    <>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[BALL_R, 48, 32]} />
        <meshPhysicalMaterial map={tex.ball} roughness={0.12} clearcoat={1} clearcoatRoughness={0.03} />
      </mesh>
      <mesh ref={blob} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BALL_R * 3, BALL_R * 3]} />
        <meshBasicMaterial map={tex.blob} transparent depthWrite={false} />
      </mesh>
    </>
  );
}

/* ----------------------------------------------------------- guideline */

/*
 * The guideline: a dotted line on the boards showing exactly where this throw
 * will go — straight along the aim with no spin, bending into its hook as the
 * spin is dragged in. It runs the same integrator as the real ball, so the
 * dots are a promise. Gold when the ball is hooking, red where it would drop
 * into the gutter.
 */
const DOTS = 100;
/** Drawn in xy; turned to lie flat on the boards. */
const DOT = new CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const WHITE = new Color("#f5f2ed");
const GOLD = new Color("#f2c744");
const RED = new Color("#e4513f");

function Guide() {
  const inst = useRef<InstancedMesh>(null);
  const memo = useMemo(() => ({ aim: NaN, spin: NaN, dummy: new Object3D(), c: new Color() }), []);
  useFrame(({ clock }) => {
    const m = inst.current;
    if (!m) return;
    m.visible = game.phase === "aim";
    if (!m.visible) return;
    const now = clock.elapsedTime;
    const { points, gutterAt } = predict(game.aim, game.spin);
    memo.aim = game.aim;
    memo.spin = game.spin;
    const hook = Math.abs(game.spin);
    for (let i = 0; i < DOTS; i++) {
      const p = points[i];
      if (!p) {
        memo.dummy.scale.setScalar(0);
      } else {
        const dist = BALL_START_Z - p[1];
        // A pulse running down the line, toward the pins.
        const pulse = 0.5 + 0.5 * Math.sin(dist * 1.6 - now * 6);
        memo.dummy.position.set(p[0], 0.004, p[1]);
        memo.dummy.scale.setScalar(0.013 + dist * 0.0018 + pulse * 0.004);
        const fade = 0.35 + 0.65 * (1 - dist / (LANE_LEN + 1));
        memo.c
          .copy(WHITE)
          .lerp(GOLD, Math.min(1, hook * 1.4) * Math.min(1, dist / 6))
          .multiplyScalar(fade * (0.6 + 0.4 * pulse));
        if (gutterAt >= 0 && i >= gutterAt - 1) memo.c.copy(RED).multiplyScalar(fade);
        m.setColorAt(i, memo.c);
      }
      memo.dummy.updateMatrix();
      m.setMatrixAt(i, memo.dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={inst} args={[DOT, undefined, DOTS]} frustumCulled={false}>
      <meshBasicMaterial blending={AdditiveBlending} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/* ---------------------------------------------------------- the camera */

const AIM_POS = new Vector3(0, 1.15, 2.4);
const AIM_LOOK = new Vector3(0, 0.12, -6.5);
/** The cursor aims through the arrows, the way a bowler does — not at the
    pins, where a few pixels would be the width of the lane. */
const ARROWS_Z = -3.4;
const AIM_PLANE = new Plane(new Vector3(0, 0, 1), -ARROWS_Z);

function Rig() {
  const { camera } = useThree();
  const s = useMemo(
    () => ({
      pos: AIM_POS.clone(),
      look: AIM_LOOK.clone(),
      tPos: new Vector3(),
      tLook: new Vector3(),
      ray: new Raycaster(),
      ndc: new Vector2(),
      hit: new Vector3(),
    }),
    [],
  );
  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);

    // Behind the ball as it goes, then holding a few metres off the pins.
    const b = game.world.ball;
    if (b && (game.phase === "roll" || game.phase === "sweep")) {
      const z = Math.max(b.z + 3, HEAD_Z + 5);
      s.tPos.set(b.gone ? 0 : b.x * 0.35, 1.05 - Math.min(0.2, (BALL_START_Z - b.z) * 0.02), z);
      s.tLook.set(0, 0.1, Math.max(HEAD_Z - 0.3, z - 7));
    } else {
      s.tPos.copy(AIM_POS);
      s.tLook.copy(AIM_LOOK);
    }
    const k = 1 - Math.exp(-dt * (game.phase === "roll" ? 4.5 : 2.6));
    s.pos.lerp(s.tPos, k);
    s.look.lerp(s.tLook, k);
    camera.position.copy(s.pos);
    camera.lookAt(s.look);

    /*
     * Aiming: wherever the cursor points across the pin line is where a
     * straight ball would arrive. Not while a spin is being dragged in — the
     * cursor is busy then, and the aim holds where it was.
     */
    if (game.phase === "aim" && cursor.active && !game.drag) {
      s.ndc.set(cursor.x, cursor.y);
      s.ray.setFromCamera(s.ndc, camera);
      if (s.ray.ray.intersectPlane(AIM_PLANE, s.hit)) {
        const target = Math.atan2(s.hit.x, BALL_START_Z - ARROWS_Z);
        const clamped = Math.max(-MAX_AIM, Math.min(MAX_AIM, target));
        game.aim += (clamped - game.aim) * (1 - Math.exp(-dt * 20));
      }
    }
  });
  return null;
}

/** Moves the game on, before anything that draws it reads it this frame. */
function Tick() {
  useFrame((_, delta) => update(Math.min(0.05, delta)), -1);
  return null;
}

/** A spotlight aimed at a point. Its target has to be in the scene for the
    aim to take, so it is added as a child. */
function Spot({
  position,
  at,
  angle,
  intensity,
  shadows = false,
}: {
  position: [number, number, number];
  at: [number, number, number];
  angle: number;
  intensity: number;
  shadows?: boolean;
}) {
  const light = useRef<SpotLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(at[0] - position[0], at[1] - position[1], at[2] - position[2]);
    l.add(l.target);
  }, [at, position]);
  return (
    <spotLight
      ref={light}
      position={position}
      angle={angle}
      penumbra={0.6}
      intensity={intensity}
      decay={1.5}
      color="#fff1d6"
      castShadow={shadows}
      shadow-mapSize={[1024, 1024]}
      shadow-bias={-0.0004}
    />
  );
}

export default function Alley() {
  return (
    <>
      <Tick />
      <color attach="background" args={[SKY_HAZE]} />
      <fog attach="fog" args={[SKY_HAZE, 10, 34]} />
      <Environment />
      <hemisphereLight args={["#ffe9c4", "#0b120e", 0.5]} />
      {/* Warm light down the lane, and a hard spot on the deck. */}
      {[-1, -3, -5, -7].map((z) => (
        <pointLight key={z} position={[0, 2.2, z]} intensity={2.2} distance={6} decay={1.4} color="#ffd9a0" />
      ))}
      <Spot position={[0, 3.2, HEAD_Z + 1.6]} at={[0, 0, HEAD_Z - 0.4]} angle={0.55} intensity={11} shadows />
      <Spot position={[0.6, 3, 1.5]} at={[0, 0, -1]} angle={0.5} intensity={8} />
      <Sky />
      <Meadow />
      <Lane />
      <Pins />
      <Ball />
      <Guide />
      <Rig />
    </>
  );
}
