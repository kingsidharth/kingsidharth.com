/**
 * The coloured ground a card's artwork sits on.
 *
 * Two radial blooms over a linear sweep. Angle and bloom positions come
 * off a seed, so every card is its own composition while staying
 * identical between builds.
 *
 * Colour rather than a flat fill because these cards rest desaturated
 * and saturate under the cursor, and there is nothing to desaturate in a
 * single flat tone — the hover has to have something to bring back.
 */
export function posterGround(
  seed: number,
  stops: { from: string; via: string; to: string },
): string {
  const angle = 120 + (seed % 7) * 15;
  const bx = 20 + (seed % 5) * 12;
  const by = 25 + (seed % 3) * 18;

  return [
    `radial-gradient(60% 45% at ${bx}% ${by}%, ${stops.via} 0%, transparent 70%)`,
    `radial-gradient(70% 55% at ${100 - bx}% ${100 - by}%, ${stops.to} 0%, transparent 72%)`,
    `linear-gradient(${angle}deg, ${stops.from} 0%, ${stops.via} 55%, ${stops.to} 100%)`,
  ].join(',');
}

/**
 * The grounds guides are printed on, picked by position in the index.
 *
 * Shared between the guide's card in the rail and the cover it opens
 * onto, so arriving at a guide is the same object growing rather than a
 * second design of it. Authors never choose these — a row only reads as
 * a set if nobody picks colours freely.
 */
export const GUIDE_PALETTES = [
  { seed: 12, from: 'oklch(0.36 0.17 342)', via: 'oklch(0.25 0.13 322)', to: 'oklch(0.42 0.16 12)' },
  { seed: 19, from: 'oklch(0.3 0.1 202)', via: 'oklch(0.22 0.07 192)', to: 'oklch(0.36 0.11 162)' },
  { seed: 5, from: 'oklch(0.32 0.13 285)', via: 'oklch(0.24 0.1 262)', to: 'oklch(0.4 0.11 208)' },
  { seed: 33, from: 'oklch(0.38 0.14 42)', via: 'oklch(0.27 0.11 28)', to: 'oklch(0.44 0.15 72)' },
  { seed: 26, from: 'oklch(0.33 0.11 158)', via: 'oklch(0.23 0.09 168)', to: 'oklch(0.4 0.13 132)' },
] as const;

export function guidePalette(index: number) {
  return GUIDE_PALETTES[((index % GUIDE_PALETTES.length) + GUIDE_PALETTES.length) % GUIDE_PALETTES.length]!;
}
