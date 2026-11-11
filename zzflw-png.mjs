import { inflateSync } from "node:zlib";

/** Minimal decoder for the 8-bit non-interlaced PNGs Chrome's screenshots are. */
export function decodePng(buf) {
  let o = 8;
  let width = 0;
  let height = 0;
  let colour = 6;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colour = data[9];
    } else if (type === "IDAT") idat.push(data);
    o += len + 12;
  }
  const channels = colour === 6 ? 4 : colour === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

/** Frame mean luminance, sRGB in, linear out — the number the hero type sits on. */
export function meanLuminance(png) {
  const { width, height, channels, data } = png;
  const lut = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const s = i / 255;
    lut[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  let sum = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    sum += 0.2126 * lut[data[o]] + 0.7152 * lut[data[o + 1]] + 0.0722 * lut[data[o + 2]];
  }
  return sum / n;
}

/** A tight crop, written back out as a PNG so it can be read. */
export function cropPng(png, x0, y0, w, h) {
  const { channels, data, width } = png;
  const out = Buffer.alloc(w * h * channels);
  for (let y = 0; y < h; y++) {
    data.copy(
      out,
      y * w * channels,
      ((y0 + y) * width + x0) * channels,
      ((y0 + y) * width + x0 + w) * channels,
    );
  }
  return { width: w, height: h, channels, data: out };
}

export function encodePng(png) {
  const { width, height, channels, data } = png;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const { deflateSync, crc32 } = crcTools();
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const t = Buffer.from(type, "ascii");
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(Buffer.concat([t, body])) >>> 0);
    return Buffer.concat([len, t, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crcTools() {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc32 = (b) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 255] ^ (c >>> 8);
    return c ^ -1;
  };
  return { deflateSync: (b) => require0(b), crc32 };
}

import { deflateSync } from "node:zlib";
function require0(b) {
  return deflateSync(b);
}

/** Nearest-neighbour magnify, for looking at something 20 pixels tall. */
export function zoomPng(png, f) {
  const { width, height, channels, data } = png;
  const w = width * f;
  const h = height * f;
  const out = Buffer.alloc(w * h * channels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (((y / f) | 0) * width + ((x / f) | 0)) * channels;
      data.copy(out, (y * w + x) * channels, s, s + channels);
    }
  }
  return { width: w, height: h, channels, data: out };
}
