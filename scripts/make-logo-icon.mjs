// One-off: downscale src/app/logo-transparent.png to a square RGBA icon PNG (area filter).
//   node scripts/make-logo-icon.mjs [sizePx] [outPath]
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIZE = Number(process.argv[2] ?? 128) || 128;
const OUT = process.argv[3] ?? 'src/app/icon.png';

const src = fs.readFileSync('src/app/logo-transparent.png');
let off = 8;
const idat = [];
let w = 0, h = 0, ct = 0;
while (off < src.length) {
  const len = src.readUInt32BE(off);
  const type = src.toString('ascii', off + 4, off + 8);
  if (type === 'IHDR') { w = src.readUInt32BE(off + 8); h = src.readUInt32BE(off + 12); ct = src[off + 17]; }
  if (type === 'IDAT') idat.push(src.subarray(off + 8, off + 8 + len));
  off += 12 + len;
}
if (ct !== 6) { console.error('Expected RGBA input, got colorType', ct); process.exit(1); }

const ch = 4;
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

// area-weighted downscale (premultiplied so transparent edges don't bleed dark)
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let ty = 0; ty < SIZE; ty++) {
  const y0 = Math.floor((ty * h) / SIZE), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / SIZE));
  for (let tx = 0; tx < SIZE; tx++) {
    const x0 = Math.floor((tx * w) / SIZE), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / SIZE));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * stride + x * 4;
        const al = px[i + 3] / 255;
        r += px[i] * al; g += px[i + 1] * al; b += px[i + 2] * al; a += al; n++;
      }
    }
    const o = (ty * SIZE + tx) * 4;
    if (a > 0.0001) {
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
    }
    out[o + 3] = Math.round((a / n) * 255);
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const buf = Buffer.alloc(8 + data.length + 4);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 'ascii');
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)), 8 + data.length);
  return buf;
}
const IHDR = Buffer.alloc(13);
IHDR.writeUInt32BE(SIZE, 0);
IHDR.writeUInt32BE(SIZE, 4);
IHDR[8] = 8; IHDR[9] = 6;
const rawOut = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rawOut[y * (SIZE * 4 + 1)] = 0; // filter type 0
  out.copy(rawOut, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', IHDR),
  chunk('IDAT', zlib.deflateSync(rawOut, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes, ${SIZE}x${SIZE})`);
