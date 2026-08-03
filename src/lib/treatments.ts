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
export type Treatment = 'blocks' | 'diagonal' | 'lines' | 'diamond' | 'disco';

export const TREATMENT_RAMPS: Record<Treatment, string> = {
  blocks: ' ░▒▓█',
  diagonal: ' ╱╳▓█',
  lines: ' ╎│┃█',
  diamond: ' ·◇◈◆',
  // Same coverage steps as blocks; what makes it a mirror ball is the
  // specular hit applied per cell in the renderer, not the characters.
  disco: ' ░▒▓█',
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

export function readFringeOffset(root: HTMLElement): number {
  return FRINGE_OFFSET[root.getAttribute('data-fringe') ?? 'off'] ?? 0;
}
