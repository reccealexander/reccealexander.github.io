import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ACESFilmicToneMapping, Color, DoubleSide, Group } from "three";
import type { Biome } from "@/lib/biomes";
import { COLOR } from "@/lib/palette";
import { clamp, damp } from "@/lib/math";
import { leafGeometry } from "@/three/geometry";
import { PETAL_FRAG, PETAL_VERT, petalUniforms } from "@/three/petalShader";
import { reducedMotion } from "@/three/quality";

/**
 * The leaf on its own page, turning to follow the cursor.
 *
 * This is the press.stripe.com "living cover", with a leaf where the book is.
 * Their object sits in a fixed canvas the page scrolls past and rotates toward
 * the pointer on two axes with the motion damped rather than tracked exactly,
 * so it reads as something heavy being turned rather than a value being written
 * to a transform. The same three things are what make it work here:
 *
 *  - The pointer drives a *target* attitude, never the attitude itself. Every
 *    frame the leaf moves a fixed fraction of the way there, which is what puts
 *    the weight in it.
 *  - It rotates about both axes at once — yaw with the cursor's x, pitch
 *    against its y — so moving diagonally turns it diagonally.
 *  - Left alone it returns to rest and keeps breathing. A prop that freezes the
 *    moment the mouse stops is a prop.
 *
 * What is not copied is the pointer geometry. Theirs is measured against the
 * window because the book is fixed in the middle of it; this canvas is a block
 * in a scrolling column, so the cursor is measured against the canvas's own
 * rectangle. Against the window, scrolling the leaf up the page would swing it
 * without the reader touching the mouse.
 */

/** How far it turns, in radians, at the edges of the frame. */
const YAW = 0.62;
const PITCH = 0.4;
/** And how fast it gets there. Lower is heavier. */
const FOLLOW = 3.4;
/** Where it sits when nothing is pointing at it. */
const REST_YAW = -0.34;
const REST_PITCH = 0.16;

/** Cursor position over the stage, -1..1, or null when it is elsewhere. */
const aim = { x: 0, y: 0, on: false };

function Blade({ biome }: { biome: Biome }) {
  const group = useRef<Group>(null);

  const geometry = useMemo(
    () =>
      leafGeometry({
        length: 1,
        width: 0.46,
        stalk: 0.2,
        droop: 0.5,
        fold: 0.3,
        twist: 0.55,
        wave: 0.34,
        sweep: 0.12,
        // This is one leaf filling a frame rather than one of four at four
        // centimetres, so it is worth the vertices: at the scene's nu the
        // margin's ripple is a row of flat facets across the whole page.
        nu: 120,
        nv: 32,
      }),
    [],
  );

  /*
   * The lit half of the biome's ramp, not the shaded half.
   *
   * A leaf in the field takes `deep`→`bright`, which are both nearly black —
   * biomes.ts says so outright: "`bright` is the top of the *shade*, not the
   * top of the picture", and where a blade is standing is what decides whether
   * three/sunlight.ts hands it the lit colours on top. There is no field here
   * and so no sunlight pass, so a leaf built from the shade ramp arrives on
   * this page as a dark olive smear with a lamp on it. It takes the lit greens
   * directly instead, which is the same leaf standing in the light.
   */
  const uniforms = useMemo(() => {
    const under = `#${new Color(biome.litA).lerp(new Color(biome.haze), 0.35).getHexString()}`;
    return petalUniforms({
      inner: biome.bright,
      outer: biome.litB,
      under,
      underside: 0.6,
      backlight: 0.5,
      tint: 1,
      veins: 0.85,
      midrib: 1,
    });
  }, [biome]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    // A tab left in the background hands back one enormous delta on its first
    // frame; unclamped that is a full revolution in one step.
    const step = Math.min(dt, 0.05);
    const t = state.clock.elapsedTime;

    // Breathing, so it is alive with the cursor off the stage — and the axis
    // the pointer is not driving hard, so the two never cancel into stillness.
    const idle = reducedMotion() ? 0 : 1;
    const driftY = idle * Math.sin(t * 0.42) * 0.05;
    const driftX = idle * Math.sin(t * 0.31 + 1.4) * 0.035;

    const targetYaw = REST_YAW + (aim.on ? aim.x * YAW : 0) + driftY;
    const targetPitch = REST_PITCH + (aim.on ? -aim.y * PITCH : 0) + driftX;
    // A little roll, taken off the yaw rather than from the pointer directly:
    // a leaf turning about its own stalk as it swings is what stops the motion
    // reading as a signboard on a turntable.
    const targetRoll = (aim.on ? aim.x : 0) * 0.16 + driftY * 0.5;

    g.rotation.y = damp(g.rotation.y, targetYaw, FOLLOW, step);
    g.rotation.x = damp(g.rotation.x, targetPitch, FOLLOW, step);
    g.rotation.z = damp(g.rotation.z, targetRoll, FOLLOW, step);
  });

  return (
    /*
     * Three nested frames, because the leaf is modelled growing out of an
     * origin it does not want to pivot about.
     *
     *  - `group` is the one the pointer turns.
     *  - Inside it, the blade is laid across the frame rather than pointing at
     *    the lens: leafGeometry runs along +z, and a leaf aimed at the camera
     *    is a stalk with a smudge behind it.
     *  - The mesh is then walked back half its own length *in its own frame*,
     *    which is the fix for the first version of this — it was offset in the
     *    parent's z, an axis the leaf no longer ran along after the turn, so
     *    the blade swung from one end like a pendulum and hung off the frame.
     */
    <group ref={group}>
      <group rotation={[0, Math.PI / 2 + 0.5, 0]}>
        <mesh geometry={geometry} position={[0, 0.2, -0.52]}>
          <shaderMaterial
            vertexShader={PETAL_VERT}
            fragmentShader={PETAL_FRAG}
            uniforms={uniforms}
            side={DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

export default function LeafStage({ biome }: { biome: Biome }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    // Measured against the stage, not the window — see the note above. The
    // rect is read per event rather than cached because this element moves up
    // the screen the whole time the reader is scrolling.
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      // A generous margin around the stage, so the leaf is already turning by
      // the time the cursor arrives rather than snapping to attention at the
      // edge of an invisible box.
      const pad = 0.55;
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      aim.on = Math.abs(x) < 1 + pad && Math.abs(y) < 1 + pad;
      aim.x = clamp(x, -1, 1);
      aim.y = clamp(y, -1, 1);
    };
    const off = () => {
      aim.on = false;
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", off);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", off);
      window.removeEventListener("blur", off);
      off();
    };
  }, []);

  return (
    <div
      ref={host}
      // Not interactive itself: the pointer is read off the window, and a
      // canvas that swallowed clicks would be sitting on top of the page's
      // own links on a narrow screen.
      className="pointer-events-none h-[46svh] w-full md:h-[62svh]"
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 1.8]}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 0.9,
        }}
        camera={{ fov: 34, near: 0.05, far: 20, position: [0, 0, 2.15] }}
      >
        {/* Pitched well under the field's key light. There the lamp is fighting
            a whole canopy; here it has one thin object to itself, and at the
            scene's intensity the blade's lit face simply clipped. */}
        <directionalLight position={[-2.5, 4, 3.5]} intensity={1.25} color={COLOR.sun} />
        <hemisphereLight args={[COLOR.skyLow.getHex(), COLOR.moss.getHex(), 0.85]} />
        <ambientLight intensity={0.5} color={COLOR.grassBright} />
        <Blade biome={biome} />
      </Canvas>
    </div>
  );
}
