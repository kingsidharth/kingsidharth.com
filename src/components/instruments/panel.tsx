/* ──────────────────────────────────────────────────────────────────
   Shared hardware primitives for the sampling instruments.

   Three panels on the sampling page are built from the same parts —
   the same dial, the same fader, the same screws. Keeping them here
   means the dial's feel is defined once: change the easing and every
   panel on the page changes weight together.
   ────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { TEMP_MAX, TEMP_MIN } from '@/lib/sampling';

export const ANGLE_MIN = -135;
export const ANGLE_MAX = 135;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Round an SVG coordinate to three decimals before it reaches an
 * attribute. Not cosmetic: React serialises a float on the server and
 * re-serialises it on the client, and the two can disagree in the
 * seventeenth digit (`29.100653599424767` vs `29.10065359942476`), which
 * React reports as a hydration mismatch on an otherwise identical tree.
 * Three decimals is far below a device pixel at any size this renders at.
 */
export function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Sanitise a `useId()` value for use inside `url(#…)` — raw ids contain
 *  `:` delimiters that are invalid there and silently fall back to black. */
export function sanitiseId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Linear, not logarithmic. The dial has to read as a *balance*: 1.0 is
 * the neutral setting a model ships at, so it belongs at twelve o'clock
 * with cooling to the left and heating to the right. A log scale would
 * put 1.0 somewhere off-centre and the dial would stop meaning anything
 * at a glance.
 */
export function temperatureToAngle(t: number): number {
  const frac = (clamp(t, TEMP_MIN, TEMP_MAX) - TEMP_MIN) / (TEMP_MAX - TEMP_MIN);
  return ANGLE_MIN + frac * (ANGLE_MAX - ANGLE_MIN);
}

export function angleToTemperature(angle: number): number {
  const frac = (clamp(angle, ANGLE_MIN, ANGLE_MAX) - ANGLE_MIN) / (ANGLE_MAX - ANGLE_MIN);
  return TEMP_MIN + frac * (TEMP_MAX - TEMP_MIN);
}

/* ── the weight of the dial ───────────────────────────────────────
   The pointer sets a target; the value chases it, so a flick of the
   wrist reads as a mechanism being turned rather than a number being
   assigned. The chase also does real work downstream: it turns one
   instantaneous jump into a run of intermediate frames, so bars sweep
   to their new heights instead of teleporting. */

/** Time constant of the chase, in ms. */
const EASE_TAU = 90;
/** Close enough, in temperature units, to stop and snap. */
const EASE_EPSILON = 0.002;
/** A tab backgrounded mid-chase resumes with a huge frame gap. Clamping
 *  it keeps the dial from teleporting on the first frame back. */
const EASE_MAX_FRAME_MS = 64;

export function useEasedTemperature(target: number, enabled: boolean): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    let last: number | null = null;

    /* Exponential decay against elapsed time rather than a fixed fraction
       per frame: a per-frame rate makes the chase twice as fast on a
       120Hz display as on a 60Hz one. */
    const step = (now: number) => {
      const elapsed = last === null ? 16 : Math.min(now - last, EASE_MAX_FRAME_MS);
      last = now;

      const diff = target - valueRef.current;
      if (Math.abs(diff) < EASE_EPSILON) {
        valueRef.current = target;
        setValue(target);
        frameRef.current = null;
        return;
      }

      valueRef.current += diff * (1 - Math.exp(-elapsed / EASE_TAU));
      setValue(valueRef.current);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [target, enabled]);

  return value;
}

/**
 * Trails `value` by `delay`, resetting on every change. Used to hold a
 * drawn completion still while a control is in motion: re-rolling the
 * sentence on every frame of a drag is a strobe, not a reading.
 */
export function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return settled;
}

export const SETTLE_MS = 260;

export function useReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
}

export function Screw({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('screw absolute', className)} />;
}

/** The four corner screws every full panel wears. */
export function PanelScrews() {
  return (
    <>
      <Screw className="left-2.5 top-2.5" />
      <Screw className="right-2.5 top-2.5" />
      <Screw className="bottom-2.5 left-2.5" />
      <Screw className="bottom-2.5 right-2.5" />
    </>
  );
}

export function GaugeCell({
  value,
  label,
  valueClassName,
}: {
  value: string;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={cn('gauge-value tabular-nums', valueClassName)}>{value}</span>
      <span className="gauge-label">{label}</span>
    </div>
  );
}

/** The strip across the top of a panel: lamp, name, and a live readout. */
export function PanelHead({
  label,
  meta,
  lit = true,
}: {
  label: string;
  meta?: React.ReactNode;
  lit?: boolean;
}) {
  return (
    <div className="panel-divider-h flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
      <span className="plaque flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-semibold">
        <span aria-hidden="true" className={cn('led', lit && 'led-on')} />
        {label}
      </span>
      {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Temperature dial — machined, with 1.0 at twelve o'clock.
   ──────────────────────────────────────────────────────────────────── */
interface TemperatureDialProps {
  /** The chased value — what the needle points at. */
  temperature: number;
  /**
   * Where the dial has been *set*, which is ahead of the needle while the
   * easing catches up. Arrow-key steps accumulate from here: stepping from
   * the lagging value means a held-down arrow key keeps recomputing from a
   * position it has already moved past, and the dial crawls.
   */
  target: number;
  onChange: (next: number) => void;
  size?: number;
}

const SCALE_LABELS = [
  { value: TEMP_MIN, label: '0' },
  { value: 1, label: '1.0' },
  { value: TEMP_MAX, label: '2.0' },
];

export function TemperatureDial({ temperature, target, onChange, size = 152 }: TemperatureDialProps) {
  const dialRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const gradientId = `dial-face-${sanitiseId(useId())}`;

  const angle = temperatureToAngle(temperature);

  const angleFromPointer = useCallback((clientX: number, clientY: number): number => {
    const el = dialRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Pointer angle measured from the +Y axis (12 o'clock), clockwise.
    const rawDeg = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI;
    return clamp(rawDeg, ANGLE_MIN, ANGLE_MAX);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = true;
    (event.target as Element).setPointerCapture(event.pointerId);
    onChange(angleToTemperature(angleFromPointer(event.clientX, event.clientY)));
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    onChange(angleToTemperature(angleFromPointer(event.clientX, event.clientY)));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    if ((event.target as Element).hasPointerCapture(event.pointerId)) {
      (event.target as Element).releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 0.25 : 0.05;
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -1;
    else if (event.key === 'Home') {
      event.preventDefault();
      onChange(TEMP_MIN);
      return;
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(TEMP_MAX);
      return;
    } else return;
    event.preventDefault();
    onChange(clamp(target + delta * step, TEMP_MIN, TEMP_MAX));
  };

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.355;

  /* Odd count so the middle tick lands exactly on 1.0 — the neutral
     detent the whole dial is arranged around. */
  const tickCount = 13;
  const ticks = Array.from(
    { length: tickCount },
    (_, i) => ANGLE_MIN + (i / (tickCount - 1)) * (ANGLE_MAX - ANGLE_MIN),
  );

  const knurlCount = 48;
  const knurls = Array.from({ length: knurlCount }, (_, i) => (360 / knurlCount) * i);

  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      <svg
        ref={dialRef}
        role="slider"
        tabIndex={0}
        aria-label="Temperature"
        aria-valuemin={TEMP_MIN}
        aria-valuemax={TEMP_MAX}
        aria-valuenow={Number(temperature.toFixed(2))}
        aria-valuetext={`${temperature.toFixed(2)}${temperature === 1 ? ' — neutral' : ''}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <defs>
          {/* Off-centre highlight (top-left) fading to the darkest chassis
              tone — reads as lit, milled metal in both themes since both
              stops are theme tokens. */}
          <radialGradient id={gradientId} cx="35%" cy="30%" r="80%">
            <stop offset="0%" style={{ stopColor: 'var(--color-chassis-hi)' }} />
            <stop offset="60%" style={{ stopColor: 'var(--color-chassis-lo)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-chassis-edge)' }} />
          </radialGradient>
        </defs>

        {/* Tick scale. Ticks between neutral and the needle light up, so
            the dial shows how far it has been pushed *from 1.0* rather
            than from the bottom of the range — that is the reading that
            matters on a balance dial. */}
        {ticks.map((deg) => {
          const lit = deg >= Math.min(0, angle) && deg <= Math.max(0, angle);
          const neutral = Math.abs(deg) < 0.001;
          const rad = (deg * Math.PI) / 180;
          const inner = radius + 7;
          const outer = radius + (neutral ? 17 : 13);
          return (
            <line
              key={deg}
              x1={r3(cx + Math.sin(rad) * inner)}
              y1={r3(cy - Math.cos(rad) * inner)}
              x2={r3(cx + Math.sin(rad) * outer)}
              y2={r3(cy - Math.cos(rad) * outer)}
              strokeWidth={neutral ? 2 : 1.5}
              strokeLinecap="round"
              className={
                neutral ? 'stroke-contrast' : lit ? 'stroke-primary' : 'stroke-muted-foreground/35'
              }
            />
          );
        })}

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={radius} className="fill-chassis-hi stroke-chassis-edge" strokeWidth={1.5} />

        {/* Knurled rim */}
        {knurls.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={r3(cx + Math.sin(rad) * (radius - 5))}
              y1={r3(cy - Math.cos(rad) * (radius - 5))}
              x2={r3(cx + Math.sin(rad) * (radius - 1))}
              y2={r3(cy - Math.cos(rad) * (radius - 1))}
              strokeWidth={1}
              className="stroke-chassis-edge/70"
            />
          );
        })}

        {/* Dial face */}
        <circle
          cx={cx}
          cy={cy}
          r={radius - 8}
          fill={`url(#${gradientId})`}
          stroke="var(--color-chassis-edge)"
          strokeWidth={1}
        />

        {/* Inner raised cap */}
        <circle cx={cx} cy={cy} r={radius - 26} className="fill-chassis-hi/80 stroke-chassis-edge/60" strokeWidth={1} />

        {/* Pointer */}
        <line
          x1={cx}
          y1={cy}
          x2={r3(cx + Math.sin((angle * Math.PI) / 180) * (radius - 13))}
          y2={r3(cy - Math.cos((angle * Math.PI) / 180) * (radius - 13))}
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-primary"
        />
        <circle cx={cx} cy={cy} r={3.5} className="fill-chassis-edge" />
      </svg>

      {SCALE_LABELS.map((tick) => {
        const deg = temperatureToAngle(tick.value);
        const rad = (deg * Math.PI) / 180;
        const reach = radius + 27;
        return (
          <span
            key={tick.label}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] tabular-nums',
              tick.value === 1 ? 'text-contrast' : 'text-muted-foreground',
            )}
            style={{ left: r3(cx + Math.sin(rad) * reach), top: r3(cy - Math.cos(rad) * reach) }}
          >
            {tick.label}
          </span>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Fader — native range input for accessibility, with a knurled block
   overlaid as the visual thumb sitting in an inset groove.
   ──────────────────────────────────────────────────────────────────── */
interface FaderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: number) => void;
}

export function Fader({ value, min, max, step, disabled = false, ariaLabel, onChange }: FaderProps) {
  const fraction = clamp((value - min) / (max - min), 0, 1);
  return (
    <div className="relative h-[26px] w-full">
      <div className="groove absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary/50"
        style={{ width: `${fraction * 100}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
        className={cn(
          'absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:h-[26px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:opacity-0',
          '[&::-moz-range-thumb]:h-[26px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className="knurl pointer-events-none absolute top-1/2 h-[26px] w-[18px] -translate-y-1/2 -translate-x-1/2 rounded-sm border border-chassis-edge shadow-sm"
        style={{ left: `${fraction * 100}%` }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Prompt selector row.

   Deliberately not `role="tablist"`. On the logprobs panel this control
   only exists below 900px — above it all three columns are on screen at
   once and the row is display:none — so tab semantics would describe a
   widget that, at most viewport widths, is not there. A pressed-button
   group is true at every width.
   ──────────────────────────────────────────────────────────────────── */
interface PromptTabsProps<T extends string> {
  items: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  label?: string;
}

export function PromptTabs<T extends string>({
  items,
  active,
  onChange,
  className,
  label = 'Prompt',
}: PromptTabsProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('flex gap-1.5', className)}>
      {items.map((item) => {
        const on = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex-1 rounded-sm border px-3 py-2 font-condensed text-[13px] transition-colors',
              'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary',
              on
                ? 'border-primary/60 bg-primary/10 font-semibold text-primary'
                : 'border-chassis-edge text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
