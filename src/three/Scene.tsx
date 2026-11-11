import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ACESFilmicToneMapping, UnsignedByteType } from "three";
import { BIOMES } from "@/lib/biomes";
import { useBiome } from "@/ui/BiomeContext";
import { COLOR } from "@/lib/palette";
import Ant from "./Ant";
import Bank from "./Bank";
import Drift from "./Drift";
import FloatingPetals from "./FloatingPetals";
import Flower from "./Flower";
import Fronds from "./Fronds";
import Grass from "./Grass";
import Groundhog from "./Groundhog";
import Fireflies from "./Fireflies";
import { TimeGrade } from "./TimeGrade";
import Ground from "./Ground";
import Heads from "./Heads";
import Litter from "./Litter";
import Motes from "./Motes";
import Rig from "./Rig";
import Water from "./Water";
import { warmFields } from "./field";
import { CLUMPS, quality } from "./quality";

/**
 * The whole scene, fixed behind the document.
 *
 * There is one field, one plant and no sky. The background is the same haze the
 * far field dissolves into, so the frame is grass edge to edge at the top of
 * the page and dark behind the flower at the bottom of it, and there is never a
 * horizon for the near-white type to have to fight.
 *
 * Changing biome rebuilds the field and nothing else — the plant, the camera
 * and every word on the page are the same in all four. Two of them are more
 * than a recolour, and both are cheap: the pond replaces its field with a bank
 * and adds the water past it, the silt underfoot and the blossom on both; the
 * forest replaces its field outright, because a forest floor is fern and litter
 * and not grass with tan blades in it. Each of those is a handful of draws.
 */
export default function Scene() {
  const { biome } = useBiome();
  const q = quality();

  // Scatter the other three biomes' fields in idle time once the opening
  // grow-in is over, so the picker does not pay for one on the frame it is
  // used. See warmFields.
  useEffect(() => warmFields(CLUMPS[q], BIOMES), [q]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <Canvas
        dpr={[1, q === "high" ? 1.8 : 1.4]}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
          alpha: false,
          toneMapping: ACESFilmicToneMapping,
          // The palette's one hard rule is that nothing may average brighter
          // than a mid-dark green; the near-white type on top is what pays for
          // it if this drifts up.
          toneMappingExposure: 0.85,
        }}
        camera={{ fov: 40, near: 0.02, far: 60, position: [0, 0.6, 1.35] }}
      >
        <Suspense fallback={null}>
          <Rig biome={biome} />

          {/* The grass answers no light at all — it is flat-filled from the
              biome's own palette. These are here for the plant, the ant and
              the few solid props, and they are pitched to match. */}
          <directionalLight position={[-3, 5, -4]} intensity={1.7} color={COLOR.sun} />
          <hemisphereLight args={[COLOR.skyLow.getHex(), COLOR.moss.getHex(), 1.1]} />
          <ambientLight intensity={0.55} color={COLOR.grassBright} />

          {/* Keyed by biome: a new field is a new set of instances, and
              rebuilding it is exactly what changing biome means. */}
          <Ground key={`g-${biome.id}`} biome={biome} />
          {biome.pond && (
            <>
              <Water key={`w-${biome.id}`} biome={biome} />
              <Bank key={`k-${biome.id}`} biome={biome} />
              <FloatingPetals key={`fp-${biome.id}`} biome={biome} />
            </>
          )}
          {biome.fronds && (
            <>
              <Litter key={`l-${biome.id}`} biome={biome} />
              <Fronds key={`f-${biome.id}`} biome={biome} />
            </>
          )}
          {(!biome.fronds || biome.fronds.grass) && (
            <Grass key={`b-${biome.id}`} biome={biome} />
          )}
          <Heads key={`h-${biome.id}`} biome={biome} />
          <Flower biome={biome} />
          <Ant />
          {/* Pops up in the field the page ends on; not at the pond, where a
              burrow could open in the water. */}
          {!biome.pond && <Groundhog />}
          <Drift key={`d-${biome.id}`} biome={biome} />
          {/* The evening's drift, in place of the petals. */}
          <Fireflies />
          <Motes />

          {/* Eight-bit buffers between the passes, not the library's
              half-float default.

              With half-float the composer handed the compositor a completely
              black canvas for the odd single frame — three to five in every
              thousand presented, all the way through the bloom and the stem,
              which is the stretch where the reader is closest to the plant and
              a black flash is least missable. Bisected: no composer at all,
              none in two thousand frames; Bloom dropped and the vignette left,
              none; multisampling off, still there; mipmap blur off, still
              there; preserveDrawingBuffer, still there; the buffers taken down
              to eight bits, none in five thousand. It is Bloom's own
              off-screen targets in half float that the driver loses.

              Nothing is spent on it. @react-three/postprocessing forces the
              renderer to NoToneMapping for as long as it is mounted, so all
              the extra range was ever buying was Bloom's view of values above
              one — which clip at the canvas either way with no tone curve to
              fold them back in. Measured over twelve framings in two biomes,
              the difference is inside the frame-to-frame noise of the scene's
              own animation. */}
          <EffectComposer
            multisampling={q === "low" ? 0 : 4}
            enableNormalPass={false}
            frameBufferType={UnsignedByteType}
          >
            {/* First, so it reads the alpha the glowing things wrote before
                anything else touches it. See three/TimeGrade.tsx. */}
            <TimeGrade />
            <Bloom
              intensity={q === "low" ? 0.22 : 0.3}
              luminanceThreshold={0.92}
              luminanceSmoothing={0.3}
              mipmapBlur
            />
            {/* Deeper and wider than it was. The reference the meadow's
                palette comes from is a dark photograph with a bright patch in
                it, and the second half of that sentence only reads if the
                corners go to almost nothing — a pool of light in an evenly lit
                frame is a stain. It is also what pays for the glare: the same
                frame mean buys a hotter middle once the edges are given up. */}
            <Vignette offset={0.28} darkness={0.82} eskil={false} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
