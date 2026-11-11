import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { LinearFilter, Matrix4, PerspectiveCamera, WebGLRenderTarget } from "three";
import { WATER_Y } from "./pond";
import { quality } from "./quality";

/**
 * The tree in the water, rendered rather than described.
 *
 * What was here before was analytic: a lid plane over the pond, a handful of
 * discs summarising where the foliage was, a few line segments for the boughs,
 * and a reflected ray traced against them. It cost no second pass and it was
 * the wrong idea. A summary can say *how much* canopy is overhead at a point —
 * which is all it was ever asked — but it cannot say what that canopy looks
 * like, so what came back was blobs in roughly the right places, and no amount
 * of tuning the blobs was going to turn them into a tree.
 *
 * A reflection in still water is a duplicate of what is above it. So this
 * renders one: the camera is mirrored through the water plane, the canopy alone
 * is drawn from there into a half-size target, and the surface samples it with
 * a small offset from its own wave slope. The distortion is then genuinely a
 * distortion of the real image, which is the thing that reads as water, instead
 * of an approximation standing in for one.
 *
 * It is affordable because of what it renders: the canopy is two draws, and
 * nothing else in the scene is on its layer. The pond is also the one biome
 * with a mirror in it, so the other three never pay for this at all.
 */

/**
 * The layer the canopy is also on.
 *
 * Layers rather than a second scene, because the tree in the water has to be
 * the tree in the frame — same geometry, same wind, same instant. A second
 * scene means a second copy of both meshes to keep in step, and the moment they
 * drift the reflection is of a tree that is not there.
 */
export const CANOPY_LAYER = 3;

/**
 * Resolution, as a share of the canvas.
 *
 * Half is plenty and is arguably generous. Every pixel of this is about to be
 * smeared by a wave slope and then mixed in at a fraction of its strength, so
 * detail spent here is detail thrown away — and the alternative reading, that a
 * reflection should be sharp because the water is calm, is answered by the fact
 * that a reflection is never sharper than the surface carrying it.
 */
const SHARE: Record<string, number> = { low: 0.34, medium: 0.5, high: 0.6 };

export interface Reflection {
  target: WebGLRenderTarget;
  /** World position to a lookup in that target, ready for the perspective divide. */
  matrix: Matrix4;
}

export function usePlanarReflection(): Reflection {
  const { gl, scene, camera, size, viewport } = useThree();
  const share = SHARE[quality()] ?? 0.5;

  const kit = useMemo(() => {
    const target = new WebGLRenderTarget(2, 2, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
    });
    /*
     * Eight bits a channel, deliberately, by leaving the type at its default.
     *
     * A half-float buffer is the obvious choice for something that is going to
     * be mixed into a lit frame, and it is the exact thing that caused this
     * project's black-frame flicker — twenty-seven black frames in six thousand,
     * off half-float buffers in the post chain. That is fixed by pinning the
     * composer to unsigned bytes, and it is not going to be reintroduced here
     * for a texture whose entire job is to be blurred and mixed at a third
     * strength.
     */

    const cam = new PerspectiveCamera();
    // Both off: three re-derives matrixWorld from position/quaternion inside
    // render() for a camera with no parent, which would throw away the mirror
    // matrix below on the frame it was set.
    cam.matrixAutoUpdate = false;
    cam.matrixWorldAutoUpdate = false;
    cam.layers.set(CANOPY_LAYER);

    // Reflection through the plane y = WATER_Y.
    const mirror = new Matrix4().set(
      1, 0, 0, 0,
      0, -1, 0, 2 * WATER_Y,
      0, 0, 1, 0,
      0, 0, 0, 1,
    );
    // Clip space (-1..1) to texture space (0..1).
    const bias = new Matrix4().set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    return { target, cam, mirror, bias, matrix: new Matrix4() };
  }, []);

  useFrame(() => {
    const w = Math.max(2, Math.round(size.width * viewport.dpr * share));
    const h = Math.max(2, Math.round(size.height * viewport.dpr * share));
    if (kit.target.width !== w || kit.target.height !== h) kit.target.setSize(w, h);

    const main = camera as PerspectiveCamera;
    kit.cam.matrixWorld.multiplyMatrices(kit.mirror, main.matrixWorld);
    kit.cam.matrixWorldInverse.copy(kit.cam.matrixWorld).invert();
    kit.cam.projectionMatrix.copy(main.projectionMatrix);
    kit.cam.projectionMatrixInverse.copy(main.projectionMatrixInverse);

    // Where a point on the water finds itself in that render.
    kit.matrix
      .copy(kit.bias)
      .multiply(kit.cam.projectionMatrix)
      .multiply(kit.cam.matrixWorldInverse);

    const was = gl.getRenderTarget();
    gl.setRenderTarget(kit.target);
    // The scene's own background is the biome's haze, so the gaps between the
    // boughs come back as the sky the water should be giving back there.
    gl.render(scene, kit.cam);
    gl.setRenderTarget(was);
  });

  return kit;
}
