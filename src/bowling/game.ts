import {
  freshRack,
  newBall,
  newWorld,
  rack,
  respot,
  score,
  settled,
  step,
  HEAD_Z,
  type World,
} from "./physics";

/**
 * The game, outside React.
 *
 * The scene reads it every frame and the HUD only when something it shows has
 * changed, so it is a plain mutable object with a version number: the frame
 * loop writes to it freely, and anything a person would notice changing —
 * the phase, the spin, the score — bumps the version and wakes the HUD.
 */

export type Phase = "aim" | "roll" | "sweep" | "over";

export type Drag = { x0: number; y0: number; x: number; y: number };

const SUBSTEPS = 8;
/** Once the ball is off the deck or the deck is still, how long before the
    machine comes down — long enough to watch the last wobbler decide. */
const LINGER = 0.9;
const SWEEP = 1.3;
/** However things are going, a roll ends after this long. */
const ROLL_LIMIT = 8;

export const game = {
  world: newWorld() as World,
  phase: "aim" as Phase,
  /** Radians off straight, from the cursor. */
  aim: 0,
  /** −1 … 1, from a shift-drag. */
  spin: 0,
  drag: null as Drag | null,
  /** Touch screens have no shift key: a toggle that makes every drag a spin. */
  spinMode: false,
  rolls: [] as number[],
  /** Which pins were standing when this ball was thrown. */
  upAtThrow: [] as number[],
  message: "",
  messageId: 0,
  rollT: 0,
  quietT: 0,
  sweepT: 0,
  /** The pins left standing as the HUD should draw them. */
  standing: new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  version: 0,
};

/** Where the cursor is, in normalised device coordinates. Written by the page. */
export const cursor = { x: 0, y: 0, active: false };

const listeners = new Set<() => void>();

export function emit() {
  game.version++;
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function snapshot() {
  return game.version;
}

export function setSpin(spin: number) {
  const s = Math.max(-1, Math.min(1, spin));
  if (s === game.spin) return;
  game.spin = s;
  emit();
}

export function setDrag(drag: Drag | null) {
  game.drag = drag;
  emit();
}

export function toggleSpinMode() {
  game.spinMode = !game.spinMode;
  emit();
}

function say(text: string) {
  game.message = text;
  game.messageId++;
}

export function throwBall() {
  if (game.phase !== "aim") return;
  const w = game.world;
  w.ball = newBall(game.aim, game.spin);
  w.firstHit = -1;
  w.entry = 0;
  w.time = 0;
  game.upAtThrow = w.pins.filter((p) => !p.gone && !p.down).map((p) => p.n);
  game.phase = "roll";
  game.rollT = 0;
  game.quietT = 0;
  game.message = "";
  emit();
}

export function newGame() {
  game.world = newWorld();
  game.rolls = [];
  game.phase = "aim";
  game.message = "";
  game.standing = new Set(game.world.pins.map((p) => p.n));
  emit();
}

function commentary(knocked: number, wasUp: number, gutter: boolean) {
  if (knocked === wasUp) return wasUp === 10 ? "Strike!" : "Spare!";
  if (gutter && knocked === 0) return "Gutter ball. The groundhogs are unimpressed.";
  if (knocked === 0) return "Not a whisker.";
  if (knocked === 1) return "1 groundhog";
  return `${knocked} groundhogs`;
}

/** Advance the game by one frame. */
export function update(dt: number) {
  const w = game.world;
  if (game.phase === "roll") {
    for (let k = 0; k < SUBSTEPS; k++) step(w, dt / SUBSTEPS);
    game.rollT += dt;
    const b = w.ball!;
    const past = b.gone || (b.z < HEAD_Z - 0.4 && w.firstHit >= 0) || b.z < HEAD_Z - 1.2;
    game.quietT = past && settled(w) ? game.quietT + dt : 0;

    // The HUD's pin diagram follows along as they go down.
    let changed = false;
    for (const p of w.pins) {
      const up = !p.down && !p.gone;
      if (up !== game.standing.has(p.n)) {
        if (up) game.standing.add(p.n);
        else game.standing.delete(p.n);
        changed = true;
      }
    }

    if (game.quietT > LINGER || game.rollT > ROLL_LIMIT) {
      const wasUp = game.upAtThrow.length;
      const knocked = game.upAtThrow.filter((n) => {
        const p = w.pins[n - 1];
        return p.down || p.gone;
      }).length;
      game.rolls.push(knocked);
      say(commentary(knocked, wasUp, b.gutter));
      game.phase = "sweep";
      game.sweepT = 0;
      changed = true;
    }
    if (changed) emit();
  } else if (game.phase === "sweep") {
    // The deck still settles under the sweep.
    for (let k = 0; k < SUBSTEPS; k++) step(w, dt / SUBSTEPS);
    game.sweepT += dt;
    if (game.sweepT > SWEEP) {
      w.ball = null;
      if (score(game.rolls).over) {
        game.phase = "over";
        const total = score(game.rolls).total;
        say(total === 300 ? "A perfect game. 300." : `Game over — ${total}`);
      } else {
        if (freshRack(game.rolls)) {
          w.pins = rack();
        } else {
          // Clear what fell, set back up what did not.
          for (const p of w.pins) {
            if (p.down || p.gone) p.gone = true;
            else respot(p);
          }
        }
        game.phase = "aim";
      }
      game.standing = new Set(w.pins.filter((p) => !p.gone && !p.down).map((p) => p.n));
      emit();
    }
  }
}
