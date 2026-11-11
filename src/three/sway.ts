import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RedFormat,
  UnsignedByteType,
} from "three";

/**
 * Cursor sway: the DOM site's velocity spring, run on a grid instead of per
 * plant.
 *
 * The 2D site gave every blade its own `bend`/`bv` pair and integrated them all
 * on the CPU, and that is the whole reason its field feels alive — the canopy
 * lays over, overshoots, and rings back rather than snapping to a falloff. The
 * shape of that response is load-bearing and comes out of the constants below
 * interacting: the spring, the smoothstepped falloff, the gust term and the
 * positional push. See src/components/field/sway.ts on the 2D site; the numbers
 * here are its numbers.
 *
 * What cannot be carried over is the per-plant part. There are tens of
 * thousands of blades here where there were a couple of thousand shapes there,
 * so the state is moved off the blades and onto a grid laid over the ground:
 * one spring per cell, integrated on the CPU, uploaded once a frame as a small
 * texture that the blade shader reads by its own world XZ. The blades inside
 * one cell moving together is exactly what neighbouring plants do anyway; all
 * that matters is that the cell stays small next to the pointer's reach, which
 * is the thing that decides whether the falloff reads as a falloff or as a
 * staircase of squares.
 */

// ---------------------------------------------------------------------------
// The solver's constants. The shape of the response is the 2D site's; the
// amplitude is not.
// ---------------------------------------------------------------------------

/**
 * How far a plant may lay over at all.
 *
 * Twice the 2D site's, and deliberately: the reach below is less than half what
 * it was, and a cursor that touches a quarter of the ground it used to has to
 * do something visible to the ground it still touches or the whole gesture
 * disappears. At 0.85 the tip of a blade travels a little under half its own
 * height, which is a plant being pushed over rather than a field rippling.
 */
const MAX_BEND = 0.85;
const VEL_SCALE = 0.0009; // bend per unit of pointer speed
/**
 * Bend from simply being near the pointer, rather than from moving.
 *
 * This is the part a reader actually aims: it is what a cursor held still over
 * one clump does, and against an ambient wind that is already worth ±0.25 the
 * 2D site's 0.07 was under the noise floor. At 0.18 a parked cursor visibly
 * lays its own patch over and nothing else moves.
 */
const PUSH = 0.18;
const VMAG_GUST = 0.0002; // extra bend a fast pass adds on top
const SPRING_K = 220;
const SPRING_D = 12;
const MIN_VEL = 8;
const MAX_DT = 0.05;
const BEND_LIMIT = MAX_BEND * 1.1; // the overshoot is allowed past MAX_BEND

/**
 * The pointer's reach, in metres.
 *
 * The 2D site used `min(W, H) * 0.25` clamped to 90..180 CSS px, and a metre
 * and a bit was that number carried over at the hero's dwell. It was wrong for
 * this scene: a fifth of a flat canvas is a fifth of the picture, but a fifth
 * of a frame here is a fifth of a field seen in perspective, and at the hero
 * that reach spanned most of the height of the screen. Pointing at one clump
 * laid over three quarters of the meadow with it.
 *
 * Half a metre is about a hand's span of ground — a couple of clumps and their
 * neighbours, which is what a hand pushing through grass actually moves. The
 * whole of the loss in area is paid back in MAX_BEND and PUSH above.
 */
export const SWAY_RADIUS = 0.55;

/**
 * The exchange rate the three velocity constants above are converted at.
 *
 * VEL_SCALE, VMAG_GUST and MIN_VEL are all per CSS pixel per second, and this
 * pointer is in metres per second, so they cannot be used as written. The one
 * length both sites agree on is the pointer's reach: 150px there is
 * SWAY_RADIUS metres here, and that fixes the scale for everything else. A
 * cursor crossing its own radius in a tenth of a second must come out at the
 * same bend on both sites, which is what this makes true.
 */
const PX_PER_M = 150 / SWAY_RADIUS;
const VEL_SCALE_M = VEL_SCALE * PX_PER_M;
const VMAG_GUST_M = VMAG_GUST * PX_PER_M;
const MIN_VEL_M = MIN_VEL / PX_PER_M;

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/**
 * Cells per side.
 *
 * This is a function of the reach above, not a free choice. The falloff is a
 * smoothstep over SWAY_RADIUS, so it is the number of cells that fits inside
 * that radius which decides whether it comes out as a falloff or as a stack of
 * squares — bilinear filtering only ever softens the joins between texels, it
 * cannot invent a shape that is not in them. The old grid gave the old reach
 * about three and a half cells; at 64 the new reach would have had one and
 * three quarters, and a cursor would have dragged a visible chequerboard
 * around with it.
 *
 * 192 puts the cell at ten centimetres and the reach back over five cells, so
 * the falloff is finer than it ever was. What it costs is the grid being nine
 * times the springs (36,864) and the upload nine times the bytes (36KB a
 * frame) — both still nothing next to one draw of grass, and the integrator
 * below only touches the cells that are actually moving.
 */
const N = 192;
/**
 * The patch of ground the camera ever frames closely enough for a bend to
 * read. The journey never puts the camera outside x ±1 or z 1.4..-7, and the
 * fog swallows the field about eighteen metres out, so twenty metres centred
 * on the flower covers everything that is ever both visible and in focus.
 */
const SPAN = 20;
const MIN_X = -10;
const MIN_Z = -14;
const CELL = SPAN / N;

/**
 * Blades outside the grid sample its edge, so the outermost ring is never
 * given a target and stays at zero. Without it a cursor near the boundary
 * would lay over a whole band of far field in lockstep.
 */
const LO = 1;
const HI = N - 2;

/** Below half a quantiser step, and barely moving: call it standing up. */
const REST_BEND = BEND_LIMIT / 512;
const REST_VEL = BEND_LIMIT / 64;

export interface SwayPointer {
  active: boolean;
  worldX: number;
  worldZ: number;
  velX: number;
  velZ: number;
}

export interface SwayGrid {
  texture: DataTexture;
  /** Grid origin in world metres, and the reciprocal of its span. */
  origin: [number, number];
  scale: number;
  /** Bend per unit of texel, once the byte's zero point is taken off. */
  amplitude: number;
  step(p: SwayPointer, dt: number): void;
  /**
   * Kick the springs from a point, as something moving through the grass
   * does: every cell within `radius` gets `strength` of bend velocity, leaning
   * away from the point and falling off toward the edge. The springs do the
   * rest — the lean, the overshoot and the ring back are theirs.
   */
  impulse(x: number, z: number, radius: number, strength: number): void;
}

export function createSwayGrid(): SwayGrid {
  const bend = new Float32Array(N * N);
  const bv = new Float32Array(N * N);
  // Eight bits over ±BEND_LIMIT quantises to about three thousandths of a
  // bend, which is a fraction of a pixel at the tip of the nearest blade — and
  // a byte texture filters bilinearly everywhere, which float textures do not.
  // 127 is zero bend, so the byte carries a sign and decodes exactly.
  const bytes = new Uint8Array(N * N).fill(127);

  const texture = new DataTexture(bytes, N, N, RedFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  // Once the field has rung itself out there is nothing to send. Skipping the
  // upload is what keeps a page nobody is pointing at free.
  let awake = false;

  return {
    texture,
    origin: [MIN_X, MIN_Z],
    scale: 1 / SPAN,
    amplitude: BEND_LIMIT / 127,

    impulse(x: number, z: number, radius: number, strength: number) {
      const iLo = cellIndex(x - radius - MIN_X);
      const iHi = cellIndex(x + radius - MIN_X);
      const jLo = cellIndex(z - radius - MIN_Z);
      const jHi = cellIndex(z + radius - MIN_Z);
      for (let j = jLo; j <= jHi; j++) {
        const dz = MIN_Z + (j + 0.5) * CELL - z;
        for (let i = iLo; i <= iHi; i++) {
          const dx = MIN_X + (i + 0.5) * CELL - x;
          const d = Math.hypot(dx, dz);
          if (d >= radius) continue;
          let q = 1 - d / radius;
          q = q * q * (3 - 2 * q);
          const dir = dx > 0 ? 1 : dx < 0 ? -1 : 0;
          bv[j * N + i] += strength * dir * q;
        }
      }
      awake = true;
    },

    step(p: SwayPointer, dt: number) {
      if (!(dt > 0)) dt = 0.016;
      if (dt > MAX_DT) dt = MAX_DT;

      const vmag = Math.hypot(p.velX, p.velZ);
      const gustBoost = vmag * VMAG_GUST_M;
      const still = vmag < MIN_VEL_M;
      const damp = Math.max(0, 1 - SPRING_D * dt);

      // The drive is the same everywhere inside the radius bar its sign and
      // the falloff, so it is worth solving once rather than per cell.
      let motion = VEL_SCALE_M * p.velX;
      if (motion !== 0) motion += motion > 0 ? gustBoost : -gustBoost;
      const toward = clamp(motion + PUSH, -MAX_BEND, MAX_BEND);
      const away = clamp(motion - PUSH, -MAX_BEND, MAX_BEND);
      const flat = clamp(motion, -MAX_BEND, MAX_BEND);

      const push = p.active && !still;
      const gentle = p.active && still;
      if (!p.active && !awake) return;

      const iLo = push || gentle ? cellIndex(p.worldX - SWAY_RADIUS - MIN_X) : 0;
      const iHi = push || gentle ? cellIndex(p.worldX + SWAY_RADIUS - MIN_X) : -1;
      const jLo = push || gentle ? cellIndex(p.worldZ - SWAY_RADIUS - MIN_Z) : 0;
      const jHi = push || gentle ? cellIndex(p.worldZ + SWAY_RADIUS - MIN_Z) : -1;

      let peak = 0;

      for (let j = LO; j <= HI; j++) {
        const cz = MIN_Z + (j + 0.5) * CELL;
        const dz = cz - p.worldZ;
        const row = j * N;
        const near = j >= jLo && j <= jHi;

        for (let i = LO; i <= HI; i++) {
          const k = row + i;
          let target = 0;

          // A cell standing still with nothing pulling on it stays standing
          // still, and there is no arithmetic that says so more cheaply than
          // not doing it. This is what pays for the grid being nine times
          // finer: the loop still visits every cell, but the work is
          // proportional to the patch the cursor has actually disturbed rather
          // than to the whole field.
          if (bend[k] === 0 && bv[k] === 0 && !(near && i >= iLo && i <= iHi)) {
            continue;
          }

          if (near && i >= iLo && i <= iHi) {
            const dx = MIN_X + (i + 0.5) * CELL - p.worldX;
            const d2 = dx * dx + dz * dz;
            if (d2 < SWAY_RADIUS * SWAY_RADIUS) {
              let q = 1 - Math.sqrt(d2) / SWAY_RADIUS;
              q = q * q * (3 - 2 * q); // smoothstep
              const dir = dx > 0 ? 1 : dx < 0 ? -1 : 0;
              // A cursor that has stopped moving still leans the grass away
              // from itself, or it reads as inert the moment it settles.
              target = gentle
                ? PUSH * dir * q * 0.7
                : (dir > 0 ? toward : dir < 0 ? away : flat) * q;
            }
          }

          let v = bv[k] + (target - bend[k]) * SPRING_K * dt;
          v *= damp;
          let b = bend[k] + v * dt;
          if (b > BEND_LIMIT) {
            b = BEND_LIMIT;
            if (v > 0) v = 0;
          } else if (b < -BEND_LIMIT) {
            b = -BEND_LIMIT;
            if (v < 0) v = 0;
          }
          // A ring smaller than the quantiser can carry is a ring nobody can
          // see, and rounding it to nothing is what lets the cell drop out of
          // the loop above instead of decaying toward zero forever.
          if (b > -REST_BEND && b < REST_BEND && v > -REST_VEL && v < REST_VEL) {
            b = 0;
            v = 0;
          }
          bend[k] = b;
          bv[k] = v;

          const mag = b < 0 ? -b : b;
          if (mag > peak) peak = mag;
          bytes[k] = (b * (127 / BEND_LIMIT) + 127.5) | 0;
        }
      }

      // A ring below the quantiser is a ring nobody can see; snapping to it
      // and stopping is what lets the upload stop too.
      awake = p.active || peak > BEND_LIMIT / 255;
      if (!awake) {
        bend.fill(0);
        bv.fill(0);
        bytes.fill(127);
      }
      texture.needsUpdate = true;
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The cell a world offset falls in, held inside the ring that stays at zero. */
function cellIndex(offset: number) {
  const i = Math.floor(offset / CELL);
  return i < LO ? LO : i > HI ? HI : i;
}
