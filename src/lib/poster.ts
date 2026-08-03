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
