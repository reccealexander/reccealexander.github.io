import { useEffect, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Group, OrthographicCamera } from "three";
import { BOWLING_PATH, navigate } from "@/lib/router";
import {
  bowlingPhase,
  bowlingTransition,
  setBowlingPhase,
  subscribeBowlingTransition,
} from "@/lib/bowlingTransition";
import { GroundhogFigure } from "@/three/Groundhog";

/**
 * The loading screen for the bowling alley: the groundhog itself.
 *
 * It lies on its side — head leftmost, haunches and legs rightmost — and is
 * big enough that its body alone covers the whole screen: its head comes in
 * taller than the frame, and while the thick of it is passing there is
 * nothing but groundhog to see. One continuous pass from right to left: it
 * eases in, whooshes through, and eases out. The page changes while its body
 * covers everything, and the alley is revealed behind its back as it goes.
 *
 * If the alley has not drawn by the time the groundhog's rear is about to
 * uncover it, it slows to a stop rather than snapping — and picks up again
 * once it has. Most of the time it never needs to.
 *
 * Its own small orthographic scene, sized in screen heights, so the sizes
 * below mean the same on a phone and a monitor.
 */
/** One full pass, start to finish, if nothing has to wait. */
const PASS = 1.4;
/** Show the alley anyway after this, ready or not. */
const MAX_WAIT = 8;
/** The model, feet to the top of its head, in its own units. */
const HEAD_Y = 0.594;
const FEET_Y = -0.05;
/**
 * The band of its body that is wide enough to cover the screen: from its feet
 * up to its chest the body is never narrower than about a quarter of its
 * length. That band is made taller than the screen and wider than it.
 */
const BAND_TOP = 0.3;
const BAND_WIDTH = 0.26;

/** Slow at the ends, fast through the middle. */
const ease = (s: number) => 0.5 - 0.5 * Math.cos(Math.PI * s);
const unease = (e: number) => Math.acos(1 - 2 * Math.min(1, Math.max(0, e))) / Math.PI;

function Wipe() {
  const { size, camera } = useThree();
  const animal = useRef<Group>(null);
  const run = useRef({ s: -1, speed: 1 / PASS, waited: 0, navigated: false });

  useFrame(({ clock }, delta) => {
    const ortho = camera as OrthographicCamera;
    // One unit is half the screen's height.
    ortho.zoom = size.height / 2;
    ortho.updateProjectionMatrix();

    const dt = Math.min(0.05, delta);
    const W = (2 * size.width) / size.height;
    const H = 2;
    const scale = Math.max((1.35 * W) / BAND_TOP, (1.05 * H) / BAND_WIDTH);
    // Where its origin (its feet) is: lying head-left, its own up is screen
    // left, so the head is at origin - HEAD_Y·scale.
    const start = W / 2 + HEAD_Y * scale + 0.05;
    const end = -W / 2 + FEET_Y * scale - 0.1;
    // Covered while its feet are past the right edge and its chest past the
    // left: from here the page may change, and up to there it must be ready.
    const coverFrom = BAND_TOP * scale - W / 2 - 0.05;
    const coverTo = W / 2 + 0.05;
    const at = (x: number) => unease((start - x) / (start - end));

    const r = run.current;
    const phase = bowlingTransition.phase;
    if (r.s < 0) {
      // Arriving straight at the alley: already covering it.
      r.s = phase === "hold" ? at((coverFrom + coverTo) / 2) : 0;
      r.navigated = phase === "hold";
      r.speed = 1 / PASS;
      r.waited = 0;
    }

    // Slow to a stop before uncovering an alley that is not ready yet.
    const hold = at(coverTo);
    const ready = bowlingTransition.ready || r.waited > MAX_WAIT;
    let want = 1 / PASS;
    if (!ready && r.navigated) {
      want *= Math.min(1, Math.max(0, (hold - r.s) / 0.12));
      r.waited += dt;
    }
    r.speed += (want - r.speed) * (1 - Math.exp(-dt * 10));
    r.s = Math.min(1, r.s + r.speed * dt);
    const origin = start + (end - start) * ease(r.s);

    if (!r.navigated && origin <= coverFrom) {
      r.navigated = true;
      navigate(BOWLING_PATH);
      setBowlingPhase("hold");
    }
    if (phase === "hold" && origin < coverTo) setBowlingPhase("out");
    if (r.s >= 1) {
      r.s = -1;
      setBowlingPhase("idle");
    }

    const g = animal.current;
    if (g) {
      g.scale.setScalar(scale);
      g.position.set(origin, Math.sin(clock.elapsedTime * 11) * 0.01, 0);
      g.rotation.set(0, 0, Math.PI / 2 + Math.sin(clock.elapsedTime * 7) * 0.01);
    }
  });

  return (
    <>
      {/* A key from the upper left and little fill, so the body has form
          rather than being one flat orange. */}
      <ambientLight intensity={0.25} />
      <hemisphereLight args={[0xfff1d6, 0x2a1d12, 0.55]} />
      <directionalLight position={[-3, 4, 5]} intensity={2.1} color="#ffe2b0" />
      <directionalLight position={[3, -2, 2]} intensity={0.35} color="#9fb4d0" />
      <group ref={animal}>
        <GroundhogFigure />
      </group>
    </>
  );
}

export default function BowlingTransition() {
  const phase = useSyncExternalStore(subscribeBowlingTransition, bowlingPhase, bowlingPhase);
  const live = useRef<HTMLSpanElement>(null);

  // Nothing under it takes a click while it is crossing.
  useEffect(() => {
    if (phase === "idle") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div className="fixed inset-0 z-[80]" aria-hidden={false}>
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 10], near: 0.1, far: 100 }}
      >
        <Wipe />
      </Canvas>
      <span ref={live} role="status" className="sr-only">
        {phase === "out" ? "" : "Loading the bowling alley"}
      </span>
    </div>
  );
}
