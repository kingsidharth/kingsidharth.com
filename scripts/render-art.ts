#!/usr/bin/env bun
/**
 * Render every card artwork from `art-src/` into `static/art/`.
 *
 * The per-image parameters below are the whole point of this file. Floor
 * and gamma have to be tuned per source — a subject on black wants a low
 * floor so the shadow detail survives, a subject that IS a lit field
 * (the pinboard, the radio grille) wants a high one or the whole frame
 * fills in solid. Those numbers were arrived at by looking at the
 * result, and without somewhere to write them down they get lost and the
 * next re-render silently changes the art.
 *
 * Two resolutions ship per image. The coarse one is what you see at
 * rest; the fine one fades in on hover, so the card resolves under the
 * cursor rather than merely brightening. See `.art-resolve` in
 * global.css.
 *
 *   bun scripts/render-art.ts            # everything
 *   bun scripts/render-art.ts secrets    # one, by name
 */

import { $ } from 'bun';

interface Art {
  /** Basename in both `art-src/<name>.png` and `static/art/<name>.svg`. */
  name: string;
  /** Single ink colour; per-cell opacity carries the tone. */
  ink: string;
  /** Cells below this luminance are dropped entirely. */
  floor: number;
  /** Below 1 lifts the midtones, which thickens the drawing. */
  gamma: number;
}

const ART: Art[] = [
  { name: 'secrets', ink: '#d6f6ff', floor: 0.14, gamma: 0.75 },
  { name: 'skull', ink: '#ffffff', floor: 0.16, gamma: 0.8 },
  { name: 'samurai', ink: '#c8ffd8', floor: 0.16, gamma: 0.8 },
  // A lit panel rather than a subject on black: without a high floor the
  // grille fills in and the speaker holes disappear.
  { name: 'freshcast', ink: '#d8ffe4', floor: 0.3, gamma: 0.9 },
  { name: 'cat', ink: '#ffe9c4', floor: 0.16, gamma: 0.8 },
  { name: 'designers', ink: '#dff2ff', floor: 0.07, gamma: 0.6 },
  // Same as freshcast — the pinboard is the light source.
  { name: 'pmcourse', ink: '#ffe0c4', floor: 0.42, gamma: 0.8 },
];

/** Both passes cover the same ~644px, so the two SVGs overlay exactly. */
const FINE = { cols: 92, cell: 7 } as const;
/* Half the sampling, not a quarter. At 23 across the silhouettes stopped
   being recognisable — the cat was a smear — and a card you cannot read
   until you touch it is not a resting state, it is a broken image. */
const COARSE = { cols: 46, cell: 14 } as const;

const only = Bun.argv.slice(2);
const queue = only.length ? ART.filter((a) => only.includes(a.name)) : ART;

if (only.length && queue.length !== only.length) {
  const missing = only.filter((n) => !ART.some((a) => a.name === n));
  console.error(`not in the manifest: ${missing.join(', ')}`);
  process.exit(1);
}

for (const art of queue) {
  for (const [suffix, res] of [
    ['', FINE],
    ['-low', COARSE],
  ] as const) {
    await $`bun scripts/asciify.ts art-src/${art.name}.png -o static/art/${art.name}${suffix}.svg --cols ${res.cols} --cell ${res.cell} --ink ${art.ink} --bg transparent --floor ${art.floor} --gamma ${art.gamma}`.quiet();
  }
  console.log(`${art.name}  ${FINE.cols}c + ${COARSE.cols}c`);
}
