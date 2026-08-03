#!/usr/bin/env bun
/**
 * Subset the design-settings typefaces into web-ready woff2.
 *
 * The faces live in ~/Sites/fonts as full variable TTFs — every script,
 * every axis, often several megabytes each. Shipping those to pick a
 * headline font would cost more than the rest of the site put together.
 * Each one here is pinned to a single weight axis, cut to Latin, and
 * compressed, which lands them around 40-70KB.
 *
 * The pinning is the part that has to be written down. A face carrying
 * `wdth` or `opsz` still carries them after subsetting, and a browser
 * asked for `font-weight: 600` on an un-pinned multi-axis font picks the
 * default instance of the others — which is not always the drawing the
 * designer intended as the normal one.
 *
 *   bun scripts/build-fonts.ts            # everything
 *   bun scripts/build-fonts.ts anek       # one, by output name
 *
 * Requires fonttools (`pipx install fonttools[woff]`). The source tree
 * is outside this repo, so this is a local-machine build step, not part
 * of `astro build`.
 */

import { mkdir, rm } from 'node:fs/promises';
import { $ } from 'bun';

const ROOT = `${process.env.HOME}/Sites/fonts`;
const OUT = 'static/fonts/generated';

interface Face {
  /** Output basename, and the id used on the command line. */
  name: string;
  /** Path under ~/Sites/fonts. */
  src: string;
  /** Axes to pin, so only weight survives. */
  pin?: Record<string, number>;
}

const FACES: Face[] = [
  { name: 'AnekLatin-var', src: 'anek/AnekLatin/variable/AnekLatin[wdth,wght].ttf', pin: { wdth: 100 } },
  { name: 'FunnelDisplay-var', src: 'funnel_display/variable/FunnelDisplay[wght].ttf' },
  { name: 'Gabarito-var', src: 'gabarito/variable/Gabarito[wght].ttf' },
  { name: 'Matangi-var', src: 'matangi/Matangi[wght].ttf' },
  // Unpinned, unlike the rest. Mona Sans ships a STAT table the
  // instancer cannot rewrite — it walks off the end of the design-axis
  // list and throws — so its opsz and ital axes stay in the file and the
  // browser takes their defaults, which are the text drawing and upright.
  { name: 'MonaSans-var', src: 'mona_sans/MonaSansVF[wght,opsz,ital].ttf' },
  { name: 'ZalandoSans-var', src: 'zalando_sans/variable/ZalandoSans[wdth,wght,slnt].ttf', pin: { wdth: 100, slnt: 0 } },
  { name: 'SplineSans-var', src: 'spline_sans/SplineSans[wght].ttf' },
  { name: 'SplineSansMono-var', src: 'spline_sans/mono/SplineSansMono[wght].ttf' },
  { name: 'StrichpunktSans-var', src: 'strichpunkt_sans/variable/StrichpunktSans[wdth,wght].ttf', pin: { wdth: 100 } },
];

/** Latin plus the punctuation and symbols this site actually sets. */
const UNICODES = [
  'U+0000-00FF',
  'U+0131',
  'U+0152-0153',
  'U+02BB-02BC',
  'U+02C6',
  'U+02DA',
  'U+02DC',
  'U+2000-206F',
  'U+2074',
  'U+20AC',
  'U+2122',
  'U+2190-2193',
  'U+2212',
  'U+2215',
  'U+FEFF',
  'U+FFFD',
].join(',');

/* Stylistic sets are kept because the settings panel offers a ligature
   toggle, and dropping them here would make that control a no-op on
   every face that has any. */
const FEATURES = 'kern,liga,clig,calt,ccmp,locl,mark,mkmk,dlig,ss01,ss02,ss03,ss04,ss05';

const only = Bun.argv.slice(2);
const queue = only.length ? FACES.filter((f) => only.includes(f.name.replace('-var', '').toLowerCase()) || only.includes(f.name)) : FACES;

if (!queue.length) {
  console.error(`nothing matched. known: ${FACES.map((f) => f.name).join(', ')}`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const tmp = 'static/fonts/.tmp';
await mkdir(tmp, { recursive: true });

for (const face of queue) {
  const src = `${ROOT}/${face.src}`;
  if (!(await Bun.file(src).exists())) {
    console.error(`missing source: ${src}`);
    process.exit(1);
  }

  let input = src;
  if (face.pin) {
    const pinned = `${tmp}/${face.name}.ttf`;
    const args = Object.entries(face.pin).map(([axis, value]) => `${axis}=${value}`);
    await $`fonttools varLib.instancer ${src} ${args} -o ${pinned}`.quiet();
    input = pinned;
  }

  const out = `${OUT}/${face.name}.woff2`;
  await $`pyftsubset ${input} --output-file=${out} --flavor=woff2 --unicodes=${UNICODES} --layout-features=${FEATURES} --no-hinting --desubroutinize`.quiet();

  const kb = (Bun.file(out).size / 1024).toFixed(0);
  console.log(`${face.name}  ${kb}KB`);
}

await rm(tmp, { recursive: true, force: true });
