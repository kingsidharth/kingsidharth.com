#!/usr/bin/env bun
/**
 * One-off repair for the traced field plates in `static/art`.
 *
 * The single traced grid was cut into depth bands, and the rectangle
 * around the cat was cleared out of the near/mid plates and refilled
 * with flat dim texture — which reads as a hard-edged notch: a straight
 * horizontal top, vertical sides, and a flat grey against the dithered
 * flowers either side.
 *
 * This refills that rectangle with the plate's own flower texture,
 * mirrored from immediately to its left, crossfaded over fifteen cells
 * at both edges so no new seam is minted. Full strength, no dimming —
 * the cat is painted as an opaque void on its own plate, so flowers may
 * run right up to its silhouette; that is the point.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RECT = { x0: 195, x1: 295, y0: 60, y1: 130 };
const DONOR = { x0: 95, x1: 195 };
const FEATHER = 15;

for (const name of ['lab-field-near', 'lab-field-mid']) {
  const path = `static/art/${name}-grid.json`;
  const grid = JSON.parse(readFileSync(path, 'utf8')) as {
    cols: number;
    rows: number;
    lum: string;
  };
  const lum = Uint8Array.from(atob(grid.lum), (c) => c.charCodeAt(0));
  const { cols, rows } = grid;

  for (let y = RECT.y0; y < Math.min(RECT.y1, rows); y += 1) {
    for (let x = RECT.x0; x < Math.min(RECT.x1, cols); x += 1) {
      const k = x - RECT.x0;
      const src = DONOR.x0 + (k % (DONOR.x1 - DONOR.x0));
      const mirrored = lum[y * cols + src] ?? 0;
      const original = lum[y * cols + x] ?? 0;
      // Crossfade at both edges of the rectangle; solid mirror inside.
      const left = Math.min(1, k / FEATHER);
      const right = Math.min(1, (RECT.x1 - 1 - x) / FEATHER);
      const w = Math.min(left, right);
      lum[y * cols + x] = Math.round(mirrored * w + original * (1 - w));
    }
  }

  writeFileSync(
    path,
    JSON.stringify({ ...grid, lum: btoa(String.fromCharCode(...lum)) }),
  );
  console.log(`${name}: refilled ${RECT.x1 - RECT.x0}x${RECT.y1 - RECT.y0}`);
}
