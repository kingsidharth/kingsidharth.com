/**
 * Glyph families the hero artwork can be rendered through.
 *
 * Shared between the settings panel and the canvas so the swatch in the
 * picker is drawn from the same string the renderer uses. A swatch that
 * merely resembles the output is worse than none — it teaches the wrong
 * thing about a control whose entire job is choosing how something looks.
 *
 * Every ramp runs dark to light, blank first. They are deliberately kept
 * to characters that exist in ordinary monospace faces: box-drawing and
 * geometric shapes render everywhere, where the prettier half-filled
 * shade variants drop to tofu on a plain Linux stack.
 */
export type Treatment = 'blocks' | 'diagonal' | 'lines' | 'diamond' | 'cross' | 'disco';

/*
 * Every ramp now opens on a faint mark rather than a shade block.
 *
 * The darkest visible rung covers most of the frame — sky, shadowed
 * rock, the far edges of everything — and when that rung was `░` the
 * background read as a solid grey field with the picture sitting on it.
 * A middle dot puts almost no ink down, so the empty parts of the
 * composition stay empty and the layers have something to separate
 * against.
 */
export const TREATMENT_RAMPS: Record<Treatment, string> = {
  blocks: ' ·░▒▓█',
  diagonal: ' ·╱╳▓█',
  lines: ' ·╎│┃█',
  diamond: ' ·◇◈◆',
  // Crosses. Denser than diagonal at the same coverage because each
  // glyph puts ink on both axes, which is what makes it read as a woven
  // screen rather than as hatching.
  cross: ' ·+✕✖█',
  // Same coverage steps as blocks; what makes it a mirror ball is the
  // specular hit applied per cell in the renderer, not the characters.
  disco: ' ·░▒▓█',
};

/**
 * What heated cells switch to, whatever the base treatment.
 *
 * The switch of alphabet is the effect — under the cursor the picture
 * stops being a printed screen and starts looking like something being
 * decoded. Brightening alone just reads as a light.
 */
export const HOT_RAMP = ' .:-=+*#%@';

/** Channel offset in cell widths, per fringing setting. */
export const FRINGE_OFFSET: Record<string, number> = {
  off: 0,
  subtle: 0.35,
  strong: 0.9,
};

export function readTreatment(root: HTMLElement): Treatment {
  const value = root.getAttribute('data-treatment');
  return value && value in TREATMENT_RAMPS ? (value as Treatment) : 'blocks';
}

/**
 * Ambient field modes the artwork can run under, on top of the pointer's
 * plain heat. Both are opt-in; `off` is the still print.
 *
 * - `scatter` sweeps shove the glyphs aside and they spring home
 * - `bloom` sparse cells breathe up the ramp on their own
 */
export type FieldMode = 'off' | 'scatter' | 'bloom';

export function readField(root: HTMLElement): FieldMode {
  const value = root.getAttribute('data-field');
  return value === 'scatter' || value === 'bloom' ? value : 'off';
}

export function readFringeOffset(root: HTMLElement): number {
  return FRINGE_OFFSET[root.getAttribute('data-fringe') ?? 'off'] ?? 0;
}

/**
 * Coverage for the ramp.
 *
 * On a dark field, tone climbs with the source: highlights are full
 * blocks, shadows are thin. On paper the ramp runs the other way —
 * ink sits in the shadows, highlights stay the page — which is how
 * an engraving carries light. `lift` (a pointer, a heat) still
 * climbs after that, so reaching into the picture never thins it.
 */
export function paperTone(base: number, lift = 0, invert = false): number {
  const core = invert ? 1 - base : base;
  const t = core + lift;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/**
 * Glyph at a tone. `lit` is 0..1 after any invert. `step` is a
 * fractional offset used by plates that dissolve between rungs.
 */
export function pickGlyph(ramp: string, lit: number, step = 0): string {
  const last = ramp.length - 1;
  if (last < 0) return ' ';
  const i = Math.min(last, Math.max(0, Math.floor(lit * ramp.length + step)));
  return ramp[i] ?? ' ';
}
