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
  /**
   * Also emit a tone grid for a guide cover.
   *
   * A cover is the same drawing at four times the sampling and alive
   * rather than flat, and neither is something an SVG of baked glyphs
   * can become. The grid ships luminance per cell so the cover picks its
   * own characters at paint time — which is what lets a shimmer travel
   * across it, and lets the treatment setting reach it too.
   */
  cover?: boolean;
}

const ART: Art[] = [
  { name: 'secrets', ink: '#d6f6ff', floor: 0.14, gamma: 0.75 },
  // Vibe coding. The human arm is the brightest thing here and the
  // agent hand is a quarter of its brightness, so the ramp gives one of
  // them a solid bank of glyphs and the other a scatter. That density
  // gap IS the idea; a low floor is what preserves it, because a high
  // one would cut the faint hand away entirely and leave one arm
  // reaching at nothing.
  { name: 'vibe-touch', ink: '#ffffff', floor: 0.07, gamma: 0.66, cover: true },
  { name: 'sampling', ink: '#e8ecff', floor: 0.12, gamma: 0.72, cover: true },
  // Transformers. Figures at each turn of the scroll are a twelfth of
  // the frame, so they vanish at the resting resolution and appear on
  // hover — the layers are the obvious thing, the operators inside them
  // are what you only see when you look closer.
  { name: 'transformer-scroll', ink: '#dfe9ff', floor: 0.1, gamma: 0.8, cover: true },
  // Deep AI. The floor matters more than usual: the void has to stay
  // absolutely empty, because an event horizon rendered with a few stray
  // glyphs in it is just a dark circle.
  { name: 'deep-space', ink: '#e6ecff', floor: 0.15, gamma: 0.85 },
  { name: 'fun-ufo', ink: '#ffe9c4', floor: 0.12, gamma: 0.78 },
  { name: 'freshcast', ink: '#d8ffe4', floor: 0.16, gamma: 0.8 },
  { name: 'designers', ink: '#dff2ff', floor: 0.07, gamma: 0.6 },
  // The only one of these where the subject IS the light source: the lit
  // pinboard fills the frame and the figure is the hole in it. Without a
  // floor this high the whole card floods solid.
  { name: 'pmcourse', ink: '#ffe0c4', floor: 0.42, gamma: 0.8 },
];

const FINE = { cols: 92, cell: 7 } as const;

/**
 * The resting resolution.
 *
 * This has been walked down twice. 23 across was unrecognisable — the
 * cat was a smear. 46 was legible but still read as an out-of-focus
 * photograph rather than as a deliberately coarse rendering, which is
 * not the same thing and looks like a loading state. 64 keeps the
 * drawing sharp and leaves the hover to add detail rather than to
 * rescue it.
 */
const COARSE_COLS = 64;

/** Both passes span the same width, so the two SVGs overlay exactly. */
const WIDTH = FINE.cols * FINE.cell;
const COARSE = { cols: COARSE_COLS, cell: WIDTH / COARSE_COLS } as const;

/**
 * Cover resolution. Nearly twice the card's, because a cover is looked
 * at rather than glanced at. Its floor drops to 0.03 as well, so the
 * renderer can cut the edge itself with a jitter instead of inheriting a
 * clean baked contour.
 */
const COVER_COLS = 200;

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
  if (art.cover) {
    await $`bun scripts/asciify.ts art-src/${art.name}.png -o static/art/${art.name}-grid.json --cols ${COVER_COLS} --cell ${(FINE.cols * FINE.cell) / COVER_COLS} --bg transparent --ramp shade --no-shape --floor 0.03 --gamma ${art.gamma}`.quiet();
  }
  console.log(`${art.name}  ${FINE.cols}c + ${COARSE.cols}c${art.cover ? ` + ${COVER_COLS}c grid` : ''}`);
}
