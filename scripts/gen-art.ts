#!/usr/bin/env bun
/**
 * Generate ASCII artwork for the card banners.
 *
 * There is no image model here, so the source is synthesised: each
 * motif is a signed field sampled on a grid, then rendered through the
 * same block-glyph matcher asciify.ts uses — quadrant coverage per
 * cell, so edges pick a glyph whose ink sits on the same side.
 *
 * Output lands in static/ and is referenced with <img>, NOT inlined.
 * Inlining put ~1400 extra <text> nodes on the homepage, which is the
 * wrong trade for a page targeting 95+ PageSpeed — an <img> renders the
 * SVG in its own document at no DOM cost and caches separately.
 *
 * Deterministic, so a given motif is identical between builds.
 *
 *   bun run art
 */

import { mkdir, writeFile } from 'node:fs/promises';

type Quad = readonly [number, number, number, number];

const SIGNATURES: Record<string, Quad> = {
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
const RAMP = Object.keys(SIGNATURES);

/** Deterministic value noise, so builds are reproducible. */
function noise(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(x: number, y: number, seed: number, scale: number): number {
  const gx = x * scale;
  const gy = y * scale;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = noise(ix, iy, seed);
  const b = noise(ix + 1, iy, seed);
  const c = noise(ix, iy + 1, seed);
  const d = noise(ix + 1, iy + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/**
 * Fields return 0..1 for normalised coords in roughly [-1, 1].
 * They are deliberately abstract: a literal cat or hand drawn this way
 * reads as a mistake, whereas a strong abstract form survives being
 * reduced to thirteen glyphs.
 */
const FIELDS: Record<string, (x: number, y: number) => number> = {
  // An aperture: iris rings around a dark pupil, cut by scan bands.
  aperture(x, y) {
    const r = Math.hypot(x, y * 1.15);
    if (r < 0.22) return 0.02;
    const iris = Math.max(0, 1 - Math.abs(r - 0.5) * 2.4);
    const rays = 0.5 + 0.5 * Math.sin(Math.atan2(y, x) * 22);
    const bands = 0.7 + 0.3 * Math.sin(y * 26);
    return Math.max(0, iris * (0.55 + 0.45 * rays) * bands + smooth(x, y, 3, 6) * 0.12);
  },

  // Torn signal: stacked waveform bands that shear as they descend.
  signal(x, y) {
    const shear = smooth(0, y, 7, 5) * 1.4 - 0.7;
    const xx = x + shear;
    const band = Math.sin(y * 12 + Math.sin(xx * 3) * 2);
    const carrier = Math.exp(-Math.abs(band) * 3.2);
    const drop = smooth(xx, y, 11, 9) > 0.72 ? 0 : 1;
    return Math.max(0, carrier * drop * (1 - Math.abs(x) * 0.35));
  },

  // Receding tunnel: rings compressing toward a vanishing point.
  descent(x, y) {
    const r = Math.hypot(x, y);
    const rings = Math.sin(1 / (r + 0.1) * 3.1);
    const falloff = Math.exp(-r * r * 1.6);
    return Math.max(0, (0.5 + 0.5 * rings) * falloff + Math.exp(-r * r * 40) * 0.8);
  },

  // A burst: spokes radiating from an off-centre core.
  spark(x, y) {
    const dx = x - 0.05;
    const dy = y + 0.08;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const spokes = Math.pow(Math.abs(Math.sin(a * 9 + r * 3)), 1.7);
    return Math.max(0, spokes * Math.exp(-r * r * 2.6) + Math.exp(-r * r * 30) * 0.9);
  },

  // Emanation: concentric wavefronts leaving a source at the bottom.
  broadcast(x, y) {
    const dx = x;
    const dy = y + 0.75;
    const r = Math.hypot(dx, dy * 0.8);
    const waves = Math.sin(r * 14 - 1.2);
    const cone = Math.max(0, 1 - Math.abs(Math.atan2(dx, dy + 0.001)) * 0.85);
    return Math.max(0, (0.5 + 0.5 * waves) * cone * Math.exp(-r * 1.1));
  },
};

interface Job {
  name: string;
  field: keyof typeof FIELDS;
  ink: string;
  floor: number;
}

const JOBS: Job[] = [
  { name: 'aperture', field: 'aperture', ink: '#f2f9ff', floor: 0.26 },
  { name: 'signal', field: 'signal', ink: '#ffffff', floor: 0.22 },
  { name: 'descent', field: 'descent', ink: '#f0fff7', floor: 0.2 },
  { name: 'spark', field: 'spark', ink: '#fff8ec', floor: 0.2 },
  { name: 'broadcast', field: 'broadcast', ink: '#f2fff9', floor: 0.18 },
];

const COLS = 46;
const ROWS = 62; // portrait, matching the 3:4 cards
const CELL = 7;

function render(job: Job): string {
  const f = FIELDS[job.field];

  // Sample at twice the grid so each cell has its own 2x2 quadrants.
  const sw = COLS * 2;
  const sh = ROWS * 2;
  const buf = new Float32Array(sw * sh);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const nx = (x / sw) * 2 - 1;
      const ny = (y / sh) * 2 - 1;
      const v = f(nx, ny);
      buf[y * sw + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = Math.max(1e-6, hi - lo);

  const rows: { text: string; start: number; alpha: number }[][] = [];
  for (let ry = 0; ry < ROWS; ry++) {
    const cells: { ch: string; alpha: number }[] = [];
    for (let rx = 0; rx < COLS; rx++) {
      const q = [
        buf[(ry * 2) * sw + rx * 2],
        buf[(ry * 2) * sw + rx * 2 + 1],
        buf[(ry * 2 + 1) * sw + rx * 2],
        buf[(ry * 2 + 1) * sw + rx * 2 + 1],
      ].map((v) => (v - lo) / span);

      const lum = (q[0] + q[1] + q[2] + q[3]) / 4;
      if (lum < job.floor) {
        cells.push({ ch: ' ', alpha: 0 });
        continue;
      }

      let best = 0;
      let bestErr = Infinity;
      for (let i = 0; i < RAMP.length; i++) {
        const s = SIGNATURES[RAMP[i]];
        const err =
          (s[0] - q[0]) ** 2 + (s[1] - q[1]) ** 2 + (s[2] - q[2]) ** 2 + (s[3] - q[3]) ** 2;
        if (err < bestErr) {
          bestErr = err;
          best = i;
        }
      }
      // Brighter cells sit further forward. Opacity carries the depth
      // that thirteen glyphs cannot.
      cells.push({ ch: RAMP[best], alpha: Math.min(1, 0.5 + lum * 0.6) });
    }

    // Collapse runs of equal opacity into single <text> nodes.
    const runs: { text: string; start: number; alpha: number }[] = [];
    let i = 0;
    while (i < cells.length) {
      const a = Math.round(cells[i].alpha * 10) / 10;
      let j = i;
      let text = '';
      while (j < cells.length && Math.round(cells[j].alpha * 10) / 10 === a) {
        text += cells[j].ch;
        j++;
      }
      if (text.trim()) runs.push({ text, start: i, alpha: a });
      i = j;
    }
    rows.push(runs);
  }

  const w = COLS * CELL;
  const h = ROWS * CELL;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="presentation">`,
    `<g font-family="ui-monospace,monospace" font-size="${CELL * 1.05}" fill="${job.ink}" text-anchor="middle" dominant-baseline="central">`,
  ];
  rows.forEach((runs, ry) => {
    for (const r of runs) {
      out.push(
        `<text x="${(r.start * CELL + CELL / 2).toFixed(1)}" y="${(ry * CELL + CELL / 2).toFixed(1)}" ` +
          `opacity="${r.alpha}" textLength="${r.text.length * CELL}" lengthAdjust="spacingAndGlyphs">${esc(r.text)}</text>`,
      );
    }
  });
  out.push('</g>', '</svg>');
  return out.join('\n');
}

await mkdir('static/art', { recursive: true });
for (const job of JOBS) {
  const svg = render(job);
  await writeFile(`static/art/${job.name}.svg`, svg);
  console.log(`static/art/${job.name}.svg  ${Math.round(svg.length / 1024)}K`);
}
