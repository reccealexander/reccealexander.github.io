import type { Biome } from "@/lib/biomes";
import { makeRandom } from "@/lib/math";
import { moundHeight, SOIL } from "./soil";
import { FLOWER } from "@/lib/journey";
import { layAngle, partingAt, sightCeiling } from "./parting";
import { BANK, bankEdgeZ, SHORE } from "./pond";
import { shadeCluster, sunPool, SUN_STRENGTH } from "./sunlight";
import { settled } from "./growth";

/**
 * The eight directions a clump's blades can lean, as unit offsets.
 *
 * Grass fans rather than growing straight up, so which way a given blade goes
 * is not known at plant time — the clump has to be asked whether *any* of its
 * reach lands in the camera's corridor. Eight is enough at this scale: the gap
 * between neighbouring probes at a blade's reach is under a centimetre.
 */
const REACH_PROBES: readonly (readonly [number, number])[] = Array.from(
  { length: 8 },
  (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)] as const;
  },
);

/**
 * Where the field is planted.
 *
 * Grass grows in clumps, not as single blades — three or four blades out of one
 * root, fanned. That is the DOM site's silhouette and it is most of why its
 * field reads as drawn rather than as simulated: a lone blade is a line, and a
 * fan is a shape.
 *
 * Density falls off with distance from the camera's dwell, because the frame is
 * mostly the first three metres and a uniform field spends its whole budget on
 * ground you never look at.
 */

export type Blade = {
  x: number;
  /**
   * Root height.
   *
   * The soil is modelled now and heaps around the stem, so a field rooted flat
   * at zero has its near blades cut off by ground that has risen past them —
   * which at the one act about what the plant is standing in reads as the
   * grass not meeting the soil at all.
   */
  y: number;
  z: number;
  /** Metres, root to tip. */
  height: number;
  halfWidth: number;
  /** Which way the blade faces, and how far it leans off vertical. */
  facing: number;
  lean: number;
  /** Sideways arc along its own length, signed. */
  curve: number;
  phase: number;
  /** 0..1 into the body ramp, and which of the two tip colours it takes. */
  tone: number;
  litB: number;
  rare: number;
  /**
   * How much of the field's own shade this blade is standing in, 1 down to
   * almost nothing.
   *
   * `tone` says which stop of the biome's ramp a blade was planted at, and the
   * bottom of that ramp is still a colour you can see. This is the other thing
   * a canopy does to itself: most of a meadow is lit through by something, and
   * a few blades in every handful are behind three others and get nothing at
   * all. Without it the darkest thing in the frame is `deep`, the histogram has
   * a hard floor a long way above black, and the field reads as evenly dim
   * rather than as a dark photograph — which is what the reference is.
   *
   * Rolled per blade and not per clump, because that is the whole of the
   * effect: a near-black blade crossing a lit one is what the eye reads as
   * depth, and a whole clump going dark together is just a dark clump.
   */
  shade: number;
  /**
   * How far this blade lays over when the camera comes down through it, and
   * which way — radians about its own root, and a bearing on the ground.
   *
   * Zero everywhere the camera never gets close enough to be in the way of,
   * which is all but a few hundred of them. See three/parting.ts: the angle is
   * decided here because it is a fact about where the blade is standing, and
   * applied in the shader because *when* is a fact about the chapter.
   */
  lay: number;
  bearing: number;
};

export type Head = {
  x: number;
  z: number;
  height: number;
  radius: number;
  tone: number;
  phase: number;
};

/** The patch of ground the hero and the closing shot actually see. */
/**
 * The field covers the ground the camera can actually reach, and no more.
 *
 * Density is uniform across it. It used to be concentrated near a focus point,
 * which is cheaper per convincing square metre but visibly wrong the moment the
 * camera travels: the grass thinned out as you moved away from wherever the
 * focus happened to be, and a meadow that is patchier over there than it is
 * here is not a meadow.
 */
const FIELD_RADIUS = 9;
const FOCUS_Z = -1.5;


/** The soil surface, where anything standing in it has to start. */
function rootHeight(x: number, z: number): number {
  return SOIL.bed + moundHeight(x - FLOWER.x, z - FLOWER.z);
}

/**
 * How deep in the canopy's own shade one blade stands — see `Blade.shade`.
 *
 * Most of the field takes none of this and the rest takes it hard. A shade
 * applied evenly is an exposure change, which is the one thing that must not
 * happen here: the frame mean is what the hero's near-white type sits on, and
 * every stop taken off it is taken off the whole page. Skewed like this, nine
 * blades in a hundred come out under half and two or three of those under a
 * quarter — enough for a frame to have real black in it — while the mean falls
 * by only a tenth, which the lit end pays back.
 */
const SHADE_SHARE = 0.62;
const SHADE_DEPTH = 0.86;

/*
 * ...which is the right amount of black and the wrong arrangement of it, and
 * the two are not the same problem. A roll per blade puts a dark one beside a
 * light one beside a dark one, and what that reads as at any distance is noise
 * on the canopy — the eye will accept a shadow anywhere you care to put one,
 * but only if the blades under it agree with each other.
 *
 * So where there is a sun to cast it, the roll is biased by `shadeCluster` read
 * at the blade's own root: inside a patch most blades take shade and take it
 * hard, outside one a handful still do and take it lightly. The stragglers
 * matter — a patch whose every blade is dark and whose surroundings are all
 * lit has a rim, and nothing outdoors has a rim.
 *
 * Biomes with no sun keep the old even roll untouched, which is what holds the
 * forest, the pond and the superbloom exactly where they were.
 */
const SHADE_OPEN = { share: 0.93, depth: 0.55 };
const SHADE_DEEP = { share: 0.3, depth: 0.92 };

function shadeRoll(r: number): number {
  if (r < SHADE_SHARE) return 1;
  return 1 - SHADE_DEPTH * Math.pow((r - SHADE_SHARE) / (1 - SHADE_SHARE), 1.4);
}

/**
 * The same roll, clustered — see above. `extra` deepens a whole storey's
 * membership of whatever patch it is standing in, which is how the understory
 * stays the darkest thing in the field without going back to being random.
 */
function shadeAt(r: number, x: number, z: number, extra = 0): number {
  const s = Math.min(1, shadeCluster(x, z) + extra);
  const share = SHADE_OPEN.share + (SHADE_DEEP.share - SHADE_OPEN.share) * s;
  const depth = SHADE_OPEN.depth + (SHADE_DEEP.depth - SHADE_OPEN.depth) * s;
  if (r < share) return 1;
  return 1 - depth * Math.pow((r - share) / (1 - share), 1.4);
}

/**
 * Every field this session has scattered, keyed by what decides it.
 *
 * Switching biome unmounts and remounts the whole field — that is what a biome
 * change *is* — and the scatter underneath is a few tens of thousands of clumps
 * built on the main thread. Measured: 790 ms of blocking on the superbloom, 787
 * on the pond, 457 on the meadow. It runs twice per switch as well, since the
 * grass and the heads both ask for the same field and each was building its
 * own copy of it.
 *
 * The scatter is a pure function of (clumps, biome, seed) — `makeRandom` is
 * seeded, so the same three arguments give byte-identical output every time —
 * which makes it safe to keep. Two consequences: the second component to ask
 * for a field gets the first one's, halving every switch; and going back to a
 * biome you have already seen costs nothing at all, which is the case that
 * actually matters, because the picker invites exactly that.
 *
 * Held for the life of the page. Four biomes at two quality levels is eight
 * entries, and they are the arrays the scene is already holding anyway.
 */
type Field = { blades: Blade[]; heads: Head[] };
const FIELDS = new Map<string, Field>();
const fieldKey = (clumps: number, biome: Biome, seed: number) => `${clumps}|${biome.id}|${seed}`;
const SEED = 20260806;

/**
 * Build the fields the reader has not asked for yet, while nothing is happening.
 *
 * The cache above makes a *second* visit to a biome free; this makes the first
 * one free too. It costs a few hundred milliseconds of work that would
 * otherwise land the moment somebody uses the picker.
 *
 * Two things keep that work from ever being seen:
 *
 *  - It does not start until the opening grow-in has finished. "Idle" to the
 *    browser includes the gap after every animation frame, and a whole biome
 *    scattered in one of those gaps was a 300 ms stall landing a quarter of the
 *    way into the field coming up — the first half second of the grow-in was
 *    drawn in three frames.
 *  - It is sliced. A biome is 450–790 ms of loop, and one idle callback is
 *    allowed 50 ms at most, so the scatter runs as a generator and gives the
 *    thread back every few hundred clumps whenever the idle deadline runs low.
 *
 * On a browser without `requestIdleCallback` the warm-up simply does not happen
 * and the picker behaves as it did before. Returns a cancel, for the effect.
 */
export function warmFields(clumps: number, biomes: readonly Biome[]): () => void {
  const idle = (
    globalThis as {
      requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void) => number;
    }
  ).requestIdleCallback;
  if (!idle) return () => {};

  const queue = [...biomes];
  let job: { key: string; steps: Generator<void, Field> } | null = null;
  let cancelled = false;
  let timer = 0;

  const work = (deadline: { timeRemaining(): number }) => {
    if (cancelled) return;
    if (!settled()) {
      timer = window.setTimeout(() => idle(work), 400);
      return;
    }
    // Leave headroom: a slice is a few milliseconds and must finish inside the
    // gap, not run on into the next frame.
    while (deadline.timeRemaining() > 6) {
      if (!job) {
        const biome = queue.shift();
        if (!biome) return;
        const key = fieldKey(clumps, biome, SEED);
        if (FIELDS.has(key)) continue;
        job = { key, steps: scatterSteps(clumps, biome, SEED) };
      }
      const step = job.steps.next();
      if (step.done) {
        // The scene may have asked for this one outright in the meantime; the
        // copy it is already holding wins, identical as the two are.
        if (!FIELDS.has(job.key)) FIELDS.set(job.key, step.value);
        job = null;
      }
    }
    idle(work);
  };
  idle(work);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

export function plantField(clumps: number, biome: Biome, seed = SEED) {
  const key = fieldKey(clumps, biome, seed);
  const hit = FIELDS.get(key);
  if (hit) return hit;
  const built = scatterField(clumps, biome, seed);
  FIELDS.set(key, built);
  return built;
}

/** The scatter all at once, for the field that is about to be drawn. */
function scatterField(clumps: number, biome: Biome, seed: number): Field {
  const steps = scatterSteps(clumps, biome, seed);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Clumps between the points where a warm-up can hand the thread back. */
const SLICE = 256;

/**
 * The scatter itself, as a generator that pauses every `SLICE` clumps. Run to
 * the end in one go it is exactly the old loop; the pauses are only taken up by
 * the idle-time warm-up.
 */
function* scatterSteps(clumps: number, biome: Biome, seed: number): Generator<void, Field> {
  const rnd = makeRandom(seed);
  const blades: Blade[] = [];
  const heads: Head[] = [];
  const grassScale = biome.heads?.grassScale ?? 1;

  // Clustered where there is a sun to cast the shadow, even everywhere else.
  const cast = (SUN_STRENGTH[biome.id] ?? 0) > 0;
  const shadeFor = (r: number, x: number, z: number, extra = 0) =>
    cast ? shadeAt(r, x, z, extra) : shadeRoll(Math.min(1, r * (1 + extra * 2.5)));

  /*
   * A pond has no field, only a bank.
   *
   * The water starts a half metre past the plant, so what would be a disc of
   * meadow becomes a strip along the near edge of it. It is planted at its own
   * density rather than at the meadow's: the strip is an eighth of the disc's
   * area, and every clump in it is somewhere the camera can get to, so the
   * count comes down while the density goes up.
   */
  const bank = biome.pond ? BANK : null;
  const n = bank ? Math.round(clumps * bank.clumpShare) : clumps;

  for (let c = 0; c < n; c++) {
    if (c > 0 && c % SLICE === 0) yield;
    let x: number;
    let z: number;
    if (bank) {
      x = (rnd() * 2 - 1) * bank.halfWidth;
      z = bankEdgeZ(x) + rnd() * bank.depth;
    } else {
      // sqrt, not a power below one: it is the only exponent that gives equal
      // clumps per square metre rather than per unit of radius.
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * FIELD_RADIUS;
      x = Math.cos(a) * r;
      z = FOCUS_Z + Math.sin(a) * r;
    }

    const fromFlower = Math.hypot(x - FLOWER.x, z - FLOWER.z);
    // The plant gets a clearing, or it grows out of a hedge.
    if (fromFlower < FLOWER.clearing) continue;

    // What the camera wants of this patch of soil once it is down among the
    // plants: a ceiling to get under, and the way out from under it. Null
    // everywhere it never comes close enough to want anything, which is all but
    // a few hundred clumps.
    //
    // Nothing is cut here any more. The grass grows to its own height and lays
    // over for the chapters that need the sight line, which is the whole of the
    // difference between a meadow with a path trodden through it and a meadow
    // with a bald stripe beside the flower in every frame.
    /*
     * Asked along the blade's own reach, not only under its root — the same
     * question the ferns ask a few hundred lines down, and for the same reason.
     *
     * A clump here stands 42 cm and fans as it goes up, so its tips finish a
     * good handspan from the root it grew on. Ask the corridor only where the
     * root is and a clump planted just outside it is never told to move, while
     * its blades lean straight across the sight line — which is exactly how
     * grass kept ending up in front of the leaf whose label was being read.
     * Sampling the reach as well is what lets the plant keep its grass: the
     * clearing can go back to nothing, because the blades that are actually in
     * the way are now the ones that lay over.
     */
    /*
     * One ring, at a third of the clump's height — about where a standing
     * clump's tips finish.
     *
     * A second ring further out was tried, on the reasoning that a blade which
     * has gone right over reaches most of its own length. It costs more than it
     * buys: every clump it catches is one more laid flat, and flat grass covers
     * far less ground than standing grass, so the frames nearest the soil went
     * from field to bare dirt with clippings strewn over it. The blade it was
     * meant to catch was not caught either.
     */
    const fan = biome.blade.height * 0.34;
    let part = partingAt(x, z);
    for (const [ox, oz] of REACH_PROBES) {
      const at = partingAt(x + ox * fan, z + oz * fan);
      if (at && (!part || at.ceiling < part.ceiling)) part = at;
    }

    /*
     * The shoreline.
     *
     * The last hand's width before the water is saturated silt, and almost
     * nothing holds in it: what is left is a broken fringe of sedge with wet
     * mud showing between, which is what the trodden edge of a pond looks
     * like and is also the only reason a camera standing on this bank can see
     * any water at all. The fringe used to grow *taller* here, on the
     * reasoning that it gave the waterline an edge rather than a cut; from a
     * bird's eye it does, and from the four chapters spent under half a metre
     * off the ground it is a wall with a pond somewhere behind it.
     */
    const ashore = bank ? Math.min(1, Math.max(0, (z - bankEdgeZ(x)) / SHORE)) : 1;
    if (ashore < 1 && rnd() > 0.2 + 0.8 * ashore) continue;
    // Bar the odd sedge spike, which is the thing that actually has its feet
    // in the water and is the only reason the edge is not a shaved line.
    const shore = ashore < 1 && rnd() < 0.22 ? 1.1 : 0.4 + 0.6 * ashore;

    /*
     * A tussock around the plant.
     *
     * Standing shorter than the canopy is not on its own enough to hide it:
     * from a bird's eye you are looking down *into* the field, so a flower
     * only a few centimetres under the canopy line is still visible through
     * the gaps. The grass immediately around it grows half again as tall,
     * which both screens it from directly above and reads as the reason a
     * plant that small survived here at all.
     */
    const nest = Math.max(0, 1 - fromFlower / 0.95);
    const shelter = 1 + 0.55 * nest * nest;


    // Height and tone still vary across the field, but as noise rather than as
    // a function of distance from a focus — the DOM site's near/far ramp was a
    // depth cue for a fixed 2D camera, and repeating it in 3D would make the
    // field visibly change as the camera moved through it.
    const near = 0.35 + 0.65 * rnd();
    const h =
      biome.blade.height *
      (0.72 + 0.3 * near) *
      (1 + (rnd() * 2 - 1) * 0.16) *
      shelter *
      shore *
      grassScale;

    // Which way the whole clump goes over, if it goes over at all. One bearing
    // for the clump rather than one per blade: a fan is a shape, and a fan
    // whose blades each chose their own side of the corridor is five blades.
    const bearing = part ? Math.atan2(part.dirZ, part.dirX) : 0;

    const facing = rnd() * Math.PI * 2;
    // Bearing from this clump toward the plant, for the ones nesting it.
    const towardFlower = Math.atan2(FLOWER.x - x, FLOWER.z - z) + Math.PI / 2;
    // The full ramp, not the top of it. A clump biased at the bright end
    // makes a field with no dark in it, and the type on top has nothing to
    // sit against.
    const tone = 0.12 + 0.62 * near + (rnd() * 2 - 1) * 0.22;
    // Four to six blades a clump rather than three to four. Seen from above —
    // which is where the hero camera now is — a sparse fan leaves soil showing
    // between clumps, and bare ground is the one thing a meadow never has.
    const n = 4 + ((rnd() * 3) | 0);

    for (let k = 0; k < n; k++) {
      // -1..1 across the fan, so the outer blades of a clump splay hardest.
      const u = n > 1 ? (k / (n - 1)) * 2 - 1 : 0;
      const bx = x + u * h * 0.075;
      const bz = z + (rnd() * 2 - 1) * h * 0.08;
      const by = rootHeight(bx, bz);
      const height = h * (0.78 + rnd() * 0.3);
      const halfWidth = (h / biome.blade.slenderness) * (0.5 + rnd() * 0.28);
      // Inside the tussock the blades also arch inward over the plant, so it
      // is roofed as well as walled. Leaning them is what closes the last of
      // the gaps you can otherwise still see straight down through.
      const bFacing = nest > 0.05 ? towardFlower + u * 0.4 : facing + u * 0.5;
      const lean = u * biome.blade.fan + (rnd() * 2 - 1) * 0.08 - nest * 0.3;
      const curve = (u === 0 ? rnd() * 2 - 1 : u) * biome.blade.curve;
      blades.push({
        x: bx,
        y: by,
        z: bz,
        height,
        halfWidth,
        facing: bFacing,
        lean,
        curve,
        phase: rnd() * Math.PI * 2,
        tone: Math.max(0.05, Math.min(0.95, tone + Math.abs(u) * 0.06)),
        litB: rnd() < 0.45 ? 0 : 1,
        rare: rnd() < 0.08 ? 1 : 0,
        shade: shadeFor(rnd(), bx, bz),
        lay: part
          ? layAngle(
              height,
              lean,
              curve,
              bFacing,
              part.dirX,
              part.dirZ,
              // The blade is a ribbon rather than a line, so its own width
              // comes off the room it is being asked to fit into.
              part.ceiling - by - halfWidth,
            )
          : 0,
        bearing,
      });
    }

    // A second, shorter storey under the fan.
    //
    // The canopy alone leaves soil showing between clumps, and from a bird's
    // eye that is the one thing that stops a field reading as a field. These
    // are half height and laid over hard, so they cost almost nothing on
    // screen and close the gaps the tall blades leave. The DOM site does the
    // same job with six hundred understory silhouettes rasterised into its
    // ground; this is that layer, standing up.
    // Four to seven, not two to four. From a bird's eye you are looking down
    // *into* the canopy, and the tall fan alone leaves soil showing between
    // clumps at the bottom of the frame where the ground is nearest and the
    // gaps are widest. Bare ground is the one thing a meadow never has.
    const under = 4 + ((rnd() * 4) | 0) + (nest > 0.25 ? 4 : 0);
    for (let k = 0; k < under; k++) {
      const a2 = rnd() * Math.PI * 2;
      const d2 = Math.pow(rnd(), 0.6) * h * 0.5;
      const ux = x + Math.cos(a2) * d2;
      const uz = z + Math.sin(a2) * d2;
      const uy = rootHeight(ux, uz);
      const height = h * (0.24 + rnd() * 0.3);
      const halfWidth = (h / biome.blade.slenderness) * (0.42 + rnd() * 0.3);
      const uFacing = rnd() * Math.PI * 2;
      const lean = (rnd() * 2 - 1) * (biome.blade.fan + 0.45);
      const curve = (rnd() * 2 - 1) * biome.blade.curve * 1.4;
      blades.push({
        x: ux,
        y: uy,
        z: uz,
        height,
        halfWidth,
        facing: uFacing,
        lean,
        curve,
        phase: rnd() * Math.PI * 2,
        // Darker: this storey is in the shade of the one above it — and there
        // is a fifth more of that canopy over it than there used to be, which
        // is both why this came down from 0.55 and what pays for the extra:
        // the hero's frame mean has to come back to where it was, and a field
        // that got denser without getting darker underneath does not do that.
        tone: Math.max(0.02, Math.min(0.6, tone * 0.44 + (rnd() * 2 - 1) * 0.12)),
        litB: rnd() < 0.45 ? 0 : 1,
        rare: rnd() < 0.05 ? 1 : 0,
        // The understory takes twice the share of it. This storey is under the
        // canopy by construction, so what it is short of is not colour, it is
        // light — and the blades in the bottom of a meadow are where the near
        // black in the reference photograph actually is.
        shade: shadeFor(rnd(), ux, uz, 0.14),
        lay: part
          ? layAngle(
              height,
              lean,
              curve,
              uFacing,
              part.dirX,
              part.dirZ,
              part.ceiling - uy - halfWidth,
            )
          : 0,
        bearing,
      });
    }

    if (biome.heads && rnd() < biome.heads.density) {
      // Standing clear of the grass it grew out of — and a head is a disc on
      // top of a stem, so what has to fit under the sight line is the whole of
      // it. There is no cutting a poppy down, and no laying one over either: a
      // bloom held at exactly the height of the corridor is the corridor
      // blocked, and a head is a rigid disc on a stalk that the grass's parting
      // has nothing to say about. So this one keeps the permanent carve.
      const stand = h / grassScale + rnd() * 0.06;
      if (stand + biome.heads.radius < sightCeiling(x, z) - rootHeight(x, z)) {
        heads.push({
          x: x + (rnd() * 2 - 1) * 0.03,
          z: z + (rnd() * 2 - 1) * 0.03,
          height: stand,
          radius: biome.heads.radius * (0.6 + 0.6 * near) * (0.8 + rnd() * 0.4),
          tone: rnd(),
          phase: rnd() * Math.PI * 2,
        });
      }
    }
  }

  return { blades, heads };
}

export type Wildflower = {
  x: number;
  /** Root height on the modelled soil — see Blade.y. */
  y: number;
  z: number;
  /** Metres from the root to the middle of the head. */
  height: number;
  radius: number;
  /** Which species it is, and which way the head is turned and tipped. */
  species: number;
  spin: number;
  nod: number;
  phase: number;
};

/**
 * Wildflowers in the grass, in stands.
 *
 * The word is the whole specification. Scattered evenly at this density they
 * are a confetti of dots over a meadow and nothing reads as a plant; in stands
 * — one centre, a dozen plants around it, one or two species between them —
 * they read as the thing a meadow actually does, which is that where one of
 * something grew last year there are fifteen of it now. Sizes taper toward the
 * edge of a stand for the same reason, so it comes out as one shape rather than
 * as a dozen adjacent ones. This is the DOM site's `PATCHES` idea with the
 * patches rolled rather than written down, because there is a whole field to
 * cover here and not eight gaps in a hero.
 *
 * They keep well clear of the plant. A stand of cream heads in the tussock
 * would be a bright landmark sitting exactly where the first act depends on
 * there being nothing to look at, and the last three acts are shot from inside
 * that clearing.
 */
export function plantWildflowers(
  biome: Biome,
  standScale = 1,
  seed = 330719,
): Wildflower[] {
  const spec = biome.wildflowers;
  const out: Wildflower[] = [];
  if (!spec) return out;

  const rnd = makeRandom(seed);
  const stands = Math.max(1, Math.round(spec.stands * standScale));
  const weights = spec.species.map((s) => s.weight);
  const total = weights.reduce((a, b) => a + b, 0);
  /** A species by weight, optionally with one of them taken out of the draw. */
  const pick = (skip = -1) => {
    const pot = skip < 0 ? total : total - weights[skip];
    let r = rnd() * pot;
    let last = 0;
    for (let i = 0; i < weights.length; i++) {
      if (i === skip) continue;
      last = i;
      r -= weights[i];
      if (r <= 0) return i;
    }
    return last;
  };

  /** How far a stand has to keep off the plant: past the tussock, and then some. */
  const KEEP_OFF = 1.15;
  const LIGHT_FLOOR = 0.18;
  const LIGHT_FULL = 0.4;
  /** Whether this biome has any light to follow. Only the meadow does. */
  const sun = SUN_STRENGTH[biome.id] ?? 0;

  for (let s = 0; s < stands; s++) {
    let cx = 0;
    let cz = 0;
    /*
     * Where a meadow flowers is where the canopy is broken.
     *
     * The stands used to be scattered evenly over the whole nine-metre disc,
     * and evenly over nine metres is almost nowhere the camera is looking: the
     * hero frame is a wedge a few metres deep, most of it in shade, and a
     * flower in the shade of this field is a dark dot on dark grass. What came
     * out of it in the first act was one stand — one species, and a warm one —
     * against a field of nothing else. The other four were planted; they were
     * just planted in the dark, or behind the camera.
     *
     * So a stand is offered ground and takes it in proportion to how much light
     * is standing there (three/sunlight.ts). That is where the flowers of a
     * real meadow are, it is where they can be seen, and — because the pools
     * are placed off the hero's own framing — it is where the camera is
     * pointed, without anything here having to know that.
     *
     * Deliberately a bias and not a rule. A quarter weight in the shade keeps
     * flowers everywhere; a field whose colour stopped dead at the edge of the
     * light would say the light was painted on top rather than falling on it.
     */
    for (let tries = 0; tries < 14; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * FIELD_RADIUS;
      const px = Math.cos(a) * r;
      const pz = FOCUS_Z + Math.sin(a) * r;
      if (Math.hypot(px - FLOWER.x, pz - FLOWER.z) < KEEP_OFF) continue;
      cx = px;
      cz = pz;
      if (sun <= 0 || rnd() < LIGHT_FLOOR + (1 - LIGHT_FLOOR) * Math.min(1, sunPool(px, pz) / LIGHT_FULL)) break;
    }

    /*
     * A stand is one species with others through it, not a sampler.
     *
     * Three rather than two, and the second and third are drawn with the first
     * taken out of the pot. Two things fall out of that and both are the point:
     * a stand always carries a colour that is not its own, and the species the
     * weights hold down — the two cool ones, which are a fifth of the planting
     * between them and turn the meadow blue at much more than that — are a
     * *minority through other stands* rather than an occasional whole stand of
     * their own. Which is what a meadow looks like. Their share of the field is
     * within a point of what it was; how many frames they appear in is not.
     */
    const first = pick();
    const second = pick(first);
    const third = pick(first);
    const spread = 0.3 + rnd() * 0.55;
    const n = Math.round(spec.perStand * (0.5 + rnd()));

    for (let i = 0; i < n; i++) {
      // Golden angle out from the centre: an even fill with no rows and no
      // clumping, which a random scatter of a dozen points never manages.
      const t = Math.sqrt((i + 0.4) / n);
      const a = i * 2.39996 + rnd() * 0.6;
      const x = cx + Math.cos(a) * t * spread;
      const z = cz + Math.sin(a) * t * spread * (0.7 + rnd() * 0.6);

      const fromFlower = Math.hypot(x - FLOWER.x, z - FLOWER.z);
      if (fromFlower < KEEP_OFF) continue;

      const root = rootHeight(x, z);
      // Standing a little proud of the canopy, and no further. A meadow flower
      // is an ordinary head held up on a long stem; the ones that clear the
      // grass by a foot are a different plant.
      const height = biome.blade.height * (1.02 + 0.42 * rnd());
      // Biggest at the heart of the stand, smaller at its edge.
      const radius = spec.radius * (1.15 - 0.35 * t) * (0.78 + rnd() * 0.4);
      // Nothing to cut down here: a head held at exactly the height of the
      // corridor is the corridor blocked, so one that will not fit under the
      // sight line simply never grew.
      if (root + height + radius > sightCeiling(x, z)) continue;

      out.push({
        x,
        y: root,
        z,
        height,
        radius,
        species: (() => {
          const u = rnd();
          return u < 0.58 ? first : u < 0.85 ? second : third;
        })(),
        spin: rnd() * Math.PI * 2,
        // Enough of a tip to break a field of identical faces seen from
        // straight above, not enough to close one up at that angle.
        nod: 0.05 + rnd() * 0.36,
        phase: rnd() * Math.PI * 2,
      });
    }
  }

  return out;
}

export type Frond = {
  x: number;
  /** Root height on the modelled soil — see Blade.y. */
  y: number;
  z: number;
  /** Metres, root to the tip of the rachis. */
  height: number;
  /** Which way the fan is turned, and how far the whole thing leans over. */
  facing: number;
  lean: number;
  /** How far the rachis bows off its own root, in heights, signed. */
  curve: number;
  phase: number;
  /**
   * How far to lie over when the sight line opens, and which way — the same
   * pair a blade carries. A frond in the corridor is now laid down for the
   * beats the camera needs it out of the way, rather than never planted.
   */
  lay: number;
  bearing: number;
  /** 0..1 into the body ramp, which of the two lit stops, off-colour or not. */
  tone: number;
  litB: number;
  rare: number;
  /** A tapered bole and bare branch stubs instead of a hairline rachis. */
  woody: number;
  /** Bole half-width at the root, in heights. */
  trunk: number;
  /** How long the leaflets are, as a multiple of the standard span. */
  pinna: number;
  /** Radians the rachis has tipped off vertical by the time it reaches its tip. */
  arch: number;
};

export type Leaf = {
  x: number;
  /** The soil surface it is lying on — see Blade.y. */
  y: number;
  z: number;
  /** Which way it is lying, and how far its near edge is lifted off the floor. */
  facing: number;
  tilt: number;
  size: number;
  tone: number;
};

/**
 * A fern understory.
 *
 * Same scatter and the same rules about the plant as the grass — a clearing it
 * stands in, and a storey around it that grows half again as tall so it is
 * roofed from directly above — because the flower has to disappear here for
 * exactly the reason it does in a meadow. What differs is what gets planted:
 * three storeys out of the biome rather than one, tall and short ferns with a
 * scattering of woody ones over them.
 */
export function plantFronds(clumps: number, biome: Biome, seed = 771103) {
  const rnd = makeRandom(seed);
  const fronds: Frond[] = [];
  const spec = biome.fronds;
  if (!spec) return fronds;

  for (const storey of spec.storeys) {
    const n = Math.round(clumps * storey.share);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * FIELD_RADIUS;
      const x = Math.cos(a) * r;
      const z = FOCUS_Z + Math.sin(a) * r;

      const root = rootHeight(x, z);
      const fromFlower = Math.hypot(x - FLOWER.x, z - FLOWER.z);
      if (fromFlower < FLOWER.clearing) continue;
      // Woody ones keep further off: a small tree growing out of the plant's
      // clearing puts a bole through the middle of the bloom act.
      if (storey.woody && fromFlower < 0.75) continue;

      const nest = Math.max(0, 1 - fromFlower / 0.95);
      const near = 0.35 + 0.65 * rnd();
      // Full height, whether or not it stands in the corridor. The forest floor
      // has no grass to fill a gap in, so a corridor of missing fern is the
      // whole understory going bald in a stripe — it lies over instead, on the
      // same solve the blades use.
      //
      // The exception is the last metre around the plant, where a frond is now
      // cut *down* rather than grown. It used to be the other way: nesting ones
      // were given half again their height and aimed at the flower, so they
      // arched over and roofed it. That was belt-and-braces for a bird's eye
      // the flower is already hidden from — it sits past the bottom frame edge
      // at the hero, which is what actually hides it — and the price was paid
      // in the one act that is *about* the flower. The parting cannot help
      // there: it opens on how low the camera is, so it is wide open for the
      // stem and soil acts and shut for the bloom, which is exactly when these
      // leaflets were lying across the petals.
      const h =
        storey.height *
        (0.74 + 0.34 * near) *
        (1 - 0.55 * nest) *
        (1 + 0.2 * nest * nest);

      // ...and they no longer point at it either. A frond arches along its own
      // facing, so aiming that at the plant is what put a leaflet across the
      // bloom's face; away from it, the same arch takes the tip outward and the
      // flower keeps the air above it.
      const awayFromFlower = Math.atan2(x - FLOWER.x, z - FLOWER.z);
      const fFacing =
        nest > 0.05 ? awayFromFlower + (rnd() * 2 - 1) * 0.7 : rnd() * Math.PI * 2;
      const fLean = (rnd() * 2 - 1) * 0.34;
      const fCurve = (rnd() < 0.5 ? -1 : 1) * 0.3 * (0.6 + rnd() * 0.8);

      /*
       * The parting, asked along the frond's reach and not only under its root.
       *
       * This is where a fern differs from a blade of grass, and asking it the
       * grass's question is what left leaflets lying across the flower's face
       * through the whole bloom act. A blade is more or less over its own root:
       * carve the corridor by root position and the corridor is clear. A frond
       * is not — it leaves the crown vertical and arches, so its tip hangs out
       * sideways at head height and the plant covers several times the ground
       * it grew on. A frond rooted a comfortable distance outside the corridor
       * still drapes its outer leaflets right through it.
       *
       * So the ground is asked at the root and at two points out along the
       * arch, and the frond takes the most restrictive answer of the three. It
       * lays over by whatever the *worst* part of its own span is asked for,
       * which is the only version of this that clears the span rather than the
       * stem. Three samples rather than a swept test because this runs per
       * frond at plant time over thousands of them, and the arch is monotonic —
       * the tip is the extreme, and one point in between catches the belly.
       */
      const reach = h * 0.62;
      const rx = Math.sin(fFacing);
      const rz = Math.cos(fFacing);
      let part = partingAt(x, z);
      for (const along of [0.55, 1]) {
        const at = partingAt(x + rx * reach * along, z + rz * reach * along);
        if (at && (!part || at.ceiling < part.ceiling)) part = at;
      }
      fronds.push({
        x,
        y: root,
        z,
        height: h,
        facing: fFacing,
        lay: part
          ? layAngle(h, fLean, fCurve, fFacing, part.dirX, part.dirZ, part.ceiling - root)
          : 0,
        bearing: part ? Math.atan2(part.dirX, part.dirZ) : 0,
        // A sideways lean on top of the arch, by different amounts — without
        // the spread they line up as a picket fence.
        lean: fLean,
        curve: fCurve,
        phase: rnd() * Math.PI * 2,
        tone: Math.max(0.04, Math.min(0.95, 0.16 + 0.62 * near + (rnd() * 2 - 1) * 0.12)),
        litB: rnd() < 0.45 ? 0 : 1,
        rare: rnd() < 0.1 ? 1 : 0,
        woody: storey.woody ? 1 : 0,
        trunk: 0.022 + rnd() * 0.012,
        // True ferns are more finely divided than the woody ones, and at this
        // leaflet count the only way to say so is to make theirs shorter.
        pinna: storey.woody ? 1 : 0.78 + rnd() * 0.22,
        // How far over it hangs. A fern arches most of the way to horizontal
        // and is why a fern understory has no floor showing through it; a
        // woody one holds itself up, which is what makes it read as a tree
        // rather than as a big fern.
        arch: storey.woody ? 0.16 + rnd() * 0.26 : 0.35 + rnd() * 0.75,
      });
    }
  }

  return fronds;
}

/**
 * Last autumn, lying on the floor.
 *
 * The 2D site rasterises its shed leaves into the ground, which is right for a
 * fixed camera looking at the field from one angle. Here the last act is spent
 * a hand's width off the soil, so they are real leaves lying at real angles:
 * a leaf painted onto the floor at that range is a stain.
 */
export function plantLitter(count: number, biome: Biome, seed = 419002) {
  const rnd = makeRandom(seed);
  const leaves: Leaf[] = [];
  if (!biome.fronds) return leaves;

  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * FIELD_RADIUS;
    const lx = Math.cos(a) * r;
    const lz = FOCUS_Z + Math.sin(a) * r;
    leaves.push({
      x: lx,
      y: rootHeight(lx, lz),
      z: lz,
      facing: rnd() * Math.PI * 2,
      // How far one end is propped on whatever it came down on. Most of the
      // year's fall lands on the year before it, so almost none of it is
      // actually flat, and from the soil act — which is a camera lying in
      // this — flat is the same as absent.
      tilt: (rnd() * 2 - 1) * 0.55,
      size: 0.07 + rnd() * 0.1,
      tone: rnd(),
    });
  }
  return leaves;
}
