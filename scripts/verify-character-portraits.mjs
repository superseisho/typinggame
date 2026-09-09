import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const ART_FILES = {
  warrior: ['normal', 'low-hp', 'down', 'guard-active', 'low-hp-guard-active'],
  mage: ['normal', 'low-hp', 'down', 'cast-active', 'low-hp-cast-active'],
  cleric: ['normal', 'low-hp', 'down', 'heal-active', 'low-hp-heal-active'],
  'martial-artist': ['normal', 'low-hp', 'down', 'combo-active', 'low-hp-combo-active'],
};

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function transparencyRatio(path) {
  const png = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(`${path}: expected an 8-bit non-interlaced RGBA PNG`);
      }
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    offset += length + 12;
  }

  const packed = inflateSync(Buffer.concat(idat));
  const rowLength = width * 4;
  let offsetInPacked = 0;
  let transparent = 0;
  let previous = new Uint8Array(width);
  for (let y = 0; y < height; y += 1) {
    const filter = packed[offsetInPacked];
    const current = new Uint8Array(width);
    for (let x = 0; x < width; x += 1) {
      const raw = packed[offsetInPacked + 1 + x * 4 + 3];
      const left = x > 0 ? current[x - 1] : 0;
      const up = previous[x];
      const upperLeft = x > 0 ? previous[x - 1] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : (() => { throw new Error(`${path}: unsupported PNG filter ${filter}`); })();
      current[x] = (raw + predictor) & 255;
      if (current[x] === 0) transparent += 1;
    }
    previous = current;
    offsetInPacked += rowLength + 1;
  }
  return transparent / (width * height);
}

for (const [character, states] of Object.entries(ART_FILES)) {
  for (const state of [...states, 'damaged', 'low-hp-damaged']) {
    const path = `public/images/characters/${character}/${state}.png`;
    if (!existsSync(path)) throw new Error(`Missing portrait: ${path}`);
    const ratio = transparencyRatio(path);
    if (ratio < 0.05) throw new Error(`${path}: background is not genuinely transparent`);
    process.stdout.write(`${path}: ${(ratio * 100).toFixed(1)}% transparent\n`);
  }
}
