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
  /** Per-plate ink override, per theme. A plate with its own ink is
      painted FLAT in that colour — no tone ramp to hot, no colour
      families — which is what a solid silhouette subject needs. */
  ink?: LabRGB;
  lightInk?: LabRGB;
  /** Set false for a subject that runs off the frame edge on purpose:
      the in-grid edge feather would fade it out where it should simply
      continue. */
  feather?: boolean;
  /** Slow horizontal bob, in pixels. A background that moves a little,
      slowly, reads as distant and alive; zero (the default) is still. */
  sway?: number;
  /** Keep the tone ramp but take no colour families — for clouds and
      other things that should stay faint and white. */
  mono?: boolean;
  /** Which colour family leads on this plate. `b` biases the positional
      blend toward the second family (the bloom colours), `a` toward the
      first. Unset keeps the plain 50/50-by-position behaviour. */
  fam?: 'a' | 'b';
  /** Paint this plate as a hole in the scene: every cell filled flat
      with the page background, no ramp, no hue. A subject that should
      read as negative space — the flowers stop for it. */
  void?: boolean;
  /** Region of the grid this plate keeps or excludes, in fractions.
      Two plates sharing one grid on opposite sides of a `crop` are how
      a subject drawn inside a bigger plate becomes its own parallax
      layer without new art. Edges feather over ~2% so the split never
      shows as a rectangle. */
  crop?: {
    x: number;
    y: number;
    w: number;
    h: number;
    keep: 'inside' | 'outside';
  };
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
  /** Light-theme mix, when the wash needs to sit lighter on paper. */
  lightMix?: number;
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
