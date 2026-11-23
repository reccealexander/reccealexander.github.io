import { useLayoutEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, FogExp2, PerspectiveCamera, Vector3 } from "three";
import type { Biome } from "@/lib/biomes";
import { sampleCamera, type CameraSample } from "@/lib/journey";
import { view } from "@/lib/flowerLayout";
import { clamp } from "@/lib/math";
import { stepPointer } from "@/lib/pointer";
import { reducedMotion } from "./quality";

/**
 * The camera, and the two things that have to happen in the same frame it does.
 *
 * It publishes its view-projection matrix for the DOM to place the bloom's
 * labels with, and it turns the cursor's screen position into a place in the
 * field for the grass to bend away from — both of which need the camera as it
 * is *this* frame, not as it was when React last rendered.
 */

/** The height the cursor is met at: the middle of a blade, not the soil. */
const CANOPY_Y = 0.2;

/**
 * Visibility is about 3/density: eighteen metres of field, which is what it
 * takes for the canopy to still be reading at the top of the frame rather than
 * dissolving a couple of metres out.
 */
const baseDensity = 0.16;

/**
 * ...except over water, where a third of it is right.
 *
 * The other three biomes are looking through a canopy: the haze is standing in
 * for depth in a thicket, and eighteen metres of it is generous. A pond is the
 * opposite kind of space. The reference photograph for this biome is clear from
 * the near bank to the far one — the reflected maples resolve as maples forty
 * metres out — and at 0.16 per metre everything past about three metres of
 * water dissolved into the sheen, which is why the surface read as milk and the
 * reflection washed to pale blue before it could be seen.
 */
const pondDensity = 0.055;

export default function Rig({ biome }: { biome: Biome }) {
  const { camera, scene, size } = useThree();
  const sample = useMemo<CameraSample>(
    () => ({ pos: new Vector3(), target: new Vector3(), fov: 42 }),
    [],
  );
  const ray = useMemo(() => new Vector3(), []);
  const calm = reducedMotion();

  useLayoutEffect(() => {
    const haze = new Color(biome.haze);
    // No sky, ever. The background is the colour the far field dissolves into,
    // so wherever the camera points there is field, or there is the dark it
    // fades to — never a horizon. That is the DOM site's hero, and it is what
    // lets near-white type sit directly on the scene without a scrim.
    scene.background = haze;
    scene.fog = new FogExp2(haze.getHex(), biome.pond ? pondDensity : baseDensity);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene, biome]);

  useFrame((state, dt) => {
    const cam = camera as PerspectiveCamera;

    /*
     * Under prefers-reduced-motion the camera cuts rather than flies.
     *
     * The CSS query switches off transitions and keyframes, and everything on
     * this page honours it — but the thing most likely to make a reader ill is
     * none of those, it is six acts of continuous full-frame camera movement
     * dragged by the scroll. So the picture snaps to the framing of whichever
     * beat is nearest and holds there, while the copy goes on fading on the
     * true chapter: you still read the whole story, you just read it as a
     * sequence of stills.
     */
    // The page is now just the opening shot, start to finish: the camera holds
    // it, and scrolling plays the opening backwards instead (three/clearing,
    // ui/Hero). The journey down into the plant is at git tag `with-journey`.
    sampleCamera(0, sample);
    cam.position.copy(sample.pos);

    if (!calm) {
      // A held breath, so a reader who has stopped scrolling is not looking at
      // a still frame. Scaled down hard once the camera is inches from a
      // petal, where centimetres of drift would be a lurch.
      const t = state.clock.elapsedTime;
      const near = Math.min(1, cam.position.distanceTo(sample.target) / 1.2);
      const amp = 0.006 + 0.014 * near;
      cam.position.x += Math.sin(t * 0.37) * amp;
      cam.position.y += Math.sin(t * 0.53 + 1.1) * amp * 0.7;
      cam.position.z += Math.cos(t * 0.29) * amp;
    }

    /*
     * Portrait dolly-back, on the close-ups only.
     *
     * `fov` is the *vertical* field of view, so a fixed one lets the horizontal
     * one collapse with the viewport: 61° at 1440x900 and 21° at 390x844. On
     * the shots framed on a discrete object — the bloom, the stem, the soil —
     * that runs the subject off both edges, and backing the camera off along
     * its own view vector is the honest fix. Widening the lens to compensate
     * would need about 103° vertical, which barrel-distorts every close-up on
     * the page.
     *
     * It must not happen on the wide shots. Their subject is a field, which
     * crops for free — and pulling back there costs the one thing the first act
     * is built on: the flower sits just past the bottom edge of the hero, and
     * a camera 2.3x further out sees several metres more ground and puts it
     * back in frame. No amount of re-aiming recovers that, because at that
     * distance everything within a few metres of the lens is in shot.
     */
    const aspect = size.width / Math.max(1, size.height);
    const range = cam.position.distanceTo(sample.target);
    const closeUp = 1 - clamp((range - 1.2) / 1.4);
    const pullback =
      aspect < 1.45
        ? 1 + (Math.min(1.45 / Math.max(aspect, 0.35), 2.3) - 1) * closeUp
        : 1;
    if (pullback > 1.001) {
      cam.position.sub(sample.target).multiplyScalar(pullback).add(sample.target);
      /*
       * ...and thin the air by the same factor. Backing off puts that much
       * more fog between the lens and the subject; fog density is per metre,
       * so dividing it by the same number the distance was multiplied by
       * leaves the amount of haze over the subject where it was designed.
       */
      const fog = scene.fog as FogExp2 | null;
      if (fog) fog.density = (biome.pond ? pondDensity : baseDensity) / pullback;
    } else {
      const fog = scene.fog as FogExp2 | null;
      if (fog) fog.density = biome.pond ? pondDensity : baseDensity;
    }

    cam.lookAt(sample.target);
    cam.fov = sample.fov;
    cam.near = 0.02;
    cam.far = 60;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    view.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    view.ready = true;

    // The cursor, met with a plane at canopy height. Behind the camera or
    // above the horizon there is no meeting point, and the field goes still.
    stepPointer(dt, (ndcX, ndcY) => {
      ray.set(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position);
      if (Math.abs(ray.y) < 1e-4) return null;
      const t = (CANOPY_Y - cam.position.y) / ray.y;
      if (t <= 0 || t > 60) return null;
      return {
        x: cam.position.x + ray.x * t,
        z: cam.position.z + ray.z * t,
      };
    });
  });

  return null;
}
