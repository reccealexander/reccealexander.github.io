/**
 * The koi, which are not objects in the scene.
 *
 * They live under the surface, and the only honest way to draw something under
 * moving water without a second render pass is to draw it *in* the water: the
 * pond's own shader walks a handful of fish per fragment, at a point it has
 * already refracted through the wave above them. That buys the two things a
 * mesh under a transparent plane cannot have — the fish bends with the ripple
 * rather than sliding under a decal of one, and it goes out with depth because
 * the water it is seen through is the same water being shaded.
 *
 * So this file is a school of fish as numbers plus the GLSL that reads them.
 * The simulation is the sway grid's trick again (src/three/sway.ts): solve
 * something small on the CPU and hand the shader the answer.
 */

import { makeRandom } from "@/lib/math";
import { KOI_WATER } from "./pond";
import type { SwayPointer } from "./sway";

/** How near the cursor has to come before a fish takes it personally. */
const SPOOK = 1.15;
/**
 * How much water a koi keeps between itself and each edge of its box.
 *
 * Not one number, because the four edges are not one problem. Sideways and at
 * the far end the margin is only there to stop a fish reaching a boundary it
 * would then swim along, so it is generous. At the near end it is the whole
 * point of the box: it is what puts the school low in the hero, and every
 * centimetre of it is a centimetre further up the frame. So it is cut to a
 * body length — enough that a fish turns before its nose is in the shallows,
 * and no more.
 */
const MARGIN = { side: 0.8, far: 0.55, near: 0.26 };

/**
 * Which variety each fish in the school is — 0 kohaku, 1 showa, 2 a plain
 * unmarked fish — dealt in order rather than rolled.
 *
 * A pond is mostly kohaku: white, with two or three crimson blotches, and that
 * white is the thing that makes the school read as koi rather than as goldfish.
 * Rolling for it on seven animals gets you seven of the same variety about as
 * often as not, and the seed this pond happens to be planted with came out with
 * no white fish in it at all — seven orange ones, which is exactly the "orange
 * smear" this was supposed to fix. So the hand is dealt: mostly white, a couple
 * of showa, and one plain, whatever the machine can afford to draw.
 */
const BREEDS = [0, 0, 1, 0, 2, 0, 1];

type Fish = {
  x: number;
  z: number;
  heading: number;
  cruise: number;
  /** Half the body length, nose to tail root, in metres. */
  half: number;
  depth: number;
  /** Where the tail is in its beat, in radians. Integrated, never derived. */
  tailPhase: number;
  /** Seeds the markings and the tail's phase, so no two are the same fish. */
  tone: number;
  breed: number;
  wander: number;
  /** 0..1, decaying: how recently something frightened it. */
  startle: number;
  /** How fast it is turning right now, in radians per second. */
  omega: number;
};

export interface School {
  count: number;
  /** x, z, cos heading, sin heading. Written in place, uploaded as a uniform. */
  pose: Float32Array;
  /**
   * How hard each fish is bent, -1..1, from how fast it is actually turning.
   *
   * Its own array rather than a fifth slot squeezed into one of the vec4s
   * above, because all eight of those are spoken for and packing a signed value
   * into a slot that also carries a breed index is the kind of saving that
   * costs an hour the next time somebody reads it.
   */
  bend: Float32Array;
  /** Half-length, depth, tone, tail phase (radians, already integrated). */
  form: Float32Array;
  step(p: SwayPointer & { speed: number }, dt: number, t: number): void;
}

const TAU = Math.PI * 2;

/**
 * The most a startled fish will veer off its current line, in radians.
 *
 * Forty-five degrees. A koi bolting from a shadow does not reverse — it breaks
 * to one side and keeps going, and takes the turn over several beats if it
 * needs more of one.
 */
const MAX_VEER = Math.PI / 4;

/**
 * ...and the fastest it will come round, in radians per second, whatever the
 * steering terms add up to.
 *
 * Sixty-six degrees a second. Brisk enough for a startled fish to get out of
 * the way and slow enough that the turn is a turn you can watch happen — a koi
 * is a heavy animal in a viscous medium, and nothing about it snaps.
 *
 * The bank steering still clears the box at this rate: the worst case is a
 * fish pointed straight at an edge, which needs half a turn, and half a turn
 * takes 2.7 seconds against a near margin it crosses in rather more than that
 * at cruise.
 */
const MAX_TURN = 1.15;

/** Signed angle a to b, wrapped into ±π — a fish turns the short way round. */
function shortest(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function createSchool(count: number): School {
  const rnd = makeRandom(48211);
  const pose = new Float32Array(count * 4);
  const form = new Float32Array(count * 4);
  const bend = new Float32Array(count);

  const fish: Fish[] = Array.from({ length: count }, (_, i) => ({
    x: KOI_WATER.minX + rnd() * (KOI_WATER.maxX - KOI_WATER.minX),
    // Weighted toward the near end rather than dealt flat: the box is only two
    // and a half metres deep, and a flat deal still puts half the school in the
    // metre of it furthest from the reader.
    z: KOI_WATER.maxZ - Math.pow(rnd(), 1.45) * (KOI_WATER.maxZ - KOI_WATER.minZ),
    heading: rnd() * Math.PI * 2,
    // Slow. A koi in a garden pond is idling, and anything faster reads as a
    // fish being chased around a tank.
    cruise: 0.09 + rnd() * 0.07,
    // Nose to tail root, so a fish is about two and a half of these long once
    // the caudal is counted: forty to sixty-five centimetres, which is what a
    // koi in a garden pond actually is. They used to be half that, and at half
    // that the hero reads them at seventy pixels by ten — no silhouette
    // survives ten pixels, and what is left of one is a smear.
    half: 0.155 + rnd() * 0.1,
    // Mostly near the surface with one or two well under it: a school all at
    // one depth is a printed pattern, and it is the ones you can barely make
    // out that give the water a thickness.
    depth: 0.05 + Math.pow(rnd(), 1.5) * 0.3,
    tone: rnd(),
    breed: BREEDS[i % BREEDS.length],
    wander: rnd() * Math.PI * 2,
    startle: 0,
    omega: 0,
    tailPhase: rnd() * Math.PI * 2,
  }));

  const write = () => {
    fish.forEach((k, i) => {
      pose[i * 4] = k.x;
      pose[i * 4 + 1] = k.z;
      pose[i * 4 + 2] = Math.cos(k.heading);
      pose[i * 4 + 3] = Math.sin(k.heading);
      form[i * 4] = k.half;
      form[i * 4 + 1] = k.depth;
      // Variety in the integer part, this fish's own seed in the fraction. One
      // slot, because the four in here are spoken for and a fifth uniform for
      // three states a shader reads once is not worth the upload.
      form[i * 4 + 2] = k.breed + k.tone * 0.999;
      // The tail's PHASE, not its rate — see the note on tailPhase in step().
      form[i * 4 + 3] = k.tailPhase;
      bend[i] = k.omega / MAX_TURN;
    });
  };

  write();

  return {
    count,
    pose,
    form,
    bend,

    step(p, dt, t) {
      if (dt > 0.05) dt = 0.05;

      for (const k of fish) {
        /*
         * Idle wandering: two slow, unrelated frequencies, so a fish left alone
         * describes a long lazy curve rather than a circle.
         *
         * A third of the amplitude it had, on frequencies slowed by a third
         * again — and this, not the flee response, was most of what read as
         * fish turning at random. The two terms summed to 0.62 radians a
         * second, which sounds gentle and is not: it is an angular *velocity*,
         * so a fish holding near the peak of both sines for five seconds came
         * round through most of a half-circle without anything having happened
         * to it. Capping the flee at forty-five degrees did nothing for that,
         * because the flee was never what was turning them.
         *
         * At 0.21 the same five seconds is about sixty degrees, which is a koi
         * changing its mind rather than a koi circling.
         */
        let turn =
          Math.sin(t * 0.21 + k.wander) * 0.14 + Math.sin(t * 0.52 + k.wander * 2.3) * 0.07;

        if (p.active) {
          const dx = k.x - p.worldX;
          const dz = k.z - p.worldZ;
          const d = Math.hypot(dx, dz);
          if (d < SPOOK) {
            // Turn away and go, hard. The point of the dart is not the speed —
            // it is that the fish keeps the heading it fled on afterwards, so
            // a cursor swept over the pond leaves it rearranged rather than
            // springing back to what it was doing.
            //
            // Away, but only so far away. A cursor dropped just ahead of a fish
            // used to ask it for the full turn — up to a hundred and eighty
            // degrees — and a koi that reverses on the spot reads as a bug
            // rather than as a startled animal. It veers instead: at most
            // MAX_VEER off the line it is already on, and if that is not enough
            // to clear the hand then it takes another bite at it next frame,
            // which is what a fish actually does.
            const urgency = 1 - d / SPOOK;
            const away = shortest(Math.atan2(dz, dx) - k.heading);
            const veer = away < -MAX_VEER ? -MAX_VEER : away > MAX_VEER ? MAX_VEER : away;
            turn += veer * urgency * 7;
            if (urgency > k.startle) k.startle = urgency;
          }
        }

        // The edges of the water they are kept to. A fish that reaches one
        // turns along it; it never swims into the bank and it never leaves for
        // the far side, where it would be a smudge under the sun road with no
        // pond around it.
        let outX = 0;
        let outZ = 0;
        if (k.x < KOI_WATER.minX + MARGIN.side) outX += 1;
        if (k.x > KOI_WATER.maxX - MARGIN.side) outX -= 1;
        if (k.z < KOI_WATER.minZ + MARGIN.far) outZ += 1;
        if (k.z > KOI_WATER.maxZ - MARGIN.near) outZ -= 1;
        if (outX !== 0 || outZ !== 0) {
          turn += shortest(Math.atan2(outZ, outX) - k.heading) * 2.6;
        }

        // ...and however many things wanted a turn this frame, the fish can
        // only turn as fast as a fish turns. Without this the three steering
        // terms sum: a startled koi against the far bank was being asked for
        // both at once and came round faster than the eye can read as a turn at
        // all, which is the whole of what "turns abnormally" was.
        if (turn > MAX_TURN) turn = MAX_TURN;
        else if (turn < -MAX_TURN) turn = -MAX_TURN;

        /*
         * What the steering wants is a turn RATE the fish accelerates toward,
         * not one it adopts.
         *
         * Applied straight, the heading changed at whatever rate the terms
         * asked for the instant they asked for it, so every turn started and
         * stopped at full speed. The angle was right and the motion was not —
         * it read as a sprite being rotated, because that is exactly what it
         * was. A fish has mass and the water has grip: it leans into a turn
         * over a fraction of a second and comes out of it the same way.
         *
         * One pole, exponential, frame-rate independent. The time constant is
         * about a fifth of a second, which is long enough to see the entry and
         * short enough that the fish still gets out of the way of a cursor.
         */
        k.omega += (turn - k.omega) * (1 - Math.exp(-dt * 4.6));
        k.heading += k.omega * dt;
        k.startle *= Math.exp(-dt * 1.1);

        /*
         * The tail's phase, integrated here rather than worked out in the
         * shader from a rate.
         *
         * This is what made the tails snap when the water was pushed. The
         * shader had `sin(... - t * beat ...)` and the beat rises with startle,
         * so the instant a fish was spooked the argument of that sine moved by
         * the elapsed time multiplied by the change in rate. A minute into the
         * page that is a jump of several hundred radians — the tail does not
         * speed up, it teleports to an unrelated point in its stroke, every
         * frame the startle is changing. Integrating the phase means the rate
         * can move freely and the stroke stays continuous through it.
         */
        k.tailPhase = (k.tailPhase + (4.2 + 7.0 * k.startle) * dt) % TAU;

        const speed = k.cruise * (1 + 3.2 * k.startle);
        k.x += Math.cos(k.heading) * speed * dt;
        k.z += Math.sin(k.heading) * speed * dt;
        // Steering can be outrun; the pond cannot.
        if (k.x < KOI_WATER.minX) k.x = KOI_WATER.minX;
        if (k.x > KOI_WATER.maxX) k.x = KOI_WATER.maxX;
        if (k.z < KOI_WATER.minZ) k.z = KOI_WATER.minZ;
        if (k.z > KOI_WATER.maxZ) k.z = KOI_WATER.maxZ;
      }

      write();
    },
  };
}

/**
 * One koi, drawn on the pond floor.
 *
 * Two things make a shape read as a koi rather than as a fish-coloured smear,
 * and neither of them is detail.
 *
 * The first is the outline, and the outline is proportion. A koi seen from
 * above is a blunt rounded snout that opens out fast into shoulders about a
 * fifth of its length across, the widest point a third back where the pectorals
 * hang off it, a long straight run aft, and a peduncle that narrows to a *wrist*
 * rather than to a point — because a wrist is what makes the fork of the tail
 * look attached to something. All of that is written down below as widths at
 * named stations rather than left to one smooth lozenge function.
 *
 * The second is the marking, and the marking has to be *placed*. Thresholding a
 * noise field is a coin toss per fish: a body is only three or four noise cells
 * long, so what comes out is banded, or is nearly all red — and nearly all red
 * at this size is precisely the orange smear. So the blotches go where a
 * kohaku's blotches go, two or three of them down the back, and the noise is
 * used for one job only, which is tearing their edges. Torn and hard: a
 * kohaku's red is a piece of paper laid on, and read with any softness at all
 * it stops being a marking and becomes a gradient.
 *
 * All of it stays inside the water's own fragment shader, because that is what
 * pays for the refraction and the depth fade: this is sampled at a point the
 * wave above has already displaced, and the answer is veiled by how much water
 * is over it. A mesh under the surface would have to give both of those up.
 */
export const KOI_GLSL = /* glsl */ `
uniform vec3 uKoiBody;   // the white a kohaku is mostly made of
uniform vec3 uKoiMark;   // the crimson laid on it
uniform vec3 uKoiSumi;   // the black a showa is grounded in

/**
 * Half the body's width at s, where s is 0 at the nose and 1 at the wrist, in
 * units of half the body length — so the body is 2 long and about half a unit
 * across, and a koi is a bit over four times as long as it is wide.
 *
 * The two factors are the two halves of a fish. The first is the head, raised
 * to a fractional power so the snout comes to a *round* end rather than a
 * wedge and opens out steadily to the shoulders. It reaches full width at a
 * third of the body rather than at a fifth, because a fifth leaves an eighth of
 * the animal at one constant width, and a constant width is a slab: a koi is
 * widest at the pectorals and is narrowing, however slightly, everywhere else.
 *
 * The second is the run aft, which takes it down to a wrist you could hold
 * rather than to a point. That wrist is the number that matters most after the
 * width — a peduncle tapered to nothing leaves the tail looking like something
 * following the fish rather than something attached to it.
 */
float koiHalfWidth(float s) {
  float head = pow(clamp((s + 0.012) / 0.30, 0.0, 1.0), 0.34);
  float run = 1.0 - 0.78 * smoothstep(0.40, 1.03, s);
  return 0.235 * head * run;
}

float koiAt(vec4 k, vec4 form, float bend, vec2 p, float t, out vec3 col) {
  col = uKoiBody;

  float L = form.x;
  vec2 q = p - k.xy;
  // Into the fish's own frame, where +x is the way it is pointing.
  vec2 f = vec2(q.x * k.z + q.y * k.w, -q.x * k.w + q.y * k.z);
  float u = f.x / L;
  // Wide enough to hold the tail at full spread with the sway on top of it.
  if (u > 1.02 || u < -1.72 || abs(f.y) > L * 0.62) return 0.0;

  // A fish swims by sending a wave down its own length: nothing at the head,
  // everything at the tail. Bending the body rather than rotating the whole
  // shape is most of what separates a koi from a floating leaf.
  //
  // Half the throw it used to have. The wave has to be smaller than the fan it
  // is swinging or the fan folds through itself, and a caudal fin folded
  // through itself is the three grey strips this used to draw.
  float aft = clamp(-u - 0.15, 0.0, 1.2);
  // form.w is a phase, already integrated on the processor -- multiplying a
  // clock by a changing rate is what used to make the tail jump.
  float sway = sin(u * 1.9 - form.w + form.z * 31.0) * 0.055 * aft * aft;

  /*
   * ...and the turn itself, bent into the body rather than applied to it.
   *
   * A fish does not pivot. It throws its head and its tail to the inside of the
   * turn and drives round the resulting arc, so the whole animal is a C for as
   * long as the turn lasts and straightens as it comes out. Drawn without this,
   * a koi changing direction is a rigid shape whose angle happens to be
   * different in each frame -- which is what "too static" was, and no amount of
   * easing the heading fixes it, because the problem is that the silhouette
   * never changes.
   *
   * u squared, minus a third: head and tail swing one way and the belly the
   * other, which is the shape, and it integrates to roughly nothing so the fish
   * does not appear to slide sideways while bending. Signed by which way it is
   * turning, and scaled by how hard -- straight-line swimming is bend zero and
   * costs a multiply.
   */
  sway += bend * (u * u - 0.33) * 0.16;
  float y = f.y / L - sway;
  float ay = abs(y);

  // Nose at 0, wrist of the tail at 1. One unit of s is two units of y, so
  // anything that has to be square — the markings, the torn edges — asks for
  // s twice.
  float s = (1.0 - u) * 0.5;
  // And past the wrist, in the same units y is in.
  float e = (s - 1.0) * 2.0;

  float body = koiHalfWidth(s);
  float bodyM = 1.0 - smoothstep(body - 0.020, body, ay);

  // The caudal fin: a broad fan opening behind the wrist with a shallow notch
  // cut out of the middle of its trailing edge. A koi's is not the deep fork
  // of a fish that goes anywhere — it is a wide, soft V about a quarter of the
  // body long, and getting that proportion right is most of what separates one
  // from a goldfish. Because the fan is measured off the swung centreline it
  // trails and flicks with the wrist rather than being dragged rigidly behind.
  float span = 0.062 + 0.36 * pow(clamp(e / 0.40, 0.0, 1.0), 0.52);
  float reach = 0.33 + 0.13 * smoothstep(0.02, 0.26, ay);
  float tailM = step(0.0, e)
    * (1.0 - smoothstep(span - 0.026, span, ay))
    * (1.0 - smoothstep(reach - 0.05, reach, e));

  // The pectorals: a swept pair a quarter of the way back, hung off the widest
  // part of the body and trailing outward and aft. They are a handful of
  // pixels each at hero size, and they are the difference between a fish and a
  // lozenge — but only just outside the body, because a pair any bigger than
  // this stops reading as fins and starts reading as wings.
  vec2 pv = vec2((u - 0.40) + (ay - 0.20) * 1.15, ay - 0.235) / vec2(0.21, 0.105);
  float pecM = 1.0 - smoothstep(0.60, 1.0, length(pv));

  // Fins are membrane: you see the water through them, and more of the water
  // the nearer the edge you get. Denser at the root than it was, because a
  // caudal that starts at seventy percent is a tail with a gap where it joins
  // the animal.
  float tailA = tailM * (0.96 - 0.26 * smoothstep(0.0, 0.46, e));
  float fin = max(tailA, pecM * 0.78);
  float m = max(bodyM, fin);
  if (m <= 0.002) return 0.0;

  // Which fish this is: the variety is the integer part of the seed and this
  // animal's own number is the fraction. Most of a pond is kohaku — white with
  // a few crimson blotches — a couple are showa, which is the same red over
  // black with the white cut back into it, and one is a plain gold ogon,
  // because a school in which every fish is patterned reads as wallpaper.
  float breed = floor(form.z);
  float g0 = fract(form.z);
  float showa = step(0.5, breed) * step(breed, 1.5);
  float plain = step(1.5, breed);
  vec3 base = mix(mix(uKoiBody, uKoiSumi, showa), mix(uKoiMark, uKoiBody, 0.35), plain);

  /*
   * The marking, which is the whole difference between a koi and an orange
   * fish, and none of it is detail.
   *
   * A kohaku's red is a piece of paper laid on: two or three patches, each one
   * running clear across the back and stopping on a *torn line* that crosses
   * the fish rather than fading along it, with clean white between them. So
   * each patch is a station, a length and a lean, and the noise does one job
   * only — displacing where the two ends of the patch fall, as a function of
   * how far across the fish you are. Adding noise to the mask instead, which is
   * what used to happen, does not tear an edge: on a body four noise cells long
   * it dissolves the patch into leopard spots.
   *
   * The one number that has to be right is the size of a patch against the
   * gap after it. What makes a kohaku read as a kohaku is the *white*: red
   * blocks that meet each other are one long red fish, which is what this drew
   * when the patches were as long as their own spacing, and an orange fish is
   * the thing the whole file exists to avoid. So a patch covers between a
   * third and three quarters of its interval, and one in five does not appear
   * at all.
   */
  float mark = -1.0;
  for (int i = 0; i < 3; i++) {
    float g = fract(g0 * (7.31 + float(i) * 4.17) + float(i) * 0.41);
    float at = 0.17 + float(i) * 0.29 + (g - 0.5) * 0.08;
    float wide = 0.048 + fract(g * 13.7) * 0.055;
    float tear = (fbm3(vec2(y * 5.0, at * 9.0 + g * 37.0)) - 0.5) * 0.13;
    float lean = (fract(g * 29.3) - 0.5) * 5.5;
    float d = abs(s - at + tear) / wide + max(0.0, y * lean);
    mark = max(mark, step(g, 0.80) * (1.0 - d));
  }
  // And one on the wrist for a little over half of them, which is what stops a
  // big pale tail reading as something trailing behind the animal rather than
  // as part of it: it carries colour off the peduncle and onto the fin root.
  float gp = fract(g0 * 19.7);
  float tearP = (fbm3(vec2(y * 5.0, 61.0 + gp * 23.0)) - 0.5) * 0.15;
  mark = max(mark, step(gp, 0.52)
    * (1.0 - abs(s - 0.96 + tearP) / 0.11 - max(0.0, y * (gp - 0.5) * 5.0)));

  // Cut hard, because hard is the whole point — but not harder than a pixel,
  // or the edge crawls. The slope of the mask is one over a patch's half
  // length,
  // so this band is about a hundredth of the fish long.
  float red = smoothstep(-0.10, 0.10, mark) * (1.0 - plain);
  // Off the mouth: a koi's is white almost without exception, and the tip of
  // the nose is where the eye goes first.
  red *= smoothstep(0.004, 0.05, s);
  col = mix(base, uKoiMark, red);
  // A showa carries white as well as red, and in the same cut-out blocks: one
  // low-frequency field thresholded hard, sized so two or three of them land
  // on a fish rather than twenty.
  float sumiWhite = smoothstep(0.46, 0.54, fbm3(vec2(s * 2.0, y) * 1.1 + 17.0));
  col = mix(col, uKoiBody, showa * sumiWhite * (1.0 - red));

  // The dorsal, seen edge-on from above: a thin darker line down the spine
  // through the middle half of the back. It is two or three pixels wide at
  // hero size and it is worth them, because it is the one mark that says which
  // way up the animal is.
  float dorsal = (1.0 - smoothstep(0.018, 0.05, ay))
    * smoothstep(0.30, 0.38, s) * (1.0 - smoothstep(0.74, 0.86, s));
  col *= 1.0 - 0.30 * dorsal * bodyM;

  // Eyes, set wide on the head where a fish's are. Small, dark, and the reason
  // the blunt end reads as a head rather than as the end of a lozenge.
  float eye = 1.0 - smoothstep(0.020, 0.032, length(vec2((s - 0.085) * 2.0, ay - 0.115)));
  col = mix(col, uKoiSumi * 0.7, eye * bodyM);

  // A fish is round, and from directly above the spine is the part nearest the
  // surface: the flanks curve away under the water and go out with it. One
  // smoothstep, and it is the only form these get.
  col *= 1.05 - 0.32 * smoothstep(0.30, 1.05, ay / max(body, 0.02));

  // The fins are the same paper the body is — they take whatever the marking
  // left at their root and give it up toward the tips, which is why a red
  // wrist gives a red-rooted tail and a white one does not.
  col = mix(col, mix(col, uKoiBody, 0.22) * 0.94, fin * (1.0 - bodyM));
  return m;
}
`;
