import { UniformsLib, UniformsUtils, type IUniform } from "three";

/**
 * Fog uniforms, merged into a custom material's own.
 *
 * A ShaderMaterial with `fog: true` gets three's fog *defines* and chunks for
 * free, but not its uniforms — the renderer then writes straight into
 * `uniforms.fogColor.value` on every frame and takes the page down with it.
 * Anything that includes the fog chunks has to come through here.
 */
export function withFog<T extends Record<string, IUniform>>(own: T) {
  return { ...UniformsUtils.clone(UniformsLib.fog), ...own };
}
