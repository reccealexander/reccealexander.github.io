import { BufferAttribute, BufferGeometry, type Matrix4 } from "three";

/**
 * A petal, as a parametric sheet rather than a flat card.
 *
 * `u` runs base to tip, `v` across it. Two curvatures do all the work: the
 * cup, which lifts the long edges, and the curl, which bends the whole blade
 * back — a petal with neither reads as a paper cut-out the moment the light
 * moves across it, and every petal here is either backlit or standing in front
 * of the sun.
 */
/** A petal's mid-surface: a (nu + 1) × (nv + 1) grid, `u` base to tip. */
export type PetalSurface = {
  pos: Float32Array;
  uv: Float32Array;
  index: number[];
  nu: number;
  nv: number;
  thickness: number;
  thicknessTip: number;
};

export type PetalOptions = Parameters<typeof petalSurface>[0];

export function petalGeometry(opts: PetalOptions = {}): BufferGeometry {
  return petalSolid(petalSurface(opts));
}

export function petalSurface({
  length = 1,
  width = 0.42,
  cup = 0.22,
  curl = 0.28,
  tip = 0.85,
  nu = 18,
  nv = 9,
  thickness = 0,
  thicknessTip = thickness * 0.35,
  ruffle = 0,
  ruffleWaves = 6,
  rufflePhase = 0,
  lean = 0,
  twist = 0,
  asym = 0,
  wobble = 0,
  wobblePhase = 0,
  claw = 0,
}: {
  length?: number;
  width?: number;
  cup?: number;
  curl?: number;
  /** How pointed the end is: 1 is a needle, 0.5 a round-ended paddle. */
  tip?: number;
  nu?: number;
  nv?: number;
  /**
   * Make it a solid: the sheet becomes a shell this thick at the base (and
   * `thicknessTip` at the tip), with an edge you can see. Zero keeps the
   * single sheet every other caller wants.
   */
  thickness?: number;
  thicknessTip?: number;
  /** Ripple along the margins, absolute height, and how many waves base to tip. */
  ruffle?: number;
  ruffleWaves?: number;
  rufflePhase?: number;
  /** Sideways bend of the whole blade, as a fraction of its length at the tip. */
  lean?: number;
  /** Radians of twist about the midrib by the tip. */
  twist?: number;
  /** One half wider than the other, as a fraction. */
  asym?: number;
  /** Unevenness of the outline, as a fraction of the width. */
  wobble?: number;
  wobblePhase?: number;
  /**
   * Narrow the base into a claw over this fraction of the length. A petal
   * that is four-fifths of its full width a fifth of the way out cannot share
   * a ring with seven others without them crowding through each other at the
   * centre; a real one tapers to a stalk where it leaves the receptacle.
   */
  claw?: number;
} = {}): PetalSurface {
  const rows = (nu + 1) * (nv + 1);
  const positions = new Float32Array(rows * 3);
  const uvs = new Float32Array(rows * 2);
  const indices: number[] = [];

  const halfWidth = (u: number) =>
    Math.pow(Math.sin(Math.PI * Math.pow(u, 0.78)), tip) *
    width *
    0.5 *
    (claw > 0 ? Math.pow(Math.min(1, u / claw), 0.85) : 1);
  const maxHalf = width * 0.5;

  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    // The outline, wobbled: no real petal margin is a clean curve.
    const w = halfWidth(u) * (1 + wobble * Math.sin(u * 23 + wobblePhase) * Math.sin(Math.PI * u));
    const spine = curl * u * u * length * 0.5;
    const turn = twist * u;
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1;
      const o = (i * (nv + 1) + j) * 3;
      const wv = w * (1 + asym * v);
      const x0 = v * wv;
      let y0 = -cup * v * v * wv;
      // Ruffled margins, tapering with the width so the tip and base stay
      // single points rather than fanning open.
      y0 += ruffle * Math.sin(u * ruffleWaves * Math.PI + rufflePhase) * v * v * (wv / maxHalf);
      positions[o] = x0 * ct - y0 * st + lean * u * u * length;
      positions[o + 1] = x0 * st + y0 * ct + spine;
      positions[o + 2] = u * length;
      const t = (i * (nv + 1) + j) * 2;
      uvs[t] = (v + 1) * 0.5;
      uvs[t + 1] = u;
    }
  }

  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return { pos: positions, uv: uvs, index: indices, nu, nv, thickness, thicknessTip };
}

/** Full thickness of a surface at grid vertex (i, j). */
export function petalThicknessAt(s: PetalSurface, i: number, j: number): number {
  if (!s.thickness) return 0;
  const u = i / s.nu;
  const v = (j / s.nv) * 2 - 1;
  const tu = s.thickness + (s.thicknessTip - s.thickness) * Math.pow(u, 0.8);
  return tu * (1 - 0.55 * v * v);
}

/** Apply a matrix to a surface's points, in place. */
export function transformSurface(s: PetalSurface, m: Matrix4): PetalSurface {
  const e = m.elements;
  const p = s.pos;
  for (let k = 0; k < p.length; k += 3) {
    const x = p[k];
    const y = p[k + 1];
    const z = p[k + 2];
    p[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
    p[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    p[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return s;
}

/** The surface as a mesh: a single sheet, or a shell if it has thickness. */
export function petalSolid(s: PetalSurface): BufferGeometry {
  const { pos: positions, uv: uvs, index: indices, nu, nv } = s;
  const rows = (nu + 1) * (nv + 1);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions.slice(), 3));
  geo.setAttribute("uv", new BufferAttribute(uvs.slice(), 2));
  geo.setIndex(indices.slice());
  geo.computeVertexNormals();
  if (!s.thickness) return geo;
  /*
   * Thickened: the sheet is the mid-surface, pushed out along its normal to a
   * top and pulled in to a bottom, with a strip round the two long margins to
   * close it. Thickest at the base and down the midrib, thinning to the tip
   * and the edges, which is how a petal is built and why its edge catches the
   * light as a fine bright line rather than a slab.
   */
  const nrm = geo.attributes.normal;
  const top = new Float32Array(rows * 3);
  const bottom = new Float32Array(rows * 3);
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const k = i * (nv + 1) + j;
      const h = petalThicknessAt(s, i, j) * 0.5;
      for (let c = 0; c < 3; c++) {
        const n = c === 0 ? nrm.getX(k) : c === 1 ? nrm.getY(k) : nrm.getZ(k);
        top[k * 3 + c] = positions[k * 3 + c] + n * h;
        bottom[k * 3 + c] = positions[k * 3 + c] - n * h;
      }
    }
  }
  const sheet = (pos: Float32Array, flip: boolean) => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("uv", new BufferAttribute(uvs.slice(), 2));
    const idx = flip ? indices.slice() : indices;
    if (flip) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
    g.setIndex(idx);
    return g;
  };
  // The margin strip, one for each long edge.
  const rim = (j: number) => {
    const pos = new Float32Array((nu + 1) * 2 * 3);
    const uv = new Float32Array((nu + 1) * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i <= nu; i++) {
      const k = i * (nv + 1) + j;
      pos.set(top.subarray(k * 3, k * 3 + 3), i * 6);
      pos.set(bottom.subarray(k * 3, k * 3 + 3), i * 6 + 3);
      uv.set([j === 0 ? 0 : 1, i / nu, j === 0 ? 0 : 1, i / nu], i * 4);
      if (i < nu) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("uv", new BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  geo.dispose();
  return mergeGeometries([sheet(top, false), sheet(bottom, true), rim(0), rim(nv)]);
}


/**
 * Push overlapping petals apart so they rest on each other instead of passing
 * through.
 *
 * The surfaces are in one shared frame, with +y up the flower's axis. Each pair
 * is (lower, upper): wherever the upper sheet comes closer to the lower one
 * than their two half-thicknesses and a hair, both move — half each, along the
 * lower one's normal — and the moves are smoothed across the grid so the
 * correction is a gentle lift rather than a dent. Iterated, because moving one
 * pair can bring another into contact.
 *
 * Only vertices further than `minRadius` from the axis take part: inside it
 * the petals all converge on the centre, where the disc above and the
 * receptacle below hide them anyway, and separating eight sheets that meet at
 * a point is not a problem with an answer.
 */
type SeparateOptions = {
  margin?: number;
  minRadius?: number;
  iterations?: number;
  tolerance?: number;
  verify?: boolean;
};
type SeparateResult = { pushed: number; residual: number };

export function separateSurfaces(
  surfaces: PetalSurface[],
  pairs: readonly (readonly [number, number])[],
  options: SeparateOptions = {},
): SeparateResult {
  const steps = separateSteps(surfaces, pairs, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * The same work as `separateSurfaces`, as a generator that hands the thread
 * back after every pair and every surface — a millisecond or two each — so it
 * can be run in idle time without ever holding up a frame.
 */
export function* separateSteps(
  surfaces: PetalSurface[],
  pairs: readonly (readonly [number, number])[],
  {
    margin = 0.0004,
    minRadius = 0,
    iterations = 6,
    /** Stop once nothing is closer than this to touching; a tenth of a
        millimetre on a two-millimetre petal is not visible. */
    tolerance = 0.0001,
    /** Measure what is left afterwards — a full extra pass, so only for checks. */
    verify = false,
  }: SeparateOptions = {},
): Generator<void, SeparateResult> {
  const normals = surfaces.map((s) => new Float32Array(s.pos.length));
  const moves = surfaces.map((s) => new Float32Array(s.pos.length));
  let pushed = 0;

  /*
   * Each petal's slice of the flower, as a bearing about the axis and a half
   * width. A vertex whose bearing is outside a neighbour's slice cannot be
   * over it, and most of every petal is outside its neighbours' slices — this
   * skips the nearest-point search for them, which is nearly all the cost.
   */
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const slices = surfaces.map((s) => {
    const { pos, nu, nv } = s;
    const mid = (Math.round(nu * 0.6) * (nv + 1) + (nv >> 1)) * 3;
    const centre = Math.atan2(pos[mid + 2], pos[mid]);
    let half = 0;
    for (let k = 0; k < pos.length; k += 3) {
      if (Math.hypot(pos[k], pos[k + 2]) < minRadius) continue;
      half = Math.max(half, Math.abs(wrap(Math.atan2(pos[k + 2], pos[k]) - centre)));
    }
    return { centre, half: half + 0.05 };
  });

  const computeNormals = (s: PetalSurface, out: Float32Array) => {
    const { pos, nu, nv } = s;
    const at = (i: number, j: number) => (Math.min(nu, Math.max(0, i)) * (nv + 1) + Math.min(nv, Math.max(0, j))) * 3;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const a = at(i + 1, j);
        const b = at(i - 1, j);
        const c = at(i, j + 1);
        const d = at(i, j - 1);
        const ux = pos[a] - pos[b], uy = pos[a + 1] - pos[b + 1], uz = pos[a + 2] - pos[b + 2];
        const vx = pos[c] - pos[d], vy = pos[c + 1] - pos[d + 1], vz = pos[c + 2] - pos[d + 2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        // The inner face, the one that looks up the axis.
        const sign = ny < 0 ? -1 : 1;
        nx *= sign / len; ny *= sign / len; nz *= sign / len;
        const k = (i * (nv + 1) + j) * 3;
        out[k] = nx; out[k + 1] = ny; out[k + 2] = nz;
      }
    }
  };

  /*
   * Nearest grid vertex: a coarse sweep then a local refine — or, once a vertex
   * has been matched, just a small search around its last match, since the
   * sheets only move a millimetre or two between passes.
   */
  const near = { k: 0, i: 0, j: 0 };
  const nearest = (s: PetalSurface, x: number, y: number, z: number, hi: number, hj: number) => {
    const { pos, nu, nv } = s;
    let bd = Infinity;
    const test = (i: number, j: number) => {
      const k = (i * (nv + 1) + j) * 3;
      const dx = pos[k] - x, dy = pos[k + 1] - y, dz = pos[k + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; near.k = k; near.i = i; near.j = j; }
    };
    let span = 2;
    if (hi < 0) {
      for (let i = 0; i <= nu; i += 3) for (let j = 0; j <= nv; j += 3) test(i, j);
      test(nu, 0); test(nu, nv);
      span = 3;
    } else {
      near.i = hi;
      near.j = hj;
    }
    const ci = near.i, cj = near.j;
    for (let i = Math.max(0, ci - span); i <= Math.min(nu, ci + span); i++)
      for (let j = Math.max(0, cj - span); j <= Math.min(nv, cj + span); j++) test(i, j);
    return near;
  };

  /*
   * Which of `from`'s vertices are over `onto` at all, found once with a
   * generous reach and remembered with their last match: most of every petal
   * is nowhere near its neighbours, and re-proving that on every pass was
   * nearly all the cost.
   */
  type Candidates = { v: number[]; qi: number[]; qj: number[] };
  const cache = new Map<string, Candidates>();
  const candidates = (from: number, onto: number): Candidates => {
    const key = `${from}>${onto}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const s = surfaces[from];
    const o = surfaces[onto];
    const sl = slices[onto];
    const out: Candidates = { v: [], qi: [], qj: [] };
    for (let i = 0; i <= s.nu; i++) {
      for (let j = 0; j <= s.nv; j++) {
        const k = (i * (s.nv + 1) + j) * 3;
        const x = s.pos[k], y = s.pos[k + 1], z = s.pos[k + 2];
        if (Math.hypot(x, z) < minRadius) continue;
        if (Math.abs(wrap(Math.atan2(z, x) - sl.centre)) > sl.half) continue;
        const q = nearest(o, x, y, z, -1, -1);
        const dx = x - o.pos[q.k], dy = y - o.pos[q.k + 1], dz = z - o.pos[q.k + 2];
        if (dx * dx + dy * dy + dz * dz > 0.035 * 0.035) continue;
        out.v.push(i * (s.nv + 1) + j);
        out.qi.push(q.i);
        out.qj.push(q.j);
      }
    }
    cache.set(key, out);
    return out;
  };

  // Move `from`'s vertices clear of `onto`. side +1: `from` must lie on
  // `onto`'s inner face; -1: on its outer face.
  const clear = (from: number, onto: number, side: 1 | -1, apply: boolean) => {
    const s = surfaces[from];
    const o = surfaces[onto];
    const no = normals[onto];
    const mv = moves[from];
    const cand = candidates(from, onto);
    let worst = 0;
    for (let c = 0; c < cand.v.length; c++) {
      const g = cand.v[c];
      const i = Math.floor(g / (s.nv + 1));
      const j = g - i * (s.nv + 1);
      const k = g * 3;
      const x = s.pos[k], y = s.pos[k + 1], z = s.pos[k + 2];
      const q = nearest(o, x, y, z, cand.qi[c], cand.qj[c]);
      cand.qi[c] = q.i;
      cand.qj[c] = q.j;
      const nx = no[q.k], ny = no[q.k + 1], nz = no[q.k + 2];
      const px = x - o.pos[q.k], py = y - o.pos[q.k + 1], pz = z - o.pos[q.k + 2];
      const d = px * nx + py * ny + pz * nz;
      // Within a few millimetres along the normal, or it is a point on a
      // petal across the flower that merely lines up with this one's normal.
      if (Math.abs(d) > 0.008) continue;
      const lat = Math.hypot(px - d * nx, py - d * ny, pz - d * nz);
      // Off the far sheet's margin is not over it.
      const edge = q.j === 0 || q.j === o.nv || q.i === o.nu;
      if (lat > (edge ? 0.0012 : 0.004)) continue;
      const need = (petalThicknessAt(s, i, j) + petalThicknessAt(o, q.i, q.j)) * 0.5 + margin;
      const gap = side * d - need; // negative: too close, or through
      if (gap >= 0) continue;
      worst = Math.max(worst, -gap);
      if (!apply) continue;
      // Each side takes a little over half, so the pair clears in a pass or
      // two rather than closing on contact forever.
      const m = -gap * 0.6 * side;
      mv[k] += nx * m; mv[k + 1] += ny * m; mv[k + 2] += nz * m;
    }
    return worst;
  };

  const smooth = (s: PetalSurface, mv: Float32Array) => {
    const { nu, nv } = s;
    const copy = mv.slice();
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const k = (i * (nv + 1) + j) * 3;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let n = 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || ii > nu || jj < 0 || jj > nv) continue;
            sum += copy[(ii * (nv + 1) + jj) * 3 + c];
            n++;
          }
          // Spread, but never below the vertex's own need: a blur alone would
          // shave the peak and leave the contact point still inside.
          const spread = n ? sum / n : 0;
          const own = copy[k + c];
          mv[k + c] = Math.abs(own) >= Math.abs(spread) ? own : 0.5 * (own + spread);
        }
      }
    }
  };

  for (let it = 0; it < iterations; it++) {
    surfaces.forEach((s, n) => computeNormals(s, normals[n]));
    moves.forEach((m) => m.fill(0));
    let any = 0;
    for (const [lo, up] of pairs) {
      any = Math.max(any, clear(up, lo, 1, true));
      any = Math.max(any, clear(lo, up, -1, true));
      yield;
    }
    pushed = Math.max(pushed, any);
    if (any <= tolerance) break;
    for (let n = 0; n < surfaces.length; n++) {
      const s = surfaces[n];
      smooth(s, moves[n]);
      smooth(s, moves[n]);
      const p = s.pos;
      const m = moves[n];
      for (let k = 0; k < p.length; k++) p[k] += m[k];
      yield;
    }
  }

  let residual = -1;
  if (verify) {
    surfaces.forEach((s, n) => computeNormals(s, normals[n]));
    residual = 0;
    for (const [lo, up] of pairs) {
      residual = Math.max(residual, clear(up, lo, 1, false), clear(lo, up, -1, false));
    }
  }
  return { pushed, residual };
}

/**
 * A leaf, which is not a petal with different numbers.
 *
 * A petal is a sheet that leaves the flower where it starts. A leaf has a stalk
 * holding it out from the stem, a spine holding it open, and margins that fall
 * away from that spine and lift again at the edge — and it is those three, not
 * the outline, that stop it reading as an ellipse cut out of card. The stalk is
 * the important one: without it the blade begins in mid air a stem's width from
 * anything, which is exactly what a floating disc looks like.
 *
 * Built as one sheet so it is one draw and one silhouette: `u` runs from the
 * stem to the tip through the stalk, `v` across.
 */
export type LeafShape = {
  length: number;
  width: number;
  stalk: number;
  droop: number;
  fold: number;
  twist: number;
  wave: number;
  sweep: number;
};

/**
 * One point on a leaf's surface: `u` from its join at 0 to its tip at 1, `v`
 * across it from margin to margin, −1 to 1.
 *
 * This is exported and the mesh is built out of it, rather than the loop below
 * owning the formula, because the document needs the same answer: the four
 * labels in the stem act are set *on* these blades, in a basis taken from three
 * points of this surface, and a second implementation of the shape would put
 * the type on a leaf that does not quite exist.
 *
 * The distinction that matters to a caller is that the centre line, v = 0, is
 * not the middle of what you see. `fold` hangs both margins below the spine —
 * the blade is a shallow trough opening downward — so the centre line is the
 * *top* edge of the silhouette, and anything centred on it floats above the
 * leaf rather than lying on it.
 */
export function leafSurface(
  s: LeafShape,
  u: number,
  v: number,
  out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
) {
  const half = s.width * 0.5;
  const stalkHalf = half * 0.09;
  // The spine, as a ridge standing off the sheet. A tenth of the leaf's own
  // width is what a real midrib is worth, and it is the thing the light breaks
  // on when the camera is beside the plant rather than in front of it.
  const spine = half * 0.13;

  // The blade opens a little before the stalk nominally ends, so the two meet
  // at a shoulder rather than at a pinch.
  const b = Math.max(0, (u - s.stalk * 0.72) / (1 - s.stalk * 0.72));
  const blade =
    half *
    Math.pow(Math.sin(Math.PI * Math.pow(b, 0.55)), 0.7) *
    (1 + s.wave * 0.22 * Math.sin(b * 13));
  const w = Math.max(stalkHalf * (1 - 0.3 * u), blade);

  // Centre line: out, down, and off to one side.
  const cz = u * s.length;
  const cy = -s.droop * u * u * s.length * 0.5;
  const cx = s.sweep * u * u * s.length;

  // The cross-section rolls as it goes out, which is the cheapest thing that
  // stops the whole leaf being one plane and therefore one flat colour.
  const phi = s.twist * u * u;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);

  // A stalk is a channel, not a ribbon: folded hard it keeps a silhouette
  // when it is seen edge on, which is most of the time.
  const foldU = u < s.stalk ? s.fold + (1.7 - s.fold) * (1 - u / s.stalk) : s.fold;
  const ridge = spine * (u < s.stalk * 0.72 ? 0.35 : 1);

  // Down from the spine, then up again in the last of the margin — a leaf held
  // perfectly taut is a piece of sheet metal.
  const off =
    -foldU * v * v * w +
    0.22 * foldU * Math.pow(Math.abs(v), 6) * w +
    ridge * Math.exp(-(v * 3.4) * (v * 3.4));

  out.x = cx + cp * (v * w) - sp * off;
  out.y = cy + sp * (v * w) + cp * off;
  out.z = cz;
  return out;
}

export function leafGeometry({
  length = 0.13,
  /** Across the widest part of the blade. */
  width = 0.05,
  /** How much of the length is stalk before the blade opens. */
  stalk = 0.26,
  /** How far the whole thing arcs down over its own length. */
  droop = 0.8,
  /** How far the margins fall below the spine. */
  fold = 0.34,
  /** Radians of roll from base to tip, so no two parts of it face one way. */
  twist = 0.5,
  /** How much the margin ripples. */
  wave = 0.3,
  /** How far it curves sideways as it goes out. */
  sweep = 0.16,
  nu = 30,
  nv = 9,
}: {
  length?: number;
  width?: number;
  stalk?: number;
  droop?: number;
  fold?: number;
  twist?: number;
  wave?: number;
  sweep?: number;
  nu?: number;
  nv?: number;
} = {}): BufferGeometry {
  const positions = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  const indices: number[] = [];
  const shape = { length, width, stalk, droop, fold, twist, wave, sweep };
  const p = { x: 0, y: 0, z: 0 };

  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1;
      leafSurface(shape, u, v, p);

      const o = (i * (nv + 1) + j) * 3;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      positions[o + 2] = p.z;

      const t = (i * (nv + 1) + j) * 2;
      uvs[t] = (v + 1) * 0.5;
      uvs[t + 1] = u;
    }
  }

  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const c = a + nv + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("uv", new BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Several indexed position/uv geometries as one draw.
 *
 * The roots are six tubes that are always drawn together and never drawn apart;
 * three's own merge helper lives in the examples bundle and is not otherwise
 * worth pulling in for this.
 */
export function mergeGeometries(parts: BufferGeometry[]): BufferGeometry {
  let verts = 0;
  let tris = 0;
  for (const p of parts) {
    verts += p.attributes.position.count;
    tris += p.getIndex()?.count ?? 0;
  }

  const positions = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const indices = new Uint32Array(tris);
  let vo = 0;
  let io = 0;

  for (const p of parts) {
    const pos = p.attributes.position;
    const uv = p.attributes.uv;
    const idx = p.getIndex();
    for (let i = 0; i < pos.count; i++) {
      positions[(vo + i) * 3] = pos.getX(i);
      positions[(vo + i) * 3 + 1] = pos.getY(i);
      positions[(vo + i) * 3 + 2] = pos.getZ(i);
      uvs[(vo + i) * 2] = uv ? uv.getX(i) : 0;
      uvs[(vo + i) * 2 + 1] = uv ? uv.getY(i) : 0;
    }
    if (idx) for (let i = 0; i < idx.count; i++) indices[io + i] = idx.getX(i) + vo;
    vo += pos.count;
    io += idx?.count ?? 0;
    p.dispose();
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("uv", new BufferAttribute(uvs, 2));
  geo.setIndex(new BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/** A square of paper, at the scale where paper is a landmark. */
export function noteGeometry(size = 0.012) {
  const geo = new BufferGeometry();
  const h = size / 2;
  const positions = new Float32Array([
    -h, 0, -h, h, 0, -h, h, 0, h,
    -h, 0, -h, h, 0, h, -h, 0, h,
  ]);
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
