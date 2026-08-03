#!/usr/bin/env bun
/**
 * Render the hero backdrop through the ascii pipeline.
 *
 * There is no tone-shaping here any more, and that is the point. An
 * earlier pass used a flat symbolic silhouette and multiplied a radial
 * falloff over it to give the glyph ramp something to climb. It climbed
 * it, and the result was flat — because a falloff is not modelling. A
 * gradient laid over a shape describes the frame, not the form; nothing
 * in it says which way a surface turns.
 *
 * So the light moved into the source instead. The current one goes
 * further: depth comes from distinct tonal PLATES — statue, far range,
 * mist, mid range, mist, foreground ledge — each at its own even value
 * with a pale gap between. A five-step ramp cannot render a smooth
 * recession, but it renders plates perfectly, because every plate lands
 * on its own rung. The mist bands are what make the layers legible.
 *
 * 320 columns rather than 260: there is a human on the path down there
 * at a twentieth of the frame, and its long cast shadow is the thing
 * that has to survive the reduction.
 *
 *   bun scripts/render-hero.ts
 */

const SOURCE = 'art-src/hero-a.png';
const PREPPED = 'art-src/hero-prepped.png';

/** Overall width of both renders — the 82rem the backdrop is capped to. */
const WIDTH = 1320;

/**
 * The canvas resolution. There is a human on the path down there at a
 * twentieth of the frame, and their long cast shadow is the thing that
 * has to survive the reduction.
 */
const GRID_COLS = 320;

/**
 * The SVG resolution, deliberately much coarser.
 *
 * The SVGs exist only as the first paint and the no-JS fallback; the
 * canvas replaces them within a few hundred milliseconds. At 320 columns
 * they came to 79KB gzipped EACH, and both ship because a hidden image
 * is still fetched — 158KB to show something that is on screen briefly
 * or never. At 120 the silhouette and the layer bands still read, which
 * is all a placeholder has to do.
 */
const SVG_COLS = 120;

/**
 * Two inks. An ascii layer is transparent, so unlike the black-ground
 * painting this replaced, it has no reason to be dark-mode-only.
 */
const INKS = [
  { suffix: '', ink: '#f2e3c4' },
  { suffix: '-light', ink: '#3a2f22' },
] as const;

const sharp = (await import('sharp')).default;

await sharp(SOURCE)
  .greyscale()
  // Just enough to stop a hard edge landing a whole row of cells on the
  // same knife-edge of the ramp, where neighbours tip to either side at
  // random and the result reads as static. Light, because the modelling
  // is the signal and blurring it away is the one thing worth avoiding.
  .blur(1.2)
  .png()
  .toFile(PREPPED);

for (const { suffix, ink } of INKS) {
  const out = `static/art/hero-thangka${suffix}.svg`;
  // `--no-shape`: quadrant matching earns its keep on a face at 92 cols,
  // but across broad smooth gradients it finds edges in its own dither
  // and speckles them. Brightness alone gives clean halftone.
  // `--ramp shade`: ░▒▓█ and nothing else. Braille makes a finer screen
  // but a dimmer one — its dots separate as they enlarge and the form
  // dissolves into speckle. Shade blocks hold the mass, and against a
  // modelled source they hold its volume with it.
  await Bun
    .$`bun scripts/asciify.ts ${PREPPED} -o ${out} --cols ${SVG_COLS} --cell ${WIDTH / SVG_COLS} --ink ${ink} --bg transparent --ramp shade --no-shape --floor 0.07 --gamma 0.68`.quiet();

  const svg = await Bun.file(out).text();
  console.log(`${out}  ${SVG_COLS} cols, ${svg.split('<text').length - 1} glyphs`);
}

/* The same grid as tone rather than as glyphs. The SVGs are the static
   paint; this is what the canvas re-renders from, because a cell cannot
   climb the ramp under a cursor if the only thing shipped is the
   character it already landed on. */
await Bun
  .$`bun scripts/asciify.ts ${PREPPED} -o static/art/hero-grid.json --cols ${GRID_COLS} --cell ${WIDTH / GRID_COLS} --bg transparent --ramp shade --no-shape --floor 0.07 --gamma 0.68`.quiet();

const grid = (await Bun.file('static/art/hero-grid.json').json()) as {
  cols: number;
  rows: number;
};
console.log(`static/art/hero-grid.json  ${grid.cols}x${grid.rows}`);
