/* ──────────────────────────────────────────────────────────────────
   Transformer engine — shared scene data.

   Pure data + tiny geometry helpers. No three.js, no React: safe to
   import from both the island shell and the lazy WebGL canvas.
   ────────────────────────────────────────────────────────────────── */

export type LevelId =
  | 'overview'
  | 'tokens'
  | 'embeddings'
  | 'block'
  | 'attention'
  | 'mlp'
  | 'deep'
  | 'output'
  | 'packed';

/** Tour order — scroll drives it, Enter walks it. */
export const LEVELS: LevelId[] = [
  'overview',
  'tokens',
  'embeddings',
  'block',
  'attention',
  'mlp',
  'deep',
  'output',
  'packed',
];

export const LEVEL_INDEX = Object.fromEntries(
  LEVELS.map((l, i) => [l, i]),
) as Record<LevelId, number>;

/** Levels in which the whole-stack group is on screen. */
export const STACK_LEVELS: LevelId[] = ['overview', 'tokens', 'embeddings', 'output'];

export const BREADCRUMB: Record<LevelId, string[]> = {
  overview: ['ENGINE'],
  tokens: ['ENGINE', 'TOKENIZER'],
  embeddings: ['ENGINE', 'EMBEDDINGS'],
  block: ['ENGINE', 'BLOCK 01'],
  attention: ['ENGINE', 'BLOCK 01', 'ATTENTION'],
  mlp: ['ENGINE', 'BLOCK 01', 'MLP'],
  deep: ['ENGINE', 'BLOCK ×96'],
  output: ['ENGINE', 'OUTPUT'],
  packed: ['ENGINE', 'PACKED'],
};

/** The level each breadcrumb index jumps back to. */
export const CRUMB_TARGET: LevelId[] = ['overview', 'block'];

export type Vec3 = [number, number, number];

export interface CameraPreset {
  position: Vec3;
  target: Vec3;
  /** World-space extent the viewport should frame at this level. */
  fit: { w: number; h: number };
}

/**
 * Orthographic camera poses, one per level. Zoom is derived per-frame
 * from the canvas size (`zoomFor`), so framing survives any aspect —
 * the story canvas is portrait on mobile, landscape on desktop.
 *
 * One continuous machine, running top → bottom along NEGATIVE y —
 * every scene in EngineCanvas is authored directly in that world, and
 * the dive scenes (attention, mlp, deep) are translated so they sit
 * where they belong in the machine — the heatmap at y≈−3.35 where the
 * block keeps it, the MLP below that, the deep stack continuing down.
 */
export const CAMERA: Record<LevelId, CameraPreset> = {
  overview: { position: [11, 9, 11], target: [0, -3.1, 0], fit: { w: 6.6, h: 8.8 } },
  tokens: { position: [7, 4.5, 7], target: [0, -0.25, 0], fit: { w: 4.6, h: 2.4 } },
  embeddings: { position: [7, 5, 7], target: [0, -1.6, 0], fit: { w: 4.6, h: 2.8 } },
  block: { position: [8, 7.5, 8], target: [0, -4.7, 0], fit: { w: 6.6, h: 7.2 } },
  attention: { position: [8, 7.5, 8], target: [-0.8, -6.35, 0.4], fit: { w: 9.8, h: 4.8 } },
  mlp: { position: [8, 7, 8], target: [-0.9, -6.2, 0], fit: { w: 10.2, h: 5.8 } },
  deep: { position: [9, 7, 9], target: [0, -10.9, 0], fit: { w: 7.0, h: 6.8 } },
  output: { position: [9, 8.5, 9], target: [0, -5.9, 0], fit: { w: 4.4, h: 3.0 } },
  packed: { position: [8, 6, 8], target: [0, 1.45, 0], fit: { w: 4.4, h: 4.4 } },
};

/** Pixels-per-world-unit that frames the level's `fit` box, with margin. */
export function zoomFor(level: LevelId, width: number, height: number): number {
  const { fit } = CAMERA[level];
  return Math.min(width / fit.w, height / fit.h) * 0.92;
}

/**
 * Palette. One fine blue ink for the machine, a hotter blue for
 * emphasis and heat, a cyan-leaning blue for the human/input side,
 * cool blue-greys for structure, and one rationed warm accent on the
 * residual stream. Two versions: on the dark bench "hot" is a lighter
 * sky; on cream paper the same values wash out, so light mode runs
 * darker and denser and "hot" is the deeper blue. WebGL can't read
 * CSS custom properties, so these hexes are the single source — the
 * DOM labels in EngineCanvas use them too.
 */
export type Palette = {
  blue: string;
  blueHot: string;
  steel: string;
  steelLight: string;
  rust: string;
  cyan: string;
};

const PALETTE_DARK: Palette = {
  blue: '#4d84e6',
  blueHot: '#a3c2ff',
  steel: '#4a5570',
  steelLight: '#7c8aa8',
  rust: '#d08a4e',
  cyan: '#79d2f2',
};

const PALETTE_LIGHT: Palette = {
  blue: '#2f5fd0',
  blueHot: '#1e40af',
  steel: '#4a5570',
  steelLight: '#6d7894',
  rust: '#a86428',
  cyan: '#0e7ea8',
};

/**
 * The live palette. Light is the default because the document is.
 * `setEnginePalette` MUTATES this object on a theme flip — every
 * reader holds the same reference, and the shell remounts the canvas
 * so materials are re-created with the new hexes. Anything that
 * copies a value out (a module-level `COLORS.blueHot`) goes stale.
 */
export const COLORS: Palette = { ...PALETTE_LIGHT };

export function setEnginePalette(light: boolean) {
  Object.assign(COLORS, light ? PALETTE_LIGHT : PALETTE_DARK);
}

/** The worked example, end to end: question in, answer out. */
export const INPUT_TEXT = 'What is the capital of France?';

export const TOKENS: { text: string; id: number }[] = [
  { text: 'What', id: 3923 },
  { text: ' is', id: 318 },
  { text: ' the', id: 262 },
  { text: ' capital', id: 3139 },
  { text: ' of', id: 286 },
  { text: ' France', id: 4881 },
  { text: '?', id: 30 },
];

export const NEXT_TOKEN = 'Paris';

/**
 * The 12 edges of a box centred at `c` with size `s`, flattened to 24
 * endpoints for a segments-style line.
 */
export function boxEdges(c: Vec3, s: Vec3): Vec3[] {
  const [cx, cy, cz] = c;
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const p: Vec3[] = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
  ];
  const e: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return e.flatMap(([a, b]) => [p[a], p[b]]);
}

/** A flat grid plate (n × n cells) lying in the XY plane, as segments. */
export function gridEdges(c: Vec3, n: number, cell: number): Vec3[] {
  const [cx, cy, cz] = c;
  const half = (n * cell) / 2;
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const o = -half + i * cell;
    out.push([cx - half, cy + o, cz], [cx + half, cy + o, cz]);
    out.push([cx + o, cy - half, cz], [cx + o, cy + half, cz]);
  }
  return out;
}

/** Centres of the lower-triangle cells (i >= j) of an n × n grid. */
export function triangleCells(c: Vec3, n: number, cell: number): Vec3[] {
  const [cx, cy, cz] = c;
  const half = (n * cell) / 2;
  const out: Vec3[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col <= row; col++) {
      out.push([
        cx - half + col * cell + cell / 2,
        cy + half - row * cell - cell / 2,
        cz,
      ]);
    }
  }
  return out;
}

/** GELU, sampled for a glyph line. Range x ∈ [-2.5, 2.5]. */
export function geluPoints(c: Vec3, width: number, height: number, steps = 48): Vec3[] {
  const gelu = (x: number) =>
    (x / 2) * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3)));
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = -2.5 + (i / steps) * 5;
    out.push([c[0] + (x / 5) * width, c[1] + ((gelu(x) + 0.17) / 2.8) * height, c[2]]);
  }
  return out;
}
