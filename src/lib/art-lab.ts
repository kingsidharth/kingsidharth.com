/**
 * Types for the artwork lab.
 *
 * They live here rather than in `ArtLabScene.astro` because a page has
 * to import them to declare a palette, and an .astro file exports a
 * component, not its frontmatter types.
 *
 * Temporary, along with the rest of the lab.
 */
export type LabRGB = [number, number, number];

export interface LabPlate {
  /** `static/art/<art>-grid.json`. */
  art: string;
  /** 0 at the back, 1 in your face. Drives scale and nothing else. */
  depth: number;
  alpha: number;
  /** Cells below this tone are not drawn. The lever that makes a near
      plate a scattering rather than a fainter slab. */
  cut: number;
  /** Relative parallax travel under the pointer. */
  par: number;
  /** The one plate that answers the pointer and carries the drift. */
  focus?: boolean;
}

export interface LabPalette {
  /** Tone ramp ends, per theme. */
  ink: LabRGB;
  hot: LabRGB;
  lightInk: LabRGB;
  lightHot: LabRGB;
  /** Two colour families, picked by a smooth positional field rather
      than by brightness. Omit for a scene that stays monochrome. */
  famA?: LabRGB[];
  famB?: LabRGB[];
  famALight?: LabRGB[];
  famBLight?: LabRGB[];
  /** How much of the mark the colour takes, 0-1. */
  mix?: number;
}

export interface LabDrifter {
  art: string;
  /** Width as a fraction of the frame. */
  size: number;
  /** Vertical position of its top edge, 0-1. */
  y: number;
  /** Travel, as fractions of the viewport width. */
  from: number;
  to: number;
  /** One crossing, in seconds. */
  secs: number;
  ink: LabRGB;
  lightInk: LabRGB;
}
