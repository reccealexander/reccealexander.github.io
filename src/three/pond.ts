/**
 * The pond: where the water starts, and the one surface everything on it agrees
 * about.
 *
 * Three things read this. The field stops at the waterline, the ground stops at
 * it too, and the petals lying on the surface ride the same ripple the water is
 * drawn with — and a petal floating a centimetre off the wave it is supposed to
 * be in is the whole illusion gone. So the numbers live here once and the GLSL
 * is generated from them rather than typed out a second time.
 */

import type { SwayPointer } from "./sway";

/** GLSL has no integer-to-float promotion, so every constant is emitted long. */
const f = (n: number) => n.toFixed(5);

export const BANK = {
  /**
   * The waterline, in metres of z.
   *
   * Fixed by the two cameras that care. The hero is pitched down past half its
   * field of view and frames the ground from about z 0.45 at the very bottom of
   * the frame out to z -4.3 at the top, so the waterline sits within fifteen
   * centimetres of the bottom edge: the sedge standing on the bank tops out a
   * seventh of the way up the picture and everything above that is water, which
   * is the composition the hero was always meant to have. It used to be at
   * -0.12, which put the fringe a third of the way up and made this a shot of a
   * bank with a pond behind it.
   *
   * The other end of the journey is what stops it coming any nearer. Every
   * camera below the hero reads the plant at z 0.8 from about z 0.9, and the
   * water has to stay behind the plant: at this figure the bank still has half
   * a metre of run-up in front of the flower and the low cameras are all
   * standing on dry ground with the water opening out just past it.
   */
  z: 0.3,
  /**
   * How far the edge wanders either side of that, so it is not a ruled line.
   *
   * Smaller than it was, because the edge now lies along the bottom of the hero
   * frame rather than across the middle of it: the same wander that read as a
   * shoreline out in open ground takes the water off the bottom of the picture
   * in one place and a fifth of the way up it in the next.
   */
  meander: 0.17,
  /**
   * One long lobe where the bank bellies out into the water.
   *
   * This used to be a bay curling in *behind* the plant, and it was there
   * because the waterline was a metre out and the low cameras could not see
   * past the grass in front of it. With the edge brought in to the bottom of
   * the frame that job is done everywhere, and a lobe reaching to within twenty
   * centimetres of the flower is now the one thing that could put water where
   * the plant is standing. So it is smaller, shallower, and moved a metre and a
   * half along the shore, where all it does is stop the edge reading as one
   * band of noise at a single scale.
   */
  bay: { x: -1.15, reach: 0.14, width: 0.8 },
  /**
   * How far back from the water the planting runs, and how far along it.
   *
   * Nothing in the journey ever frames ground past z 1.3 — the camera is
   * standing on it by then — so a strip under three metres deep covers every
   * shot, and the clumps that would have gone behind the lens go into the bank
   * you can actually see instead.
   */
  depth: 2.8,
  halfWidth: 6,
  /**
   * A bank is about an eighth of the meadow's area, so a field's worth of
   * clumps planted into it is a hedge rather than a bank. Somewhat over half
   * again the meadow's density, which is dense enough to read as a fringe from
   * the hero and open enough that the silt shows between the clumps from the
   * four chapters spent lying on it.
   */
  clumpShare: 0.22,
};

/**
 * The waterline at x. The GLSL twin below is generated from the same numbers.
 *
 * Five sine trains, not two. The first two are the shape of the pond — where
 * the bank bellies out and where it falls back — and they are the only ones
 * big enough to see from the hero. The last three are wavelengths of a metre,
 * seventy centimetres and thirty, and they exist because a shoreline drawn
 * with two long waves is a curve, and a curve read against flat water is a
 * line someone drew. Ground that has water running over it is eaten at every
 * scale at once. None of the five is a harmonic of another, so the edge never
 * repeats along its own length.
 *
 * Everything that has to know where the water is reads this — the field plants
 * to it, the soil's relief dies at it, the grass, the ground and the water
 * itself all cut on it — so the break has to live here rather than in one
 * shader, or the surfaces disagree and the disagreement is a gap.
 */
export function bankEdgeZ(x: number): number {
  const d = (x - BANK.bay.x) / BANK.bay.width;
  return (
    BANK.z +
    Math.sin(x * 1.13 + 0.7) * BANK.meander * 0.62 +
    Math.sin(x * 0.41 - 1.9) * BANK.meander * 0.38 +
    Math.sin(x * 6.1 + 2.4) * 0.046 +
    Math.sin(x * 9.7 - 0.8) * 0.024 +
    Math.sin(x * 21.3 + 1.1) * 0.009 +
    BANK.bay.reach * Math.exp(-d * d)
  );
}

export const BANK_GLSL = /* glsl */ `
float bankEdgeZ(float x) {
  float d = (x - ${f(BANK.bay.x)}) / ${f(BANK.bay.width)};
  return ${f(BANK.z)}
    + sin(x * 1.13 + 0.7) * ${f(BANK.meander * 0.62)}
    + sin(x * 0.41 - 1.9) * ${f(BANK.meander * 0.38)}
    + sin(x * 6.1 + 2.4) * 0.046
    + sin(x * 9.7 - 0.8) * 0.024
    + sin(x * 21.3 + 1.1) * 0.009
    + ${f(BANK.bay.reach)} * exp(-d * d);
}
`;

/**
 * How far the wet margin lies out over the water, in metres.
 *
 * A shore is not a line. There is a strip where the silt is under a film of
 * water and neither "land" nor "water" is the right answer, and drawing it is
 * most of what stops the pond looking like a hole cut in the bank. It is the
 * bank's sheet that draws it — that sheet is a couple of millimetres above the
 * water, so it simply covers it — and the only thing the two surfaces have to
 * agree about is the colour where the strip ends, which they both get from
 * `shallowBed` below.
 */
export const MARGIN = 0.24;

/**
 * How far the margin reaches at a given point along the shore — and it is never
 * negative.
 *
 * The bank's sheet is what covers the soil under it, so an edge that wandered
 * *landward* of the waterline would open a notch of dry earth in the middle of
 * the water. Every break in this edge is therefore the film running further
 * out, never further back, and the two scales are the two scales a real
 * waterline is broken at: the twenty-centimetre lobes where a shelf of silt
 * lies out under the surface, and the three-centimetre bites the grit it runs
 * over takes out of them.
 */
export const SHORE_GLSL = /* glsl */ `
float shoreMargin(vec2 p) {
  // Three scales, summed and cut once rather than thresholded against each
  // other. The product of two thresholds is islands: it does not break an
  // edge, it dissolves it into confetti, which is a different thing from a
  // shore. The scales are the three a real waterline is broken at — the
  // half-metre shelf of silt lying out under the surface, the ten-centimetre
  // lobes of it, and the grit at the fingertip that takes bites out of those.
  // The finest carries almost no weight and does almost all of the work,
  // because what stops an edge reading as drawn is not how far it wanders but
  // whether it wanders at a scale smaller than the thing it runs over.
  float shelf =
      fbm3(p *  2.2 + 3.7) * 0.56
    + fbm3(p *  9.0 - 1.3) * 0.30
    + fbm3(p * 34.0 + 7.1) * 0.14;
  // Never fully closed and never fully open: the margin keeps a couple of
  // centimetres of film everywhere, so the shore is a strip belonging to
  // neither side along its whole length rather than a strip in some places and
  // a cut in the others.
  return ${f(MARGIN)} * (0.10 + 0.90 * smoothstep(0.26, 0.68, shelf));
}
`;

/**
 * How far the silt sheet stands over the floor it is laid on, and the relief
 * modelled into it — both in metres.
 *
 * The height is the interesting number. It used to be two and a half
 * millimetres, which is a plausible thickness for a film of mud and is not
 * nearly enough: the modelled soil patch under it is drawn with a polygon
 * offset, and a polygon offset read at two degrees off edge-on — which is
 * every pixel of the last two acts — is worth centimetres of ground. So the
 * soil won everywhere the camera was lying down, and what the reader saw was
 * the *soil's* shading, three mottle fields multiplied together on a base this
 * dark, coming through the silt in ribbons. This clears it honestly, and the
 * sheet carries a matching offset of its own so nothing is left to a tie.
 *
 * The relief is here because the sheet is one plane and the four acts spent
 * lying on it can tell. Three crossing pairs of sines, none of them a harmonic
 * of another, at the scale of the swell wet silt actually has — a couple of
 * millimetres over a hand's width. It is solved on the processor into the
 * geometry rather than sampled in the shader, because it is static, and
 * because a silhouette is the one thing a fragment shader cannot give you.
 */
export const SILT_Y = 0.008;

export function siltRelief(x: number, z: number): number {
  return (
    0.0040 * Math.sin(x * 2.7 + 0.6) * Math.sin(z * 3.1 - 1.2) +
    0.0022 * Math.sin(x * 6.3 - 2.1) * Math.sin(z * 5.4 + 0.8) +
    0.0011 * Math.sin(x * 13.1 + 1.4) * Math.sin(z * 11.7 - 0.3)
  );
}

/**
 * How deep into the bank the water still reaches, in metres.
 *
 * The fringe of trodden silt, the blossom that has washed up in it and the
 * light coming off the surface all die out over the same distance, because they
 * are all the same fact — that the water is just there. Two of those are
 * planted on the processor and one is drawn in a shader, so the number lives
 * here rather than three times over.
 */
export const SHORE = 0.34;
export const SHORE_LIGHT = 1.1;

/**
 * The light the water throws back onto the bank.
 *
 * This is what a pond looks like from a camera too low to see the pond: you
 * cannot see the surface from down among the sedge, but the broken sun coming
 * off it crosses the mud and the bottom of every stem in slow, wandering
 * lines, and nothing else in nature does that. It is the one cue that survives
 * the whole second half of the journey, so it is worth two noise lookups.
 *
 * The lines are the ridge where two slowly drifting fields sum to one. Reading
 * the ridge rather than thresholding a single field is what makes them thin
 * and sinuous instead of blobby, and drifting the two at different rates is
 * what stops the pattern marching in one direction like a conveyor.
 */
export const BANK_LIGHT_GLSL = /* glsl */ `
float bankLight(vec2 p, float t) {
  float a = vnoise(vec2(p.x * 4.6, p.y * 2.3 - t * 0.13));
  float b = vnoise(vec2(p.x * 7.9 + t * 0.09, p.y * 3.7 + t * 0.06));
  return max(1.0 - abs(a + b - 1.0) * 3.4, 0.0);
}
`;

/**
 * What the pond looks like where you can see the bottom of it.
 *
 * Within a hand's width of the shore a pond is a few centimetres deep, so what
 * you are looking at is the silt with the water sitting on it rather than in
 * front of it — the bed's own mottle, the gravel that has washed into the
 * shallows, and only a fraction of the body colour. That is the second half of
 * why the coastline stops being an edge: the water arrives at the bank already
 * the colour of the bank.
 *
 * Both sides compute it here from the same two stops and the same gravel
 * field, so the wet margin can lie out over the water and leave nothing at the
 * join for the eye to catch.
 */
export const SHALLOW_GLSL = /* glsl */ `
vec3 shallowBed(vec2 p, float px, vec3 silt, vec3 deep) {
  float gravel = smoothstep(0.58, 0.90, fbm3(p * 26.0 + 11.0, px * 26.0));
  vec3 bed = silt * (0.86 + 0.58 * fbm3(p * 9.0, px * 9.0));
  bed = mix(bed, silt * 2.3, gravel * 0.60);
  // Only a sixth of the body colour, where it used to be a third. Two
  // centimetres of water over pale silt is *lighter* than the pond behind it,
  // not darker — that is the whole reason a shore reads as shallowing rather
  // than as a step — and pulling the bed a third of the way to a near-black
  // deep stop was putting a dark seam along the waterline in the one place the
  // eye was already looking for a line.
  return mix(bed, deep, 0.17);
}
`;

/**
 * The tree you are standing under.
 *
 * There is no sky in this scene and there cannot be one, so the top of the hero
 * has nothing in it but more water — and a frame that is water edge to edge
 * reads as a plan rather than as a place you are standing in. What fixes that
 * is not a horizon, it is an *overhang*: the ends of a few boughs hanging into
 * the top of the picture, which put the reader under something and give the
 * water a near edge to be seen past.
 *
 * The whole trick is in the ceiling. The hero's top edge is the plane
 * `y = ceilY + ceilSlope * z` — that is the top-of-frame ray written as a line,
 * measured off the real camera — so a bough held a hand's width under it runs
 * along the top of the picture for its whole length however far away it is,
 * and one held further under dips into frame. Every bough here is placed as a
 * *dip* below that plane rather than as a height, which is why the canopy is a
 * band along the top of the hero rather than a cluster of branches at one
 * distance and nothing at the others.
 *
 * Nothing is allowed nearer than `maxZ`, and that is the constraint that costs
 * the most: from the bloom onward the camera stands between z 0.85 and z 1.2
 * with the plant in front of it, and a bough anywhere in that corridor is a
 * brown wall across four acts.
 */
export const CANOPY = {
  ceilY: 2.08,
  ceilSlope: 0.5,
  /**
   * How far out over the water the boughs reach, and how near they may come.
   *
   * Both moved about a metre toward the camera, which is how the reflection
   * gets nearer the shore. A reflection lands where the line from the lens to
   * the branch's mirror image crosses the water, so the only way to bring it
   * down the frame is to bring the thing being reflected nearer — and the
   * branches themselves do not move on screen when that happens, because they
   * are placed against the top-of-frame ray (see ceilY/ceilSlope above): a
   * bough held a fixed amount under that ray runs along the top of the picture
   * for its whole length however far away it is.
   */
  minZ: -2.0,
  maxZ: 1.1,
  /** Bark: the shaded underside of a bough, then its lit top. Flat, decided. */
  bark: ["#2b1d15", "#4e3728"] as const,
  /**
   * Autumn, dealt per leaf. Warm against everything else in this biome, which
   * is cold water and cold green — the leaves are the only thing in the frame
   * that is not, and that is what makes them read as a season rather than as
   * foliage.
   *
   * Pitched dark for a warm colour, because the hero's type sits on this with
   * no scrim and a canopy is a fifth of that frame: a maple read at the value
   * autumn actually has would be the brightest thing on the page by a factor of
   * five, and the one hard rule here is that nothing may average brighter than
   * a mid-dark green. These are hue, not light.
   */
  leaf: ["#e0451f", "#f26a38", "#c9331a", "#f28a4c", "#ffb478"] as const,
  /** Leaves per bough system, by what the machine can spare. */
  /*
   * Raised again with the maple outline, which is not the same request twice.
   *
   * The blank each leaf is cut from is now a good deal wider than the leaf, and
   * roughly a third of it is discarded to make the lobes and sinuses. That is
   * the point -- the gaps between the points are as much of a maple as the
   * points are -- but it means the same count covers noticeably less sky, and
   * the crown came back thinner than the count that was chosen for it.
   */
  leaves: { low: 800, medium: 1500, high: 2250 } as Record<string, number>,
};

/**
 * The sheet the water is drawn on, a little under the still-water line.
 *
 * The ripple is painted onto a flat plane while the petals genuinely ride it,
 * so a petal sitting in a trough would otherwise be clipped by the water it is
 * floating on. Dropping the plane below the deepest trough is a centimetre of
 * lie that nothing at these viewing angles can see, and it is much cheaper than
 * tessellating ninety metres of pond to displace it honestly.
 */
export const WATER_Y = -0.03;

/**
 * The water the koi and the blossom are allowed in.
 *
 * Held off the bank by more than a fish is long, and stopped well short of the
 * fog: past about five metres the pond is haze, and a koi out there is a smudge
 * with no water around it.
 */
export const POND = {
  minX: -3.7,
  maxX: 3.7,
  minZ: -5.0,
  // Brought in with the waterline. The shore's lowest point is now around z
  // 0.13, so this still keeps the better part of half a metre of water between
  // a fish and the silt, and it puts the near end of the school inside the
  // first metre of open water — which from the hero is the water that is
  // biggest on screen and clearest through.
  maxZ: -0.3,
};

/**
 * The narrower box the koi keep to, inside that.
 *
 * Blossom belongs to the whole pond — it is weather, and weather that stopped
 * three metres out would draw a line across the water. Fish are the opposite:
 * they are the thing being looked at, and where they are is a composition
 * question, not a habitat one.
 *
 * From the hero the frame runs from about z 0.45 at the bottom edge to z -4.3
 * at the top, and the sun's road lands across the far third of it. Fish out
 * there are behind the glitter and half a centimetre long. In here they are in
 * the two metres of water below it, which is the water that is
 * biggest on screen, clearest through — the Fresnel term hands the near water
 * back as a window — and nearest the reader, so they read as being under the
 * water you are standing at the edge of rather than out in the middle of it.
 *
 * The near edge is where it is because of what a koi is shaped like rather
 * than where it looks best: half a metre of nose and tail hangs off the number
 * below, and the water's own shoreline comes as near as z 0.05, so a fish
 * centred any nearer than this swims its head into the discard.
 */
export const KOI_WATER = {
  minX: -3.2,
  maxX: 3.2,
  minZ: -2.45,
  maxZ: -0.34,
};

/**
 * The dent the cursor is making in the surface.
 *
 * Shared state, in the same spirit as the pointer itself: the water steps it
 * once a frame and everything else on the pond reads it, because two components
 * decaying their own copy of the same ring is two rings that slowly disagree.
 */
export const ripple = { x: 0, z: 0, amp: 0 };

export function stepRipple(p: SwayPointer & { speed: number }, dt: number) {
  const follow = Math.min(1, dt * 9);
  if (p.active) {
    ripple.x += (p.worldX - ripple.x) * follow;
    ripple.z += (p.worldZ - ripple.z) * follow;
  }
  // A finger dragged through water leaves rings that take a second or two to
  // die, and one held still leaves none — so the rise is fast and the fall is
  // slow, which is the asymmetry a spring would not give.
  const drive = p.active ? Math.min(1, p.speed * 1.7) : 0;
  const rate = drive > ripple.amp ? 7 : 1.5;
  ripple.amp += (drive - ripple.amp) * Math.min(1, dt * rate);
}

/**
 * The surface itself.
 *
 * Six crossing trains on deliberately unrelated wavelengths and speeds, none of
 * them a harmonic of another, so the pond never pulses. The three shortest
 * carry almost no height and almost all of the slope: they are there for the
 * sun to break on, and the height a floating petal rides comes from the long
 * swell underneath them.
 *
 * The chop is laid on ground the swell has already dragged sideways. Six plain
 * sine trains always settle into a lattice, and once the surface is painted
 * with enough contrast to see the ripple at all, that lattice reads as woven
 * fabric rather than as water. Warping the short trains by the slope of the
 * long ones scrambles the interference for one multiply-add and no extra
 * trigonometry, and it also does what a real pond does — the chop rides the
 * swell instead of ignoring it.
 */
export const WAVE_GLSL = /* glsl */ `
uniform vec3 uRipple;   // where the cursor is dragging, and how hard

void waveTrain(inout float h, inout vec2 g, vec2 p, vec2 dir, float k, float amp, float sp, float t) {
  float ph = dot(p, dir) * k + t * sp;
  h += amp * sin(ph);
  g += dir * (k * amp * cos(ph));
}

/**
 * Height and slope at p. The fine parameter fades the two shortest trains out
 * with distance: at ten metres a nine-centimetre ripple is well under a pixel,
 * and left in it is a field of moire rather than water.
 */
void waterSurface(vec2 p, float t, float fine, out float h, out vec2 g) {
  h = 0.0;
  g = vec2(0.0);
  // Every train is at a little over half the amplitude it was.
  //
  // Calming the water is not only its own request — it is most of how the
  // reflection arrives. The mirror ray is bent by this slope before it is
  // traced, so the chop that used to be here scattered the canopy's hit point
  // by half a metre and gave back a tree torn into streaks. Halve the slope and
  // the same trace returns something with a branch's shape still in it.
  //
  // The two shortest trains come down furthest, proportionally. They carry no
  // silhouette at all at this range — all they ever contributed was a fizz on
  // the surface, and a fizz is exactly what stops a reflection resolving.
  waveTrain(h, g, p, vec2( 0.90,  0.44), 2.42, 0.0050, 0.55, t);
  waveTrain(h, g, p, vec2(-0.62,  0.79), 4.10, 0.0034, 0.80, t);

  vec2 q = p - g * 2.0;
  waveTrain(h, g, q, vec2( 0.31, -0.95), 11.30, 0.0019, 1.35, t);
  waveTrain(h, g, q, vec2( 0.97, -0.24), 24.70, 0.00090, 2.00, t);

  vec2 r2 = p - g * 1.1;
  waveTrain(h, g, r2, vec2(-0.71, -0.70), 47.30, 0.00038 * fine, 2.90, t);
  waveTrain(h, g, r2, vec2( 0.42,  0.91), 71.00, 0.00022 * fine, 3.60, t);

  // The cursor. A pond answers a finger by ringing outward from it, which is a
  // radial motion and cannot be folded into any of the crossing trains above.
  vec2 d = p - uRipple.xy;
  float r = length(d) + 1e-4;
  if (r < 1.3 && uRipple.z > 0.002) {
    float fall = 1.0 - smoothstep(0.12, 1.3, r);
    float ph = r * 26.0 - t * 7.0;
    float amp = 0.0045 * uRipple.z * fall;
    h += amp * sin(ph);
    g += (d / r) * (26.0 * amp * cos(ph));
  }
}

vec3 waterNormal(vec2 g) {
  return normalize(vec3(-g.x, 1.0, -g.y));
}
`;

/**
 * How much of the world one pixel of screen covers.
 *
 * A shader has no way to ask how big the canvas is or what the camera's field
 * of view was set to this frame, so the angle one pixel subtends is worked out
 * on the processor and handed over — the sway grid's trick again. Everything
 * that has to decide whether a grain is detail or aliasing reads this.
 *
 * The answer is not distance. A surface the camera is lying on runs away from
 * it, and a pixel landing on ground that is two degrees off edge-on covers
 * thirty times what the same pixel covers directly below the lens — which is
 * why the pond's bank was the one surface in this scene that banded.
 */
export const PIXEL_GLSL = /* glsl */ `
uniform float uPixel;

float groundPixel(vec3 world, vec3 nrm) {
  vec3 toCam = cameraPosition - world;
  float dist = length(toCam);
  return dist * uPixel / max(abs(dot(toCam / dist, nrm)), 0.03);
}
`;

/** The vertical angle one pixel subtends, which is what `uPixel` wants. */
export function pixelAngle(fovDegrees: number, pixelHeight: number): number {
  return (2 * Math.tan((fovDegrees * Math.PI) / 360)) / Math.max(pixelHeight, 1);
}

/** Value noise, same construction the soil uses — one place, two surfaces. */
export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

float fbm3(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p *= 2.17;
    amp *= 0.52;
  }
  return sum;
}

/**
 * The same three octaves, with the ones finer than the pixel they land in taken
 * out. The second argument is the width of one pixel of screen measured on the
 * ground, in the same units p is in.
 *
 * This matters on the bank and nowhere else, because the bank is the one
 * surface this journey lies down on: from twelve centimetres up, ground two
 * metres away is a couple of degrees off edge-on and a single pixel spans
 * several centimetres of it. A millimetre grain read there is not grain — it is
 * a field sampled far under its own period, which is a moire, and a moire on a
 * slowly moving camera is exactly the banded ribbon that crawls up the shore.
 *
 * Each octave fades toward the field's own mean rather than toward zero, so
 * losing one costs detail and never brightness: distance flattens this ground
 * out, it does not darken it.
 */
float fbm3(vec2 p, float px) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * mix(vnoise(p), 0.5, smoothstep(0.30, 1.0, px));
    p *= 2.17;
    px *= 2.17;
    amp *= 0.52;
  }
  return sum;
}
`;
