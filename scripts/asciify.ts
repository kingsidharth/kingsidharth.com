#!/usr/bin/env bun
/**
 * Turn an image into layered, coloured ASCII art.
 *
 * Two things separate this from the usual one-line asciifier:
 *
 *   - Colour is sampled per cell, so the output is a mosaic rather than
 *     a monochrome silhouette.
 *   - Glyphs are matched on SHAPE, not just brightness. Each cell's 2x2
 *     luminance quadrants are compared against each glyph's own ink
 *     coverage, so an edge running through a cell picks a glyph whose
 *     ink sits on the same side. That is what stops portraits turning
 *     to mush.
 *
 * Detail scales with --cols: smaller cells mean more glyphs over the
 * same area.
 *
 *   bun scripts/asciify.ts in.jpg -o out.svg --cols 130
 *   bun scripts/asciify.ts in.jpg -o out.svg --palette phosphor
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

type Quad = readonly [number, number, number, number];
type RGB = readonly [number, number, number];

/**
 * Quadrant ink coverage per glyph: top-left, top-right, bottom-left,
 * bottom-right.
 *
 * Declared rather than measured. Rendering these through a font to
 * sample them gives identical blank signatures for every block
 * character on any system without that glyph coverage, which collapses
 * shape matching onto a single glyph. Block geometry is exactly known,
 * so there is nothing to measure.
 */
const BLOCK_SIGNATURES: Record<string, Quad> = {
  ' ': [0, 0, 0, 0],
  '░': [0.25, 0.25, 0.25, 0.25],
  '▒': [0.5, 0.5, 0.5, 0.5],
  '▓': [0.75, 0.75, 0.75, 0.75],
  '█': [1, 1, 1, 1],
  '▀': [1, 1, 0, 0],
  '▄': [0, 0, 1, 1],
  '▌': [1, 0, 1, 0],
  '▐': [0, 1, 0, 1],
  '▘': [1, 0, 0, 0],
  '▝': [0, 1, 0, 0],
  '▖': [0, 0, 1, 0],
  '▗': [0, 0, 0, 1],
};

const RAMPS = {
  blocks: ' ░▒▓█▀▄▌▐▖▗▘▝',
  /**
   * Shade blocks only, no half-blocks.
   *
   * `blocks` carries ▀▄▌▐ so that shape matching can put ink on the same
   * side of a cell as the edge running through it. That is right for a
   * portrait and wrong for a flat symbolic mass: with nothing to match,
   * every midtone lands on ▀ or ▄ and the fill comes out in horizontal
   * dashes. These five step cleanly through coverage instead.
   */
  shade: ' ░▒▓█',
  ascii: ' .:-=+*#%@',
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  dots: ' ⠁⠃⠇⠏⠟⠿⡿⣿',
} as const;

const PALETTES: Record<string, RGB[] | null> = {
  source: null,
  phosphor: [
    [0x0a, 0x14, 0x0c],
    [0x2e, 0x8b, 0x4a],
    [0x7a, 0xe5, 0x8f],
    [0xe6, 0xff, 0xec],
  ],
  amber: [
    [0x14, 0x0c, 0x02],
    [0x8a, 0x55, 0x06],
    [0xe8, 0xa0, 0x20],
    [0xff, 0xe6, 0xb8],
  ],
  pink: [
    [0x14, 0x04, 0x0e],
    [0x8a, 0x12, 0x55],
    [0xe8, 0x3d, 0x9b],
    [0xff, 0xc9, 0xe6],
  ],
  mono: [
    [0x00, 0x00, 0x00],
    [0x55, 0x55, 0x55],
    [0xaa, 0xaa, 0xaa],
    [0xff, 0xff, 0xff],
  ],
};

interface Options {
  image: string;
  out: string;
  cols: number;
  cell: number;
  ramp: keyof typeof RAMPS;
  palette: string;
  bg: string;
  alt: string;
  invert: boolean;
  shape: boolean;
  /** Cells below this normalised luminance render blank. */
  floor: number;
  /** <1 lifts midtones, >1 crushes them. */
  gamma: number;
  /**
   * Render every glyph in one colour and carry tone as opacity instead.
   * A luminance-ranked palette spends half its range on dark greys,
   * which disappear against anything but pure black — fine for a poster,
   * useless for art sitting on a coloured card.
   */
  ink: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    image: '',
    out: '',
    cols: 130,
    cell: 6,
    ramp: 'blocks',
    palette: 'source',
    bg: '#000000',
    alt: 'ASCII rendering',
    invert: false,
    shape: true,
    floor: 0,
    gamma: 1,
    ink: '',
  };

  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '-o' || a === '--out') opts.out = next();
    else if (a === '--cols') opts.cols = Number(next());
    else if (a === '--cell') opts.cell = Number(next());
    else if (a === '--ramp') opts.ramp = next() as keyof typeof RAMPS;
    else if (a === '--palette') opts.palette = next();
    else if (a === '--bg') opts.bg = next();
    else if (a === '--alt') opts.alt = next();
    else if (a === '--ink') opts.ink = next();
    else if (a === '--floor') opts.floor = Number(next());
    else if (a === '--gamma') opts.gamma = Number(next());
    else if (a === '--invert') opts.invert = true;
    else if (a === '--no-shape') opts.shape = false;
    else if (a === '-h' || a === '--help') {
      console.log(
        'bun scripts/asciify.ts <image> -o <out.svg|out.html> [--cols n] [--cell n]\n' +
          `  --ramp     ${Object.keys(RAMPS).join(' | ')}\n` +
          `  --palette  ${Object.keys(PALETTES).join(' | ')}\n` +
          '  --ink <css> one colour for every glyph, tone carried by opacity\n' +
          '  --floor n   drop cells darker than n (0-1) to blank — this is what\n' +
          '              isolates a subject and gives the image depth\n' +
          '  --gamma n   <1 lifts midtones, >1 crushes them\n' +
          '  --bg <css>  --alt <text>  --invert  --no-shape',
      );
      process.exit(0);
    } else rest.push(a);
  }

  opts.image = rest[0] ?? '';
  if (!opts.image || !opts.out) {
    console.error('usage: bun scripts/asciify.ts <image> -o <out.svg>');
    process.exit(1);
  }
  if (!(opts.ramp in RAMPS)) {
    console.error(`unknown ramp: ${opts.ramp}`);
    process.exit(1);
  }
  if (!(opts.palette in PALETTES)) {
    console.error(`unknown palette: ${opts.palette}`);
    process.exit(1);
  }
  return opts;
}

/**
 * Palettes are indexed by brightness, not nearest colour. Nearest-RGB
 * looks correct and is wrong here: a dark source collapses onto the
 * darkest swatch and renders black on black.
 */
function quantise(rgb: RGB, palette: RGB[] | null, lum: number): RGB {
  if (!palette) return rgb;
  const idx = Math.min(palette.length - 1, Math.max(0, Math.floor(lum * palette.length)));
  return palette[idx];
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

type Cell = {
  ch: string;
  /** Normalised 0-1 tone, kept so a consumer can re-pick the glyph. */
  lum: number;
  colour: RGB;
  alpha: number;
};

async function build(o: Options): Promise<string> {
  const img = sharp(o.image).ensureAlpha();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error('could not read image dimensions');

  // Character cells are about twice as tall as wide, so the vertical
  // sampling is halved or everything comes out stretched.
  const cols = o.cols;
  const rows = Math.max(1, Math.round((meta.height / meta.width) * cols * 0.5));

  // Resize to exactly two samples per cell axis: the 2x2 grid the shape
  // matcher needs, obtained in one pass rather than by re-reading pixels.
  const sw = cols * 2;
  const sh = rows * 2;
  const { data } = await img
    .resize(sw, sh, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const at = (x: number, y: number): RGB => {
    const i = (y * sw + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const lumOf = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  // Normalise exposure so a dark or flat source still uses the whole
  // ramp instead of bunching at one end.
  let lo = 1;
  let hi = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const l = lumOf(at(x, y));
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
  }
  const span = Math.max(1e-6, hi - lo);
  const norm = (l: number) => {
    const n = Math.min(1, Math.max(0, (l - lo) / span));
    return o.gamma === 1 ? n : Math.pow(n, o.gamma);
  };

  const ramp = [...RAMPS[o.ramp]];
  const palette = PALETTES[o.palette];
  const sigs = ramp.map((ch) => BLOCK_SIGNATURES[ch]);
  const shapeOk = o.shape && sigs.every(Boolean);
  if (o.shape && !shapeOk) {
    console.warn(`note: ramp '${o.ramp}' has no shape data — matching on brightness`);
  }

  const grid: Cell[][] = [];
  for (let ry = 0; ry < rows; ry++) {
    const row: Cell[] = [];
    for (let rx = 0; rx < cols; rx++) {
      const x0 = rx * 2;
      const y0 = ry * 2;
      const quads = [at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)];
      let q = quads.map((p) => norm(lumOf(p)));
      if (o.invert) q = q.map((v) => 1 - v);

      const lum = (q[0] + q[1] + q[2] + q[3]) / 4;

      // Everything below the floor drops out entirely. Depth in this
      // kind of art comes from how much of the frame is empty — without
      // a floor, a busy background fills every cell with low-value
      // texture and the subject never separates from it.
      if (o.floor > 0 && lum < o.floor) {
        row.push({ ch: ' ', lum: 0, colour: [0, 0, 0], alpha: 0 });
        continue;
      }

      let ch: string;
      if (shapeOk) {
        let best = 0;
        let bestErr = Infinity;
        for (let i = 0; i < ramp.length; i++) {
          const s = sigs[i];
          const err =
            (s[0] - q[0]) ** 2 + (s[1] - q[1]) ** 2 + (s[2] - q[2]) ** 2 + (s[3] - q[3]) ** 2;
          if (err < bestErr) {
            bestErr = err;
            best = i;
          }
        }
        ch = ramp[best];
      } else {
        ch = ramp[Math.min(ramp.length - 1, Math.floor(lum * ramp.length))];
      }

      const avg: RGB = [
        Math.round(quads.reduce((a, p) => a + p[0], 0) / 4),
        Math.round(quads.reduce((a, p) => a + p[1], 0) / 4),
        Math.round(quads.reduce((a, p) => a + p[2], 0) / 4),
      ];
      row.push({
        ch,
        lum,
        colour: quantise(avg, palette, lum),
        alpha: o.ink ? Math.min(1, 0.4 + lum * 0.7) : 1,
      });
    }
    grid.push(row);
  }

  if (extname(o.out) === '.html') return renderHtml(grid, o);
  if (extname(o.out) === '.json') return renderGrid(grid);
  return renderSvg(grid, o);
}

/** Collapse runs of identical colour so large images stay a sane size. */
function runs(row: Cell[]): { text: string; colour: RGB; alpha: number; start: number }[] {
  const out: { text: string; colour: RGB; alpha: number; start: number }[] = [];
  let i = 0;
  while (i < row.length) {
    const { colour } = row[i];
    const alpha = Math.round(row[i].alpha * 10) / 10;
    let j = i;
    let text = '';
    while (
      j < row.length &&
      row[j].colour.every((v, k) => v === colour[k]) &&
      Math.round(row[j].alpha * 10) / 10 === alpha
    ) {
      text += row[j].ch;
      j++;
    }
    out.push({ text, colour, alpha, start: i });
    i = j;
  }
  return out;
}

/**
 * The tone grid, for consumers that pick their own glyphs.
 *
 * An SVG bakes one glyph per cell, which is right for a static image and
 * useless for anything that wants to re-render — a cell cannot climb the
 * ramp under a cursor if the only thing shipped is the character it
 * landed on. This ships the luminance instead, one byte per cell, so the
 * choosing happens at paint time.
 */
function renderGrid(grid: Cell[][]): string {
  const cols = grid[0].length;
  const rows = grid.length;
  const bytes = new Uint8Array(cols * rows);
  grid.forEach((row, y) =>
    row.forEach((cell, x) => {
      bytes[y * cols + x] = Math.round(cell.lum * 255);
    }),
  );
  return JSON.stringify({ cols, rows, lum: Buffer.from(bytes).toString('base64') });
}

function renderSvg(grid: Cell[][], o: Options): string {
  const cw = o.cell;
  const ch = o.cell * 2;
  const w = grid[0].length * cw;
  const h = grid.length * ch;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeXml(o.alt)}">`,
    `<rect width="${w}" height="${h}" fill="${o.bg}"/>`,
    `<g font-family="ui-monospace,monospace" font-size="${(ch * 0.9).toFixed(1)}" text-anchor="middle" dominant-baseline="central">`,
  ];
  grid.forEach((row, ry) => {
    for (const r of runs(row)) {
      if (!r.text.trim()) continue;
      const [cr, cg, cb] = r.colour;
      const fill = o.ink ? o.ink : `rgb(${cr},${cg},${cb})`;
      const op = o.ink ? ` opacity="${r.alpha}"` : '';
      // `text-anchor: middle` centres the WHOLE run on x, so x has to be
      // the centre of the run, not the centre of its first cell. With
      // the first cell's centre a run of n glyphs sat (n-1)/2 cells too
      // far left. Shape-matched art hid this — its runs are usually one
      // glyph long, where the two agree — but a flat field produces runs
      // dozens of cells wide, and those tore the image in half.
      const span = r.text.length * cw;
      parts.push(
        `<text x="${(r.start * cw + span / 2).toFixed(1)}" y="${(ry * ch + ch / 2).toFixed(1)}" ` +
          `fill="${fill}"${op} textLength="${span}" ` +
          `lengthAdjust="spacingAndGlyphs">${escapeXml(r.text)}</text>`,
      );
    }
  });
  parts.push('</g>', '</svg>');
  return parts.join('\n');
}

function renderHtml(grid: Cell[][], o: Options): string {
  const body = grid
    .map((row) =>
      runs(row)
        .map((r) => `<span style="color:rgb(${r.colour.join(',')})">${escapeXml(r.text)}</span>`)
        .join(''),
    )
    .join('\n');
  return `<pre style="background:${o.bg};line-height:1;font-family:ui-monospace,monospace;font-size:${o.cell}px;margin:0">\n${body}\n</pre>`;
}

const opts = parseArgs(Bun.argv.slice(2));
const svg = await build(opts);
await mkdir(dirname(opts.out), { recursive: true });
await writeFile(opts.out, svg);
const size = (await Bun.file(opts.out).arrayBuffer()).byteLength;
console.log(`${opts.image} -> ${opts.out}  (${opts.cols} cols, ${Math.round(size / 1024)}K)`);
