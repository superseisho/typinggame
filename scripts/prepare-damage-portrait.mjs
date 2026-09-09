// Background cleanup authorized for the generated damage portraits only.
// Usage: node scripts/prepare-damage-portrait.mjs input.png output.png
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const [source, destination, background = 'checker', seedList = '', replace] = process.argv.slice(2);
if (!source || !destination || (existsSync(destination) && replace !== '--replace')) {
  throw new Error('Provide input.png and a NEW output.png path (never overwrite an existing asset).');
}
const input = readFileSync(source);
let width, height, channels;
const chunks = [];
for (let offset = 8; offset < input.length;) {
  const length = input.readUInt32BE(offset);
  const kind = input.toString('ascii', offset + 4, offset + 8);
  const data = input.subarray(offset + 8, offset + 8 + length);
  if (kind === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) throw new Error('Expected RGB/RGBA non-interlaced PNG');
    channels = data[9] === 6 ? 4 : 3;
  }
  if (kind === 'IDAT') chunks.push(data);
  offset += length + 12;
}
const raw = inflateSync(Buffer.concat(chunks));
const stride = width * channels;
const pixels = new Uint8Array(width * height * channels);
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  for (let x = 0; x < stride; x++) {
    const i = y * stride + x;
    const a = x >= channels ? pixels[i - channels] : 0;
    const b = y > 0 ? pixels[i - stride] : 0;
    const c = y > 0 && x >= channels ? pixels[i - stride - channels] : 0;
    const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
    if (predictor === undefined) throw new Error('Invalid PNG filter');
    pixels[i] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
  }
}

const size = width * height;
const alpha = new Uint8Array(size).fill(255);
const candidate = new Uint8Array(size);
for (let p = 0; p < size; p++) {
  const i = p * channels;
  const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
  const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
  if (channels === 4) alpha[p] = pixels[i + 3];
  const backdrop = background === 'black' ? max <= 12 : max - min <= 18 && min >= 80;
  candidate[p] = backdrop || alpha[p] === 0 ? 1 : 0;
}
// Only erase neutral checkerboard connected to the canvas edge. Dark outlines
// protect silver hair and metal inside the character from color-key removal.
const queue = new Int32Array(size);
const seen = new Uint8Array(size);
let head = 0, tail = 0;
function enqueue(p) {
  if (seen[p] || !candidate[p]) return;
  seen[p] = 1; queue[tail++] = p;
}
for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
// Optional inspected background holes, normalized x,y pairs separated by ';'.
for (const seed of seedList.split(';').filter(Boolean)) {
  const [x, y] = seed.split(',').map(Number);
  if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) throw new Error('Invalid background seed');
  enqueue(Math.floor(y * height) * width + Math.floor(x * width));
}
while (head < tail) {
  const p = queue[head++]; alpha[p] = 0;
  const x = p % width;
  if (x > 0) enqueue(p - 1);
  if (x < width - 1) enqueue(p + 1);
  if (p >= width) enqueue(p - width);
  if (p + width < size) enqueue(p + width);
}

// Downsample with alpha-weighted area averaging for small, predecoded UI assets.
const outHeight = Math.min(512, height);
const outWidth = Math.round(width * outHeight / height);
const outStride = outWidth * 4;
const scanlines = Buffer.alloc((outStride + 1) * outHeight);
for (let y = 0; y < outHeight; y++) {
  for (let x = 0; x < outWidth; x++) {
    const left = x * width / outWidth, right = (x + 1) * width / outWidth;
    const top = y * height / outHeight, bottom = (y + 1) * height / outHeight;
    let weight = 0, a = 0, r = 0, g = 0, b = 0;
    for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
      for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
        const w = (Math.min(right, sx + 1) - Math.max(left, sx)) * (Math.min(bottom, sy + 1) - Math.max(top, sy));
        const p = sy * width + sx, i = p * channels;
        const aw = alpha[p] * w;
        weight += w; a += aw;
        r += pixels[i] * aw; g += pixels[i + 1] * aw; b += pixels[i + 2] * aw;
      }
    }
    const target = y * (outStride + 1) + x * 4 + 1;
    if (a > 0) { scanlines[target] = Math.round(r / a); scanlines[target + 1] = Math.round(g / a); scanlines[target + 2] = Math.round(b / a); }
    scanlines[target + 3] = Math.round(a / weight);
  }
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(kind, data) {
  const body = Buffer.concat([Buffer.from(kind), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const prefix = Buffer.alloc(4), suffix = Buffer.alloc(4);
  prefix.writeUInt32BE(data.length); suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([prefix, body, suffix]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(outWidth); ihdr.writeUInt32BE(outHeight, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(destination, Buffer.concat([
  input.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]));
console.log(`${destination}: ${outWidth}x${outHeight}, ${(tail / size * 100).toFixed(1)}% background removed`);
