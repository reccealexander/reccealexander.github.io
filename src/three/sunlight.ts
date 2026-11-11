/*
 * The one import in here, and it carries an extension so that this file can go
 * on being run straight off disk by scripts/pool-preview.mjs — which is the
 * whole reason the field is exported as TypeScript as well as GLSL.
 */
import { FLOWER } from "../lib/flowerLayout.ts";

/**
 * The pools of sun on the field.
 *
 * The reference is a photograph of meadow grass: deep olive nearly everywhere,
 * one broad soft-edged patch of light running diagonally across it, dappled at
 * two or three scales, and — the thing that actually makes it — picked out per
 * blade. Thousands of individually lit blade edges standing against darker
 * neighbours. It is not a glow laid over grass.
 *
 * So this is not a lighting model. There is no normal in it, no lamp and no
 * light direction, because the scene's one rule about colour is that it comes
 * from *where a thing is* and never from how a surface happens to be turned.
 * What lives here is a scalar field over the ground plane: given a position in
 * metres, how much of the light is standing there. Everything that reads it
 * mixes its own shadow colours toward its own lit colours by that number and
 * nothing else changes. A blade planted inside the pool is simply a different
 * colour from the blade planted a hand's width outside it, decided once, for
 * good — which is the same contract the flat fill always had.
 *
 * Per blade rather than per pixel is the whole trick. Grass.tsx evaluates this
 * at the blade's own root, so a blade is wholly in the light or wholly out of
 * it, and the boundary of the pool is a thousand blade-shaped decisions instead
 * of a soft gradient painted across the canopy. Ground.tsx evaluates it per
 * pixel, because a floor has no blades to be picked out.
 *
 * Both the GLSL and the TypeScript below are generated from the same constants,
 * so the shader and anything on the CPU that wants to know where the light is
 * cannot drift apart.
 */

/**
 * One patch of light: where it is, how it lies, and how far it keeps off the
 * plant.
 *
 * Everything is metres and radians in the ground plane. There are two of these
 * — see POOLS below — and the field is the stronger of the two at any point,
 * because two gaps in a canopy are two gaps and not a sum.
 */
type Pool = {
  x: number;
  z: number;
  /** The bearing its long axis runs on. */
  bearing: number;
  /** Half its length. */
  long: number;
  /** Half its width on the far side of that axis, and on the near side. */
  acrossFar: number;
  acrossNear: number;
  /** How much the near side narrows along the length. */
  taper: number;
  /** Where the soft edge starts and where it has finished. */
  inner: number;
  outer: number;
  /** How much of the ramp it carries at its brightest. */
  gain: number;
  /**
   * How far it stands off the plant: nothing inside `shelterIn` metres of the
   * stem, full strength past `shelterOut`. Infinity-free by construction — a
   * pool that never comes near the plant sets both to zero and the term folds
   * out. See the note on POOL_NEAR for why the near one needs it.
   */
  shelterIn: number;
  shelterOut: number;
};

const POOL_FAR: Pool = {
  /*
   * Above and left of the hero's frame centre, and that placement is
   * load-bearing rather than aesthetic.
   *
   * The wordmark, the tagline and the body copy sit dead centre in the first
   * act with no scrim under them, and near-white type over the top of this
   * ramp fails contrast outright. In the reference the bright patch is up and
   * to the left of where a title would go, which is exactly why that
   * photograph can carry one. The pool is placed to the same rule: it enters
   * at the left edge, crosses the upper third, and leaves through the top of
   * the frame a little left of centre — so what stands in the light is field,
   * and what the copy stands on is the shade beside it.
   */
  x: -2.35,
  z: -2.55,
  bearing: (-40 * Math.PI) / 180,
  long: 6.0,
  /**
   * Half its width, twice, because it is not symmetrical about its own
   * axis. It spreads on the side away from the hero's reading column and is cut
   * short on the side toward it. That is the whole of the trap this thing has
   * to get past: a pool broad enough to read as one patch of light, centred
   * where the reference's is, puts its shoulder straight under the wordmark.
   * A patch of sun with one long side and one short one is what a broken canopy
   * actually throws; a perfect ellipse is what nothing throws.
   */
  acrossFar: 3.6,
  acrossNear: 1.9,
  /**
   * ...and that near side narrows along the length as well, so the patch is a
   * comma rather than a lens: broad at the end nearest the lens, where the
   * frame's left margin is empty all the way down, and pinched at the far end,
   * where the eyebrow and the wordmark come out to meet it. Sun through a
   * broken canopy has no reason to be symmetrical about anything, and this is
   * the one degree of freedom that buys area without buying it off the copy.
   */
  taper: 0.55,
  inner: 0.5,
  outer: 1.28,
  gain: 1,
  // It is four and a half metres from the plant at its nearest. Nothing to do.
  shelterIn: 0,
  shelterOut: 0,
};

/*
 * The second one, and why it is where it is.
 *
 * Two jobs, one patch. The hero had light in its top left corner and a dead
 * bottom right one, which is half a photograph; and the last third of the
 * journey — everything from the pan down the stem to the end of the FAQ — sat
 * entirely outside the first pool and came back at a mean linear luminance of
 * 0.014 with a 95th percentile of 0.03, which is to say with no bright pixel
 * anywhere in the frame at all. Those acts took the palette's darkening and
 * none of its light.
 *
 * They are the same fix because they are the same ground. The hero's lower
 * right corner and the far background of every shot from inside the field are
 * both the couple of square metres out past the plant's right shoulder: the
 * hero looks down into it from three metres up, and the stem and soil acts look
 * out through it from a lens a hand's width off the floor. Light there is a
 * glare in the first act and a lit horizon in the last three.
 *
 * ---------------------------------------------------------------------------
 * What this is NOT is a pool on the plant. That was built, measured and taken
 * out, and the two photographed failures are the reason this one is shaped the
 * way it is:
 *
 *   - The plant does not read this field. It is one of the handful of solid
 *     props that answer the scene's actual lamps (see Scene.tsx), and nothing
 *     in here touches them. A patch of sun at the plant's foot does not light
 *     the flower; it lights the tussock that hides the flower, and the subject
 *     ends up *darker* than its surround. At chapter 1.86 the bloom sat against
 *     a wall of blazing grass and lost.
 *   - The last three acts are shot from inside that tussock, so a patch there
 *     is not a patch: it is the entire frame at full strength with the step
 *     cards and the FAQ laid over it. Chapter 4.9 came back as one flat
 *     yellow-green wall.
 *
 * Both failures are failures of the light being *underfoot*. So this one is
 * held off the plant by `shelterIn`/`shelterOut`: it is nothing at all within a
 * metre of the stem and only reaches full strength a metre and a half out. The
 * tussock stays dark, the near grass in front of every low lens stays dark, the
 * bloom keeps a dark wall behind it — and the far field those low lenses are
 * looking *through* is lit. Which is the frame that was wanted in the first
 * place: a subject standing in shade against a field with sun on it, rather
 * than a subject in a spotlight.
 *
 * That the plant grows in a hollow the light does not reach is also the field's
 * own story about itself. The grass immediately around the stem grows half
 * again as tall (`shelter` in three/field.ts) — that tussock is what hides the
 * flower from a bird's eye, and a canopy that closes over a plant is exactly a
 * canopy that keeps the sun off it.
 */
const POOL_NEAR: Pool = {
  x: 1.55,
  z: -0.1,
  /*
   * Its axis is the hero frame's own lower-right diagonal, read back into the
   * ground: the corner runs from about (1.0, 0.44) at the bottom edge out to
   * (2.1, -0.64) at the right one, and this is the line between them. Which
   * also settles the length. A patch that carried on past either end would go
   * off the bottom of the frame at one and out through the right edge halfway
   * up it at the other, and the second of those is a streak of light beside the
   * wordmark rather than a glare in a corner.
   */
  bearing: (136 * Math.PI) / 180,
  long: 1.15,
  /**
   * Broad outboard, toward the corner, where the frame runs out and there is
   * nothing to protect. Cut back inboard, which is the side the reading column
   * and the plant are both on. The same asymmetry as the first pool and the
   * same reason for it.
   */
  acrossFar: 0.85,
  acrossNear: 0.58,
  /** ...and the inboard side pinches further as the axis runs in toward them. */
  taper: 0.45,
  inner: 0.42,
  outer: 1.3,
  /*
   * Under the first pool, deliberately. The hero has one patch of sun in it and
   * a second, weaker one — a frame with two equal bright corners has no subject
   * and reads as a vignette turned inside out.
   */
  gain: 0.9,
  /*
   * The plant is already a metre and a half off the axis and two ellipse-radii
   * out, so this is not what is keeping the light off it — it is what keeps
   * *whoever widens this next* from finding out the hard way. Both of the
   * photographed failures above were a pool that reached the stem.
   */
  shelterIn: 1.02,
  shelterOut: 1.62,
};

const POOLS: readonly Pool[] = [POOL_FAR, POOL_NEAR];

/** How hard the light is broken up, and at what spacing in metres. */
const DAPPLE = {
  /** Two scales warping the pool's own edge, so it has a shape and not a rim. */
  edgeCoarse: { scale: 1.05, amount: 0.2, phase: 3.1 },
  edgeFine: { scale: 3.1, amount: 0.11, phase: -1.7 },
  /**
   * ...and two more thinning it from the inside. Both open above one, which is
   * then clamped: a mottle that only ever subtracts turns the pool's mean down
   * as fast as it gives it a texture, and what comes back is a dim patch rather
   * than a broken bright one.
   */
  bodyCoarse: { scale: 3.1, floor: 0.42, ceil: 1.26, phase: 0.4 },
  bodyFine: { scale: 8.7, floor: 0.6, ceil: 1.18, phase: -2.2 },
} as const;

/**
 * Fleckwork: what gets through the canopy where there is no gap in it.
 *
 * The pools above are gaps. They are the right model for a bird's eye, where a
 * patch of sun several metres across is a shape you can see the whole of — and
 * they are the wrong model, on their own, for the last third of the journey.
 * From a lens a hand's width off the soil there is no far field: the frame is
 * near blades edge to edge, everything past a metre is behind them, and a pool
 * placed four metres out lights nothing that is in shot. Measured, those acts
 * came back at a 95th percentile of 0.03 — a frame with no bright pixel in it
 * anywhere.
 *
 * The answer is not to put a pool on the plant. That was built and it failed
 * twice over, for the reasons at POOL_NEAR. What the reference photograph
 * actually has in its shaded three quarters is not a pool and not an even lift:
 * it is flecks. A canopy that is not broken open still leaks, in patches a hand
 * across, and what a patch that size lands on is one blade and not its
 * neighbour. That is range without a lift — a lit blade crossing a dark one is
 * depth, and a whole frame brought up a stop is a wall.
 *
 * So this is deliberately coarse in space and low in duty: about a third of the
 * ground, at well under a pool's strength, and it is Grass.tsx that turns it
 * into a per-blade decision (a third of the blades standing in a fleck take it
 * and the rest do not). Ground.tsx does not read it at all — a floor has no
 * blades to pick out, and light broken this small painted onto one is a rash.
 */
const FLECK = {
  /** Two scales, so the flecks are not a lattice. Metres, as frequencies. */
  coarse: { scale: 4.7, phase: 2.4 },
  fine: { scale: 11.9, phase: -0.85 },
  /** How far the two together have to get before any light lands, and how sharply. */
  level: 0.52,
  soft: 0.14,
  /**
   * How much of the ramp a fleck carries.
   *
   * Under a pool's, because it is under a canopy rather than through a hole in
   * one. It has to be enough that a blade taking it is unambiguously *lit* —
   * the whole point is a bright blade against dark ones, and half a stop is a
   * grey blade against dark ones, which reads as dirt on the lens.
   */
  gain: 0.46,
} as const;

/** How much fleckwork is landing at a point on the ground, 0..gain. */
export function sunFleckwork(x: number, z: number): number {
  const a =
    0.5 +
    0.5 *
      sunFleck(x * FLECK.coarse.scale + FLECK.coarse.phase, z * FLECK.coarse.scale + FLECK.coarse.phase);
  const b =
    0.5 +
    0.5 * sunFleck(x * FLECK.fine.scale + FLECK.fine.phase, z * FLECK.fine.scale + FLECK.fine.phase);
  return FLECK.gain * smoothstep(FLECK.level, FLECK.level + FLECK.soft, a * 0.62 + b * 0.38);
}

/**
 * Cast shade: where the dark blades are, as opposed to which blades are dark.
 *
 * The field used to decide this per blade, off nothing but a roll of the dice.
 * That gives a frame with the right *amount* of black in it and the wrong
 * *arrangement* — a dark blade beside a light one beside a dark one is not a
 * shadow, it is noise, and the eye reads it as dirt rather than as shade. Real
 * shade lands on a patch of ground and everything rooted in that patch is under
 * it.
 *
 * So this is the pools' opposite number, and deliberately built to the same
 * plan: one world-space scalar read at a blade's root, so neighbours agree
 * because they are neighbours. Two differences, both of them the user's
 * instruction:
 *
 *  - Smaller. The pools run six metres on their long axis; a shade cluster here
 *    is between one and three across, which is the scale of a single bough's
 *    worth of shadow rather than a gap in the whole canopy.
 *  - More often. `level` is pitched below the fleckwork's, so a good third of
 *    the ground is under some depth of it where the pools take about a sixth.
 *
 * It is not the absence of the pool and must not be built as one. Shade falling
 * *inside* a bright patch is the most valuable thing here — a dark cluster with
 * lit grass around it is what a meadow in sun actually looks like, and it is
 * the only thing in the scene that makes the bright parts read as bright rather
 * than as a brighter green.
 *
 * CPU only, on purpose. A blade's shade is baked into its instance attribute at
 * plant time — it is a fact about where the plant grew, not about the frame —
 * so unlike `sunPool` this never needs a GLSL twin.
 */
const SHADE = {
  /** Two scales, as metres of feature. The fine one keeps the coarse one from
      reading as a lattice, exactly as it does for the dapple above. */
  coarse: { scale: 2.35, phase: -4.2 },
  fine: { scale: 5.9, phase: 1.15 },
  /** Where shade begins, and how soft its boundary is. */
  level: 0.44,
  soft: 0.2,
} as const;

/** How deep in cast shade a point on the ground is, 0..1. */
export function shadeCluster(x: number, z: number): number {
  const a =
    0.5 +
    0.5 *
      sunFleck(
        x * SHADE.coarse.scale + SHADE.coarse.phase,
        z * SHADE.coarse.scale + SHADE.coarse.phase,
      );
  const b =
    0.5 +
    0.5 * sunFleck(x * SHADE.fine.scale + SHADE.fine.phase, z * SHADE.fine.scale + SHADE.fine.phase);
  return smoothstep(SHADE.level, SHADE.level + SHADE.soft, a * 0.68 + b * 0.32);
}

/**
 * The lit end of the ramp, which is the same three stops in the photograph:
 * the body of the lit grass, the blade faces turned into it, and the handful of
 * tips that are nearly white. The shaded end of the ramp is the biome's own
 * (`deep`, `bright`), because that is what the field is when the light is not
 * on it, and that has always belonged in lib/biomes.
 */
export const SUN_RAMP = {
  /** Lit grass — the body of the pool. */
  warm: "#a4cd2e",
  /** A blade face standing square into it. */
  face: "#c8dc60",
  /** The hottest tips. Used on a few pixels in a thousand, and no more. */
  hot: "#eef2c4",
} as const;
/*
 * These are pitched a stop over the photograph's own #6f8f22 / #a9bf46 /
 * #dce39a on purpose. The pool sits four and a half metres out, the field runs
 * an exponential-squared fog at 0.16 per metre, and the light has therefore
 * already given up two fifths of itself to the haze by the time it reaches the
 * lens. Authored at the photograph's numbers it measured #4b6218 on screen,
 * which is the reference's *transition* stop and not its lit one.
 */

/**
 * How much of the pool each biome takes.
 *
 * One, for the meadow the photograph is of. Zero everywhere else, which makes
 * every term below fold out of those three biomes exactly — the forest, the
 * superbloom and the pond are untouched by any of this.
 */
export const SUN_STRENGTH: Record<string, number> = {
  meadow: 1,
  /*
   * The superbloom takes most of it.
   *
   * It is the same kind of place as the meadow — open ground under an open sky
   * — so the same broken light belongs on it, and a field of heads with no
   * light and no shade across it reads as a printed pattern however many
   * colours are in it. Held under one because the heads are already the
   * brightest thing in that biome and the pool multiplies what is under it.
   *
   * Everything follows from this single number: the pools, the fleckwork in the
   * low acts, and the clustered shade at plant time, which is gated on the same
   * strength in field.ts.
   */
  flowers: 0.85,
  /*
   * And a smaller share for the forest.
   *
   * Zero was the wrong number and defensible reasoning: the pools are measured
   * off a photograph of open meadow, and a deciduous floor is not that. But the
   * conclusion — no broken light at all — gave the one biome in the set with an
   * actual canopy over it the one floor in the set lit evenly from edge to edge,
   * which is the opposite of what a canopy does. Light on a forest floor is
   * *nothing but* breaks.
   *
   * Held to half the meadow's, and it is doing a different job at that strength.
   * On the meadow the pool is the subject — a broad patch of sun you can see the
   * shape of. Here it is closer to a gap in the leaves: enough to tell the ferns
   * standing in it from the ferns beside them, not enough to read as a spotlight
   * on a forest floor, which would be a brighter mistake than the flat one.
   */
  forest: 0.5,
  pond: 0,
};

// ---------------------------------------------------------------------------
// The field itself
// ---------------------------------------------------------------------------

const AXIS = POOLS.map((p) => ({ dx: Math.cos(p.bearing), dz: Math.sin(p.bearing) }));

const f = (n: number) => n.toFixed(5);

/**
 * Dapple, as a product of two swung sines.
 *
 * Deliberately trigonometric rather than a hash: a `fract(sin(...) * 43758.0)`
 * value noise does not survive the trip from a GPU's mediump to a CPU's
 * doubles, and this has to give the same answer in both. The domain of each
 * sine is bent by the other, which is what stops the product reading as a grid
 * — two plain sines multiplied are a chequerboard at any scale you can see two
 * periods of.
 */
export function sunFleck(x: number, z: number): number {
  return (
    Math.sin(x + Math.sin(z * 1.37) * 1.7) * Math.sin(z * 0.93 - Math.sin(x * 1.13) * 1.3)
  );
}

/** One patch's own contribution at a point, before the dapple in its body. */
function poolEdge(p: Pool, i: number, x: number, z: number): number {
  const { dx, dz } = AXIS[i];
  const qx = x - p.x;
  const qz = z - p.z;
  const along = (qx * dx + qz * dz) / p.long;
  const side = qx * -dz + qz * dx;
  // The taper is floored rather than allowed to run through zero. Past the end
  // of the pool it would change sign and put a stray lobe out on the axis —
  // unreachable at these numbers, because `along` alone has already carried the
  // radius past the outer edge by then, but a term that only works because of
  // another term's value is a trap for whoever widens this next.
  const across =
    side / (side > 0 ? p.acrossNear * Math.max(0.25, 1 - p.taper * along) : p.acrossFar);

  let r = Math.hypot(along, across);
  r +=
    DAPPLE.edgeCoarse.amount *
      sunFleck(
        x * DAPPLE.edgeCoarse.scale + DAPPLE.edgeCoarse.phase,
        z * DAPPLE.edgeCoarse.scale + DAPPLE.edgeCoarse.phase,
      ) +
    DAPPLE.edgeFine.amount *
      sunFleck(
        x * DAPPLE.edgeFine.scale + DAPPLE.edgeFine.phase,
        z * DAPPLE.edgeFine.scale + DAPPLE.edgeFine.phase,
      );

  let pool = p.gain * (1 - smoothstep(p.inner, p.outer, r));
  if (p.shelterOut > 0) {
    pool *= smoothstep(p.shelterIn, p.shelterOut, Math.hypot(x - FLOWER.x, z - FLOWER.z));
  }
  return pool;
}

/** How much of the light is standing at a point on the ground, 0..1. */
export function sunPool(x: number, z: number): number {
  // The stronger of the two, not their sum. Two gaps in a canopy are two gaps:
  // adding them would put a seam of over-bright ground wherever their skirts
  // crossed, which is a thing no broken canopy has ever thrown.
  let pool = 0;
  for (let i = 0; i < POOLS.length; i++) {
    pool = Math.max(pool, poolEdge(POOLS[i], i, x, z));
  }

  // The dapple in the body is the same field for both, because it is the canopy
  // over them and not a property of either patch.
  pool *= lerp(
    DAPPLE.bodyCoarse.floor,
    DAPPLE.bodyCoarse.ceil,
    0.5 +
      0.5 *
        sunFleck(
          x * DAPPLE.bodyCoarse.scale + DAPPLE.bodyCoarse.phase,
          z * DAPPLE.bodyCoarse.scale + DAPPLE.bodyCoarse.phase,
        ),
  );
  pool *= lerp(
    DAPPLE.bodyFine.floor,
    DAPPLE.bodyFine.ceil,
    0.5 +
      0.5 *
        sunFleck(
          x * DAPPLE.bodyFine.scale + DAPPLE.bodyFine.phase,
          z * DAPPLE.bodyFine.scale + DAPPLE.bodyFine.phase,
        ),
  );

  return Math.min(1, Math.max(0, pool));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The same thing in GLSL, built from the same numbers.
 *
 * Exports `sunFleck(vec2)` and `sunPool(vec2)`. Include it once per shader that
 * wants either; both are pure functions of a position in metres and read no
 * uniforms, which is what lets a blade decide in the vertex stage and a floor
 * decide in the fragment stage from identical code.
 */
export const SUNLIGHT_GLSL = /* glsl */ `
float sunFleck(vec2 p) {
  return sin(p.x + sin(p.y * 1.37) * 1.7) * sin(p.y * 0.93 - sin(p.x * 1.13) * 1.3);
}

/**
 * One patch, given as the numbers its TypeScript twin carries:
 *   c      centre
 *   d      the unit vector its long axis runs on
 *   size   half-length, half-width outboard, half-width inboard
 *   shape  taper on the inboard side, inner edge, outer edge
 *   gain   how much of the ramp it carries at its brightest
 *   keep   the radii it stands off the plant between (zero, zero: no shelter)
 */
float sunPatch(vec2 w, vec2 c, vec2 d, vec3 size, vec3 shape, float gain, vec2 keep) {
  vec2 q = w - c;
  float side = dot(q, vec2(-d.y, d.x));
  float along = dot(q, d) / size.x;
  vec2 e = vec2(along, side / (side > 0.0
    ? size.z * max(0.25, 1.0 - shape.x * along)
    : size.y));

  float r = length(e)
    + ${f(DAPPLE.edgeCoarse.amount)} * sunFleck(w * ${f(DAPPLE.edgeCoarse.scale)} + ${f(DAPPLE.edgeCoarse.phase)})
    + ${f(DAPPLE.edgeFine.amount)} * sunFleck(w * ${f(DAPPLE.edgeFine.scale)} + ${f(DAPPLE.edgeFine.phase)});

  float pool = gain * (1.0 - smoothstep(shape.y, shape.z, r));
  if (keep.y > 0.0) {
    pool *= smoothstep(keep.x, keep.y,
      distance(w, vec2(${f(FLOWER.x)}, ${f(FLOWER.z)})));
  }
  return pool;
}

/** What leaks through an unbroken canopy — see the TypeScript above. */
float sunFleckwork(vec2 w) {
  float a = 0.5 + 0.5 * sunFleck(w * ${f(FLECK.coarse.scale)} + ${f(FLECK.coarse.phase)});
  float b = 0.5 + 0.5 * sunFleck(w * ${f(FLECK.fine.scale)} + ${f(FLECK.fine.phase)});
  return ${f(FLECK.gain)} * smoothstep(${f(FLECK.level)}, ${f(FLECK.level + FLECK.soft)},
    a * 0.62 + b * 0.38);
}

float sunPool(vec2 w) {
  // The stronger of the two, not their sum — see the TypeScript above.
  float pool = 0.0;
${POOLS.map(
  (p, i) => `  pool = max(pool, sunPatch(w,
    vec2(${f(p.x)}, ${f(p.z)}), vec2(${f(AXIS[i].dx)}, ${f(AXIS[i].dz)}),
    vec3(${f(p.long)}, ${f(p.acrossFar)}, ${f(p.acrossNear)}),
    vec3(${f(p.taper)}, ${f(p.inner)}, ${f(p.outer)}),
    ${f(p.gain)}, vec2(${f(p.shelterIn)}, ${f(p.shelterOut)})));`,
).join("\n")}

  pool *= mix(${f(DAPPLE.bodyCoarse.floor)}, ${f(DAPPLE.bodyCoarse.ceil)},
    0.5 + 0.5 * sunFleck(w * ${f(DAPPLE.bodyCoarse.scale)} + ${f(DAPPLE.bodyCoarse.phase)}));
  pool *= mix(${f(DAPPLE.bodyFine.floor)}, ${f(DAPPLE.bodyFine.ceil)},
    0.5 + 0.5 * sunFleck(w * ${f(DAPPLE.bodyFine.scale)} + ${f(DAPPLE.bodyFine.phase)}));

  return clamp(pool, 0.0, 1.0);
}
`;
