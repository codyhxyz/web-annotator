// Inspired by @wxt-dev/auto-icons (https://wxt.dev/guide/essentials/config/auto-icons.html),
// which renders a single source SVG into the four MV3 icon sizes (16/32/48/128)
// at build time so you never have to hand-maintain four PNGs.
//
// We can't use @wxt-dev/auto-icons directly here because annotator-v2 is a
// plain Vite project, not a WXT project. So we port the *concept* manually:
// one source `assets/icon.svg` -> rendered PNGs in `public/icons/icon-{size}.png`,
// wired via a `prebuild` hook so CWS-bound builds always have fresh icons.
//
// Idempotent: re-running with an unchanged SVG still produces byte-identical
// PNGs. Silent on success; only logs if something actually fails.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SIZES = [16, 32, 48, 128];

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SRC = resolve(root, 'assets/icon.svg');
const OUT_DIR = resolve(root, 'public/icons');

async function main() {
  const svg = await readFile(SRC);
  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all(
    SIZES.map(async (size) => {
      const png = await sharp(svg, { density: 384 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      await writeFile(resolve(OUT_DIR, `icon-${size}.png`), png);
    }),
  );
}

main().catch((err) => {
  console.error('[gen-icons] failed:', err);
  process.exit(1);
});
