import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type Motif = 'reach' | 'burst' | 'orb' | 'tunnel' | 'shards' | 'grid';

interface DitherThumbProps {
  motif: Motif;
  seed: number;
  width?: number;
  aspect?: 'video' | 'square';
  className?: string;
}

/* 4x4 Bayer ordered-dither threshold matrix, values 0..15. */
const BAYER: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Deterministic xorshift32 PRNG. Same seed -> same stream, always. */
function makeRng(seed: number): () => number {
  let state = seed ^ 0x9e3779b9;
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/**
 * Returns a 0..1 scalar for normalised coords (x, y in roughly [-1, 1]) and
 * scale `s` (a per-instance size/detail factor derived from the seed). Each
 * motif is a distinct hand-built field function.
 */
function field(motif: Motif, x: number, y: number, s: number): number {
  const r = Math.hypot(x, y);
  const theta = Math.atan2(y, x);

  switch (motif) {
    case 'burst': {
      // Radial spokes fading outward, modulated by angle.
      const spokes = Math.abs(Math.sin(theta * (5 + s * 3)));
      const falloff = Math.max(0, 1 - r * 0.9);
      return spokes * falloff + falloff * 0.15;
    }
    case 'orb': {
      // A shaded sphere: lit from upper-left, hard limb edge.
      const radius = 0.72;
      if (r > radius) return 0;
      const z = Math.sqrt(Math.max(0, radius * radius - x * x - y * y));
      const lightDir = { x: -0.55, y: -0.55, z: 0.62 };
      const nx = x / radius;
      const ny = y / radius;
      const nz = z / radius;
      const shade = nx * lightDir.x + ny * lightDir.y + nz * lightDir.z;
      return Math.max(0, shade);
    }
    case 'tunnel': {
      // Receding concentric rings, denser toward the vanishing point.
      const rings = Math.sin(1 / (r + 0.12) * (2.2 + s * 0.6));
      return (rings + 1) / 2;
    }
    case 'shards': {
      // Diagonal shard bands, offset per-band for a fractured look.
      const diag = x * 0.8 + y * 0.6;
      const band = Math.sin(diag * (8 + s * 4) + Math.sin(y * 3 + s) * 2);
      return band > 0 ? 1 : 0;
    }
    case 'grid': {
      // Perspective floor grid with a horizon line.
      if (y > -0.05) {
        const persp = y + 1.05; // 0 at horizon, grows downward
        const lines = Math.sin((x / (persp + 0.05)) * 18) ;
        const horizontals = Math.sin(6 / (persp + 0.08));
        return Math.max(lines > 0.85 ? 1 : 0, horizontals > 0.9 ? 1 : 0);
      }
      return Math.abs(y) > 0.9 ? 0.15 : 0;
    }
    case 'reach':
    default: {
      // Abstract reaching gradient: a diagonal sweep pierced by an arc.
      const sweep = (x + y) * 0.5 + 0.5;
      const arc = Math.sin((r - s * 0.1) * 6 - theta);
      return Math.max(0, sweep * 0.7 + arc * 0.3);
    }
  }
}

/**
 * Resolves a design token to a colour string canvas will accept.
 *
 * Reading the custom property directly is not enough: `getPropertyValue`
 * hands back the raw token text, which for this palette is `oklch(...)`.
 * Painting it through a probe element instead makes the browser resolve
 * it to a *used* colour value, which is always a valid canvas fillStyle.
 */
function resolveToken(name: string): string {
  const probe = document.createElement('span');
  probe.style.cssText = `color: var(${name}); position: absolute; visibility: hidden;`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

export default function DitherThumb({
  motif,
  seed,
  width = 96,
  aspect = 'square',
  className,
}: DitherThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const logicalW = width;
    const logicalH = aspect === 'video' ? Math.round((width * 9) / 16) : width;
    const upscale = 3;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    canvas.width = logicalW * upscale * dpr;
    canvas.height = logicalH * upscale * dpr;
    canvas.style.width = `${logicalW * upscale}px`;
    canvas.style.height = `${logicalH * upscale}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paint = () => {
      // Render the field as an alpha MASK rather than as coloured pixels:
      // lit pixels opaque, unlit fully transparent. The ink colour is then
      // composited in below, so this never has to know how the theme
      // serialises its colours.
      const mask = document.createElement('canvas');
      mask.width = logicalW;
      mask.height = logicalH;
      const maskCtx = mask.getContext('2d');
      if (!maskCtx) return;

      const image = maskCtx.createImageData(logicalW, logicalH);
      const rng = makeRng(seed);
      const s = ((seed % 20) + 20) % 20;

      for (let py = 0; py < logicalH; py++) {
        for (let px = 0; px < logicalW; px++) {
          const nx = (px / logicalW) * 2 - 1;
          const ny = (py / logicalH) * 2 - 1;
          let v = field(motif, nx, ny, s);
          v += (rng() - 0.5) * 0.1; // +/- 0.05 noise
          v = Math.max(0, Math.min(1, v));

          const threshold = (BAYER[(py % 4) * 4 + (px % 4)] + 0.5) / 16;
          const idx = (py * logicalW + px) * 4;
          image.data[idx] = 255;
          image.data[idx + 1] = 255;
          image.data[idx + 2] = 255;
          image.data[idx + 3] = v > threshold ? 255 : 0;
        }
      }
      maskCtx.putImageData(image, 0, 0);

      // Flood the ink colour, then keep only where the mask is opaque.
      // Unlit pixels stay transparent so the card surface shows through.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, logicalW * upscale, logicalH * upscale);
      ctx.fillStyle = resolveToken('--foreground');
      ctx.fillRect(0, 0, logicalW * upscale, logicalH * upscale);

      ctx.globalCompositeOperation = 'destination-in';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mask, 0, 0, logicalW, logicalH, 0, 0, logicalW * upscale, logicalH * upscale);
      ctx.globalCompositeOperation = 'source-over';
    };

    paint();

    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [motif, seed, width, aspect]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('block', className)}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden="true"
    />
  );
}
