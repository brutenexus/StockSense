// One-off: make the white background of logo.png transparent (flood fill from the edges).
import fs from 'node:fs';
import zlib from 'node:zlib';

const SRC = 'logo.png';
const OUT = 'src/app/logo-transparent.png';
const src = fs.readFileSync(SRC);
let off = 8;
const idat = [];
let w = 0, h = 0, ct = 0;
while (off < src.length) {
  const len = src.readUInt32BE(off);
  const type = src.toString('ascii', off + 4, off + 8);
  if (type === 'IHDR') {
    w = src.readUInt32BE(off + 8);
    h = src.readUInt32BE(off + 12);
    ct = src[off + 17];
  }
  if (type === 'IDAT') idat.push(src.subarray(off + 8, off + 8 + len));
  off += 12 + len;
}
if (ct !== 2) {
  console.error('Expected RGB PNG, got colorType', ct);
  process.exit(1);
}

// -- inflate + unfilter ------------------------------------------------------
const ch = 3;
const stride = w * ch;
const raw = zlib.inflateSync(Buffer.concat(idat));
const px = Buffer.alloc(h * stride);
let pos = 0;
for (let y = 0; y < h; y++) {
  const filter = raw[pos++];
  const row = px.subarray(y * stride, (y + 1) * stride);
  raw.copy(row, 0, pos, pos + stride);
  pos += stride;
  for (let x = 0; x < stride; x++) {
    const a = x >= ch ? row[x - ch] : 0;
    const b = y > 0 ? px[(y - 1) * stride + x] : 0;
    const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0;
    let v = row[x];
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    row[x] = v & 255;
  }
}

// -- flood fill white -> transparent from every edge pixel --------------------
// Anti-aliased edge pixels get partial alpha so the mark has no white halo.
const rgba = Buffer.alloc(w * h * 4);
for (let i = 0, j = 0; i < w * h * 3; ) rgba[j++] = px[i++], (rgba[j++] = px[i++]), (rgba[j++] = px[i++]), (rgba[j++] = 255);

const isWhite = (x, y) => {
  const i = (y * w + x) * 3;
  return px[i] > 242 && px[i + 1] > 242 && px[i + 2] > 242;
};

const stack = [];
const seen = new Uint8Array(w * h);
const push = (x, y) => {
  const k = y * w + x;
  if (!seen[k] && isWhite(x, y)) { seen[k] = 1; stack.push(x, y); }
};
for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

while (stack.length) {
  const y = stack.pop();
  const x = stack.pop();
  const i = (y * w + x) * 4;
  rgba[i + 3] = 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

// soft alpha for pixels just below the white threshold (anti-alias fringe)
for (let i = 0; i < w * h * 4; i += 4) {
  if (rgba[i + 3] === 255) {
    const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
    if (lum > 225 && rgba[i] < 250 && rgba[i + 1] < 250 && rgba[i + 2] < 250) {
      rgba[i + 3] = Math.round(((250 - lum) / 25) * 255);
    }
    // light decontamination: pull near-white greenish fringe toward the mark color
    if (lum > 200 && rgba[i + 1] > rgba[i] && rgba[i + 1] > rgba[i + 2]) {
      rgba[i] = Math.round(rgba[i] * 0.9);
    }
  }
}

// -- re-encode as RGBA PNG ----------------------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const IHDR = Buffer.alloc(13);
IHDR.writeUInt32BE(w, 0);
IHDR.writeUInt32BE(h, 4);
IHDR[8] = 8; IHDR[9] = 6; // 8-bit RGBA
IHDR[12] = 0; IHDR[13] = 0; IHDR[14] = 0;
const outStride = w * 4; // RGBA row pitch
const rawOut = Buffer.alloc(h * (outStride + 1));
for (let y = 0; y < h; y++) {
  rawOut[y * (outStride + 1)] = 0; // filter 0
  rgba.copy(rawOut, y * (outStride + 1) + 1, y * outStride, (y + 1) * outStride);
}
const body = zlib.deflateSync(rawOut, { level: 9 });

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', IHDR),
  chunk('IDAT', body),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes, ${w}x${h} RGBA, transparent background)`);
