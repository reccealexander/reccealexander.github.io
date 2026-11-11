/**
 * Groundhog bowling: the lane, the ball and ten pins, on the floor plane.
 *
 * Everything that matters happens in two dimensions — the lane is flat, and a
 * pin's fate is decided by what hits it along the boards — so bodies are
 * circles on (x, z) and the third dimension is bookkeeping: how far a pin has
 * tipped, and whether it was thrown into the air. Metres and seconds. The
 * bowler stands at +z and rolls toward −z; the foul line is z = 0.
 *
 * The lane is shorter than a regulation one (eight metres, not eighteen) so
 * the pins are more than a speck from behind the ball.
 */

export const LANE_LEN = 8;
export const LANE_HALF = 0.75;
export const GUTTER_W = 0.235;
/** Head pin; the deck runs back from here to the pit. */
export const HEAD_Z = -LANE_LEN;
export const PIT_Z = HEAD_Z - 1.05;
/** Where the side walls start throwing pins back in. */
export const KICKBACK_Z = HEAD_Z + 0.5;
export const WALL_X = LANE_HALF + GUTTER_W;

export const BALL_R = 0.13;
const BALL_MASS = 7;
export const BALL_START_Z = 0.6;
const BALL_SPEED = 7;

/** Pins are groundhogs at eighty-five percent: about half a metre standing,
    so they read from the foul line. Lane, spacing and ball are sized up to
    match. */
export const PIN_SCALE = 0.85;
export const PIN_R = 0.16 * PIN_SCALE;
export const PIN_H = 0.594 * PIN_SCALE;
const PIN_MASS = 3.6;
export const PIN_SPACING = 0.4;

/** Most a throw can be aimed off straight down the boards, in radians. */
export const MAX_AIM = 0.13;

const G = 9.81;

/* ------------------------------------------------------------------ hook */

/*
 * The hook. The front of a real lane is oiled and the back is dry, so a ball
 * thrown with side rotation skids straight through the heads and only bites —
 * turns toward the side it is spinning to — once it reaches the dry boards.
 * Modelled as the ball's heading turning at a rate proportional to its spin,
 * ramping in over the back half of the lane. Turning the heading rather than
 * pushing sideways keeps the speed constant, which is what a ball does.
 */
const HOOK_RATE = 0.65;
function friction(z: number): number {
  const progress = -z / LANE_LEN;
  const t = Math.min(1, Math.max(0, (progress - 0.32) / 0.45));
  return t * t * (3 - 2 * t);
}

export type Ball = {
  x: number;
  z: number;
  y: number;
  /** 0 = straight down the lane; positive turns toward +x. */
  heading: number;
  speed: number;
  /** −1 … 1: full hook left to full hook right. */
  spin: number;
  gutter: boolean;
  /** Fell off the end of the deck. */
  gone: boolean;
  vx: number;
  vz: number;
};

export function newBall(aim: number, spin: number): Ball {
  return {
    x: 0,
    z: BALL_START_Z,
    y: BALL_R,
    heading: aim,
    speed: BALL_SPEED,
    spin,
    gutter: false,
    gone: false,
    vx: Math.sin(aim) * BALL_SPEED,
    vz: -Math.cos(aim) * BALL_SPEED,
  };
}

/** Moves the ball by itself — no pins. Shared by the real roll and the
    guideline, so the dotted line is exactly where the ball goes. */
export function stepBall(b: Ball, dt: number) {
  if (b.gone) return;
  if (!b.gutter) {
    // Once the pins have knocked it about, its velocity is the truth; take
    // heading and speed from it before turning.
    b.speed = Math.hypot(b.vx, b.vz);
    b.heading = Math.atan2(b.vx, -b.vz);
    b.heading += b.spin * HOOK_RATE * friction(b.z) * dt;
    b.vx = Math.sin(b.heading) * b.speed;
    b.vz = -Math.cos(b.heading) * b.speed;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;

  if (!b.gutter && Math.abs(b.x) > LANE_HALF && b.z > PIT_Z) {
    // Off the edge of the boards and into the channel, where it runs straight.
    b.gutter = true;
    b.x = Math.sign(b.x) * (LANE_HALF + GUTTER_W * 0.5);
    b.vx = 0;
    b.vz = -Math.max(3, Math.abs(b.vz));
  }
  if (b.gutter) {
    b.y += (BALL_R - 0.075 - b.y) * Math.min(1, dt * 18);
  }
  if (b.z < PIT_Z) {
    b.y -= 2 * dt;
    if (b.z < PIT_Z - 0.6) b.gone = true;
  }
}

/** Where the ball will go: points along its path, and whether it ends in the
    gutter. */
export function predict(aim: number, spin: number): { points: [number, number][]; gutterAt: number } {
  const b = newBall(aim, spin);
  const points: [number, number][] = [];
  let gutterAt = -1;
  const dt = 1 / 120;
  for (let i = 0; i < 2000 && b.z > HEAD_Z - 0.35; i++) {
    stepBall(b, dt);
    if (i % 4 === 0) points.push([b.x, b.z]);
    if (b.gutter && gutterAt < 0) gutterAt = points.length;
  }
  return { points, gutterAt };
}

/* ------------------------------------------------------------------ pins */

export type Pin = {
  /** 1–10, the usual numbering: 1 at the head, 7–10 across the back row. */
  n: number;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Height off the deck, for a pin thrown up by the ball. */
  y: number;
  vy: number;
  /** How far it has tipped over, and which way. */
  tilt: number;
  tiltV: number;
  dirX: number;
  dirZ: number;
  yaw: number;
  yawV: number;
  /** Knocked over, by anything. */
  down: boolean;
  /** Swept off the deck, by the machine or into the pit. */
  gone: boolean;
  /** Rocking on its base but still up — the wobbler everyone watches. */
  wobble: number;
  wobbleT: number;
};

export function rack(): Pin[] {
  const pins: Pin[] = [];
  let n = 1;
  for (let row = 0; row < 4; row++) {
    for (let j = 0; j <= row; j++) {
      const x = (j - row / 2) * PIN_SPACING;
      const z = HEAD_Z - row * PIN_SPACING * Math.sin(Math.PI / 3);
      pins.push({
        n: n++,
        homeX: x,
        homeZ: z,
        x,
        z,
        vx: 0,
        vz: 0,
        y: 0,
        vy: 0,
        tilt: 0,
        tiltV: 0,
        dirX: 0,
        dirZ: -1,
        yaw: 0,
        yawV: 0,
        down: false,
        gone: false,
        wobble: 0,
        wobbleT: 0,
      });
    }
  }
  return pins;
}

/** Puts a pin back on its spot, upright, as the machine does with the ones
    still standing. */
export function respot(p: Pin) {
  Object.assign(p, {
    x: p.homeX,
    z: p.homeZ,
    vx: 0,
    vz: 0,
    y: 0,
    vy: 0,
    tilt: 0,
    tiltV: 0,
    yaw: 0,
    yawV: 0,
    down: false,
    gone: false,
    wobble: 0,
  });
}

/** Where a pin's weight is on the deck — over its base standing, halfway
    along its length lying down. That is the circle it collides as. */
function centre(p: Pin): [number, number] {
  const s = Math.sin(p.tilt) * PIN_H * 0.42;
  return [p.x + p.dirX * s, p.z + p.dirZ * s];
}

/** A shove: under a gentle one a pin rocks; anything more and it goes over. */
function knock(p: Pin, dvx: number, dvz: number, rand: () => number) {
  const dv = Math.hypot(dvx, dvz);
  if (p.down) return;
  if (dv < 0.8) {
    p.wobble = Math.max(p.wobble, 0.05 + dv * 0.6);
    p.vx *= 0.2;
    p.vz *= 0.2;
    return;
  }
  p.down = true;
  const vx = p.vx || dvx;
  const vz = p.vz || dvz;
  const v = Math.hypot(vx, vz) || 1;
  p.dirX = vx / v;
  p.dirZ = vz / v;
  p.tiltV = 2.5 + dv * 2.2;
  p.yawV = (rand() - 0.5) * dv * 6;
  if (dv > 2.2) p.vy = Math.min(2.6, (dv - 2) * 0.55 + rand() * 0.4);
}

export type World = {
  ball: Ball | null;
  pins: Pin[];
  /** When the ball first reached a pin. */
  firstHit: number;
  /** How steeply it came in, in radians off straight down the boards. */
  entry: number;
  time: number;
};

export function newWorld(): World {
  return { ball: null, pins: rack(), firstHit: -1, entry: 0, time: 0 };
}

/** One small step of everything. Call several per frame. */
export function step(w: World, dt: number, rand: () => number = Math.random) {
  w.time += dt;
  const b = w.ball;
  if (b) stepBall(b, dt);

  for (const p of w.pins) {
    if (p.gone) continue;

    // Rocking, and settling back.
    if (!p.down && p.wobble > 0) {
      p.wobbleT += dt;
      p.wobble *= Math.exp(-dt * 2.4);
      if (p.wobble < 0.003) p.wobble = 0;
    }

    if (p.down) {
      // Tipping over: a pendulum on its rim, from wherever the knock started
      // it, until it is lying on the deck.
      if (p.tilt < 1.5) {
        p.tiltV += (G / (PIN_H * 0.7)) * Math.sin(Math.max(0.15, p.tilt)) * dt;
        p.tilt = Math.min(1.5, p.tilt + p.tiltV * dt);
        if (p.tilt >= 1.5) p.tiltV = 0;
      }
      p.yaw += p.yawV * dt;
      p.yawV *= Math.exp(-dt * 1.5);
    }

    // In the air, and back down.
    if (p.y > 0 || p.vy > 0) {
      p.vy -= G * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = Math.abs(p.vy) > 0.6 ? -p.vy * 0.3 : 0;
      }
    }

    p.x += p.vx * dt;
    p.z += p.vz * dt;
    // Sliding on its side gives up speed quickly; on the deck, airborne, not.
    const drag = p.y > 0.01 ? 0 : p.down ? 2.6 : 9;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0) {
      const k = Math.max(0, sp - drag * dt) / sp;
      p.vx *= k;
      p.vz *= k;
    }

    // Side walls at the back throw pins back across the deck.
    if (p.z < KICKBACK_Z && Math.abs(p.x) > WALL_X - PIN_R) {
      p.x = Math.sign(p.x) * (WALL_X - PIN_R);
      p.vx = -p.vx * 0.55;
      if (!p.down) knock(p, p.vx, p.vz, rand);
    }
    // Into the channel at the side.
    if (Math.abs(p.x) > LANE_HALF + 0.02 && p.z > KICKBACK_Z) {
      if (!p.down) knock(p, p.vx || Math.sign(p.x), p.vz, rand);
      p.vx *= 0.5;
    }
    // Off the back of the deck.
    if (p.z < PIT_Z) {
      p.down = true;
      p.y -= 1.5 * dt;
      if (p.y < -0.6) p.gone = true;
    }
  }

  // Collisions. Eleven bodies; every pair, every step.
  if (b && !b.gutter && !b.gone) {
    for (const p of w.pins) {
      if (p.gone || p.y > PIN_H) continue;
      const [cx, cz] = centre(p);
      const dx = cx - b.x;
      const dz = cz - b.z;
      const d = Math.hypot(dx, dz);
      const min = BALL_R + PIN_R;
      if (d >= min || d === 0) continue;
      if (w.firstHit < 0) {
        w.firstHit = w.time;
        w.entry = Math.abs(Math.atan2(b.vx, -b.vz));
      }
      const nx = dx / d;
      const nz = dz / d;
      const push = min - d;
      b.x -= nx * push * (PIN_MASS / (BALL_MASS + PIN_MASS));
      b.z -= nz * push * (PIN_MASS / (BALL_MASS + PIN_MASS));
      p.x += nx * push * (BALL_MASS / (BALL_MASS + PIN_MASS));
      p.z += nz * push * (BALL_MASS / (BALL_MASS + PIN_MASS));
      const rel = (b.vx - p.vx) * nx + (b.vz - p.vz) * nz;
      if (rel <= 0) continue;
      const j = ((1 + 0.55) * rel) / (1 / BALL_MASS + 1 / PIN_MASS);
      b.vx -= (j / BALL_MASS) * nx;
      b.vz -= (j / BALL_MASS) * nz;
      p.vx += (j / PIN_MASS) * nx;
      p.vz += (j / PIN_MASS) * nz;
      knock(p, (j / PIN_MASS) * nx, (j / PIN_MASS) * nz, rand);
    }
  }

  /*
   * Entry angle. A ball that comes in square drives the pins straight back
   * into each other and through the gaps; one that comes in at an angle sends
   * them sideways across the rack, which is the whole reason anyone hooks it.
   * So the pin-on-pin action is livelier the steeper the entry.
   */
  const carry = 0.35 + Math.min(0.6, w.entry * 5);
  const pins = w.pins;
  for (let i = 0; i < pins.length; i++) {
    const a = pins[i];
    if (a.gone) continue;
    const [ax, az] = centre(a);
    for (let k = i + 1; k < pins.length; k++) {
      const c = pins[k];
      if (c.gone || Math.abs(a.y - c.y) > PIN_H) continue;
      const [cx, cz] = centre(c);
      const dx = cx - ax;
      const dz = cz - az;
      const d = Math.hypot(dx, dz);
      const min = PIN_R * 2;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const nz = dz / d;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      c.x += nx * push;
      c.z += nz * push;
      // A pin going over sweeps whatever it falls into with it — the weight
      // of the fall, not just how fast its base is sliding.
      const fallA = a.down ? a.tiltV * PIN_H * 0.4 : 0;
      const fallC = c.down ? c.tiltV * PIN_H * 0.4 : 0;
      const va = a.vx * nx + a.vz * nz + fallA * (a.dirX * nx + a.dirZ * nz);
      const vc = c.vx * nx + c.vz * nz + fallC * (c.dirX * nx + c.dirZ * nz);
      const rel = va - vc;
      if (rel <= 0) continue;
      const j = (((1 + 0.5) * rel) / 2) * carry;
      a.vx -= j * nx;
      a.vz -= j * nz;
      c.vx += j * nx;
      c.vz += j * nz;
      knock(a, -j * nx, -j * nz, rand);
      knock(c, j * nx, j * nz, rand);
    }
  }
}

/** Whether nothing on the deck is still moving. */
export function settled(w: World): boolean {
  for (const p of w.pins) {
    if (p.gone) continue;
    if (Math.hypot(p.vx, p.vz) > 0.03) return false;
    if (p.down && p.tilt < 1.5) return false;
    if (p.y > 0 || p.wobble > 0.01) return false;
  }
  return true;
}

/* --------------------------------------------------------------- scoring */

export type Frame = { rolls: number[]; score: number | null };

/**
 * Ten frames from a flat list of pinfall, the standard way: a strike scores
 * ten plus the next two rolls, a spare ten plus the next one, and the tenth
 * frame gets its bonus balls in-frame.
 */
export function score(rolls: number[]): { frames: Frame[]; total: number; over: boolean } {
  const frames: Frame[] = [];
  let i = 0;
  let total = 0;
  for (let f = 0; f < 10; f++) {
    const fr: Frame = { rolls: [], score: null };
    if (f < 9) {
      if (rolls[i] === 10) {
        fr.rolls = [10];
        if (rolls[i + 2] !== undefined) fr.score = total += 10 + rolls[i + 1] + rolls[i + 2];
        i += 1;
      } else {
        fr.rolls = rolls.slice(i, i + 2);
        const [a, b] = fr.rolls;
        if (b !== undefined) {
          if (a + b === 10) {
            if (rolls[i + 2] !== undefined) fr.score = total += 10 + rolls[i + 2];
          } else {
            fr.score = total += a + b;
          }
        }
        i += 2;
      }
    } else {
      fr.rolls = rolls.slice(i, i + 3);
      const [a, b, c] = fr.rolls;
      const bonus = a === 10 || (b !== undefined && a + b === 10);
      if ((bonus && c !== undefined) || (!bonus && b !== undefined)) {
        fr.score = total += a + (b ?? 0) + (c ?? 0);
      }
    }
    frames.push(fr);
  }
  return { frames, total, over: frames[9].score !== null };
}

/** Which frame the next roll belongs to, and which ball of it it is. */
export function position(rolls: number[]): { frame: number; ball: number } {
  let i = 0;
  for (let f = 0; f < 9; f++) {
    if (i >= rolls.length) return { frame: f, ball: 0 };
    if (rolls[i] === 10) {
      i += 1;
      continue;
    }
    if (i + 1 >= rolls.length) return { frame: f, ball: 1 };
    i += 2;
  }
  return { frame: 9, ball: rolls.length - i };
}

/** After a roll: does the machine re-rack all ten? */
export function freshRack(rolls: number[]): boolean {
  const { frame, ball } = position(rolls);
  if (ball === 0) return true;
  if (frame < 9) return false;
  // The tenth: a new rack after a strike, or after a spare.
  const tenth = rolls.slice(rolls.length - ball);
  if (ball === 1) return tenth[0] === 10;
  if (ball === 2) return tenth[0] === 10 ? tenth[1] === 10 : tenth[0] + tenth[1] === 10;
  return true;
}
