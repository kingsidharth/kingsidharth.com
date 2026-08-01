import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────
   Fixed candidate set — hand-authored logits for "the next word after
   a sentence about programming verbs". Order is the authoring order;
   display order is always re-sorted by probability.
   ──────────────────────────────────────────────────────────────────── */
interface Candidate {
  token: string;
  logit: number;
}

const CANDIDATES: Candidate[] = [
  { token: 'build', logit: 3.2 },
  { token: 'ship', logit: 2.85 },
  { token: 'use', logit: 2.6 },
  { token: 'read', logit: 2.3 },
  { token: 'start', logit: 2.15 },
  { token: 'practise', logit: 1.95 },
  { token: 'teach', logit: 1.8 },
  { token: 'break', logit: 1.62 },
  { token: 'copy', logit: 1.4 },
  { token: 'watch', logit: 1.25 },
  { token: 'write', logit: 1.05 },
  { token: 'study', logit: 0.92 },
  { token: 'play', logit: 0.74 },
  { token: 'ask', logit: 0.6 },
  { token: 'fail', logit: 0.42 },
  { token: 'measure', logit: 0.28 },
  { token: 'fork', logit: 0.1 },
  { token: 'wait', logit: -0.1 },
  { token: 'skim', logit: -0.28 },
  { token: 'talk', logit: -0.52 },
];

type TruncationMode = 'off' | 'top-k' | 'top-p';

interface ScoredToken {
  token: string;
  probability: number;
  kept: boolean;
}

const TEMP_MIN = 0.05;
const TEMP_MAX = 2.0;
const ANGLE_MIN = -135;
const ANGLE_MAX = 135;
const TEMP_DEFAULT = 1.0;
const K_DEFAULT = 8;
const P_DEFAULT = 0.9;
const CHART_ROWS = 11;

/** Log-scale mapping: the knob sweeps -135deg..+135deg linearly over
 * log(T), because temperature is felt/used multiplicatively (0.1 -> 1.0
 * is as big a perceptual step as 1.0 -> 10.0), not additively. */
function temperatureToAngle(t: number): number {
  const logMin = Math.log(TEMP_MIN);
  const logMax = Math.log(TEMP_MAX);
  const logT = Math.log(clamp(t, TEMP_MIN, TEMP_MAX));
  const frac = (logT - logMin) / (logMax - logMin);
  return ANGLE_MIN + frac * (ANGLE_MAX - ANGLE_MIN);
}

function angleToTemperature(angle: number): number {
  const clampedAngle = clamp(angle, ANGLE_MIN, ANGLE_MAX);
  const frac = (clampedAngle - ANGLE_MIN) / (ANGLE_MAX - ANGLE_MIN);
  const logMin = Math.log(TEMP_MIN);
  const logMax = Math.log(TEMP_MAX);
  return Math.exp(logMin + frac * (logMax - logMin));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Softmax with temperature. Logits are divided by T first (higher T
 * flattens the distribution, lower T sharpens it), then we subtract the
 * running max before exponentiating so exp() never overflows — the
 * classic numerical-stability trick; it leaves the softmax output
 * unchanged since it cancels in the normalisation. */
function softmax(candidates: Candidate[], temperature: number): number[] {
  const scaled = candidates.map((c) => c.logit / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

function shannonEntropyBits(probabilities: number[]): number {
  let bits = 0;
  for (const p of probabilities) {
    if (p < 1e-12) continue;
    bits += -p * Math.log2(p);
  }
  return bits;
}

interface DistributionResult {
  scored: ScoredToken[];
  keptCount: number;
  topProbability: number;
  entropyBits: number;
  discardedMassPct: number;
  cutoffCumulative: number | null;
}

function computeDistribution(
  temperature: number,
  mode: TruncationMode,
  k: number,
  p: number,
): DistributionResult {
  const probabilities = softmax(CANDIDATES, temperature);
  const withProbs = CANDIDATES.map((c, i) => ({ token: c.token, probability: probabilities[i] }));
  const sorted = [...withProbs].sort((a, b) => b.probability - a.probability);

  let keptTokens: Set<string>;
  let cutoffCumulative: number | null = null;

  if (mode === 'top-k') {
    keptTokens = new Set(sorted.slice(0, k).map((t) => t.token));
  } else if (mode === 'top-p') {
    // Inclusive boundary: accumulate descending probability and keep the
    // token that CROSSES the threshold, not just the ones strictly below it.
    let cumulative = 0;
    const kept = new Set<string>();
    for (const t of sorted) {
      if (cumulative >= p) break;
      cumulative += t.probability;
      kept.add(t.token);
    }
    cutoffCumulative = cumulative;
    keptTokens = kept;
  } else {
    keptTokens = new Set(sorted.map((t) => t.token));
  }

  const scored: ScoredToken[] = sorted.map((t) => ({
    token: t.token,
    probability: t.probability,
    kept: keptTokens.has(t.token),
  }));

  const keptCount = scored.filter((t) => t.kept).length;
  const discardedMass = scored.filter((t) => !t.kept).reduce((sum, t) => sum + t.probability, 0);
  const entropyBits = shannonEntropyBits(probabilities);

  return {
    scored,
    keptCount,
    topProbability: sorted[0]?.probability ?? 0,
    entropyBits,
    discardedMassPct: discardedMass * 100,
    cutoffCumulative,
  };
}

/** Renormalised sampling over only the kept tokens — probabilities are
 * divided by their own sum so they add back up to 1 before drawing. */
function sampleToken(scored: ScoredToken[]): { token: string; probability: number } {
  const kept = scored.filter((t) => t.kept);
  const keptSum = kept.reduce((sum, t) => sum + t.probability, 0);
  let roll = Math.random() * keptSum;
  for (const t of kept) {
    roll -= t.probability;
    if (roll <= 0) {
      return { token: t.token, probability: t.probability / keptSum };
    }
  }
  const last = kept[kept.length - 1];
  return { token: last.token, probability: last.probability / keptSum };
}

interface TapeEntry {
  id: number;
  temperature: number;
  mode: TruncationMode;
  token: string;
  probability: number;
}

/** Sanitise a `useId()` value for use inside `url(#…)` — raw ids contain
 * `:` delimiters that are invalid there and silently fall back to black. */
function sanitiseId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '');
}

/* ────────────────────────────────────────────────────────────────────
   Small hardware primitives
   ──────────────────────────────────────────────────────────────────── */
function Screw({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('screw absolute', className)} />;
}

function GaugeCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="gauge-value tabular-nums">{value}</span>
      <span className="gauge-label">{label}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Rotary knob — machined dial with tick scale, knurled rim and a
   raised cap. Interaction/keyboard logic is unchanged from the math
   spec above; only the render is a full visual rebuild.
   ──────────────────────────────────────────────────────────────────── */
interface TemperatureKnobProps {
  temperature: number;
  onChange: (next: number) => void;
}

function TemperatureKnob({ temperature, onChange }: TemperatureKnobProps) {
  const knobRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const gradientId = `knob-face-${sanitiseId(useId())}`;

  const angle = temperatureToAngle(temperature);

  const angleFromPointer = useCallback((clientX: number, clientY: number): number => {
    const el = knobRef.current;
    if (!el) return angle;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Pointer angle measured from the +Y axis (12 o'clock), clockwise.
    const rawDeg = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI;
    return clamp(rawDeg, ANGLE_MIN, ANGLE_MAX);
  }, [angle]);

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
    const coarse = event.shiftKey;
    const logStep = coarse ? 0.15 : 0.03;
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -1;
    else return;
    event.preventDefault();
    const logMin = Math.log(TEMP_MIN);
    const logMax = Math.log(TEMP_MAX);
    const currentLog = Math.log(clamp(temperature, TEMP_MIN, TEMP_MAX));
    const nextLog = clamp(currentLog + delta * logStep, logMin, logMax);
    onChange(Math.exp(nextLog));
  };

  const size = 150;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 54;

  // 11 ticks across the full sweep — below the current value read amber
  // (temperature already "dialled in"), above read dim (headroom).
  const tickCount = 11;
  const ticks = Array.from({ length: tickCount }, (_, i) => ANGLE_MIN + (i / (tickCount - 1)) * (ANGLE_MAX - ANGLE_MIN));

  const knurlCount = 48;
  const knurls = Array.from({ length: knurlCount }, (_, i) => (360 / knurlCount) * i);

  const scaleLabels = [
    { value: TEMP_MIN, label: '0.05' },
    { value: 0.32, label: '0.32' },
    { value: TEMP_MAX, label: '2.0' },
  ];

  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size + 20 }}>
      <svg
        ref={knobRef}
        role="slider"
        tabIndex={0}
        aria-label="Temperature"
        aria-valuemin={TEMP_MIN}
        aria-valuemax={TEMP_MAX}
        aria-valuenow={Number(temperature.toFixed(3))}
        aria-valuetext={`${temperature.toFixed(2)}`}
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
              tone (bottom-right) — reads as a lit, milled metal face in
              both themes since both stops are theme tokens. */}
          <radialGradient id={gradientId} cx="35%" cy="30%" r="80%">
            <stop offset="0%" style={{ stopColor: 'var(--color-chassis-hi)' }} />
            <stop offset="60%" style={{ stopColor: 'var(--color-chassis-lo)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-chassis-edge)' }} />
          </radialGradient>
        </defs>

        {/* Tick scale */}
        {ticks.map((deg) => {
          const isBelow = deg <= angle;
          const rad = (deg * Math.PI) / 180;
          const x1 = cx + Math.sin(rad) * (radius + 8);
          const y1 = cy - Math.cos(rad) * (radius + 8);
          const x2 = cx + Math.sin(rad) * (radius + 15);
          const y2 = cy - Math.cos(rad) * (radius + 15);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={1.5}
              strokeLinecap="round"
              className={isBelow ? 'stroke-primary' : 'stroke-muted-foreground/40'}
            />
          );
        })}

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={radius} className="fill-chassis-hi stroke-chassis-edge" strokeWidth={1.5} />

        {/* Knurled rim */}
        {knurls.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = cx + Math.sin(rad) * (radius - 5);
          const y1 = cy - Math.cos(rad) * (radius - 5);
          const x2 = cx + Math.sin(rad) * (radius - 1);
          const y2 = cy - Math.cos(rad) * (radius - 1);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={1}
              className="stroke-chassis-edge/70"
            />
          );
        })}

        {/* Knob face */}
        <circle cx={cx} cy={cy} r={radius - 8} fill={`url(#${gradientId})`} stroke="var(--color-chassis-edge)" strokeWidth={1} />

        {/* Inner raised cap */}
        <circle cx={cx} cy={cy} r={radius - 26} className="fill-chassis-hi/80 stroke-chassis-edge/60" strokeWidth={1} />

        {/* Pointer */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.sin((angle * Math.PI) / 180) * (radius - 14)}
          y2={cy - Math.cos((angle * Math.PI) / 180) * (radius - 14)}
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-primary"
        />
        <circle cx={cx} cy={cy} r={3.5} className="fill-chassis-edge" />
      </svg>

      {scaleLabels.map((tick) => {
        const deg = temperatureToAngle(tick.value);
        const rad = (deg * Math.PI) / 180;
        const x = cx + Math.sin(rad) * (radius + 26);
        const y = cy - Math.cos(rad) * (radius + 26);
        return (
          <span
            key={tick.value}
            className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] tabular-nums text-muted-foreground"
            style={{ left: x, top: y }}
          >
            {tick.label}
          </span>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Truncation toggle bank — vertical bat-handle switches.
   ──────────────────────────────────────────────────────────────────── */
interface ToggleBankProps {
  mode: TruncationMode;
  onChange: (mode: TruncationMode) => void;
}

const MODE_LABELS: { value: TruncationMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'top-k', label: 'Top-k' },
  { value: 'top-p', label: 'Top-p' },
];

function ToggleBank({ mode, onChange }: ToggleBankProps) {
  return (
    <div role="group" aria-label="Truncation mode" className="flex justify-between gap-3">
      {MODE_LABELS.map((item) => {
        const engaged = mode === item.value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={engaged}
            onClick={() => onChange(item.value)}
            className="flex flex-1 flex-col items-center gap-2.5 focus-visible:outline-none"
          >
            <span className="flex h-11 w-7 items-start justify-center rounded-sm border border-chassis-edge bg-chassis-lo/50 pt-1">
              <span
                aria-hidden="true"
                className={cn(
                  'h-[34px] w-[3px] rounded-full bg-gradient-to-b from-chassis-hi to-chassis-lo shadow-[0_1px_1px_rgb(0_0_0_/_0.35)] transition-transform duration-150 ease-out motion-reduce:transition-none',
                  engaged ? 'translate-y-2 from-primary to-primary' : 'translate-y-0',
                )}
              />
            </span>
            <span
              className={cn(
                'font-condensed text-[13px] uppercase tracking-[0.1em]',
                engaged ? 'font-semibold text-primary' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Bar chart — CRT readout of the sorted distribution.
   ──────────────────────────────────────────────────────────────────── */
interface DistributionChartProps {
  scored: ScoredToken[];
  mode: TruncationMode;
  k: number;
  p: number;
  cutoffCumulative: number | null;
}

function DistributionChart({ scored, mode, k, p, cutoffCumulative }: DistributionChartProps) {
  const idBase = sanitiseId(useId());
  const stripeId = `stripe-${idBase}`;
  const hatchId = `hatch-${idBase}`;

  const visible = scored.slice(0, CHART_ROWS);
  const remaining = scored.length - visible.length;
  const maxProb = scored[0]?.probability ?? 1;

  const rowHeight = 24;
  const labelWidth = 84;
  const chartWidth = 420;
  const barMaxWidth = chartWidth - labelWidth - 70;
  const height = visible.length * rowHeight + 30;

  const lastKeptIndex = visible.reduce((acc, t, i) => (t.kept ? i : acc), -1);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${chartWidth} ${height}`}
        role="img"
        aria-label="Token probability distribution"
        className="min-w-[320px]"
      >
        <defs>
          {/* Kept bars: fine horizontal hatch over a darker amber base, so
              the fill reads as a lined instrument-panel block, not a flat
              rectangle. */}
          <pattern id={stripeId} width={4} height={3} patternUnits="userSpaceOnUse">
            <rect width={4} height={3} className="fill-primary" fillOpacity={0.32} />
            <line x1={0} y1={0.5} x2={4} y2={0.5} strokeWidth={1} className="stroke-primary" />
          </pattern>
          {/* Discarded bars: dim diagonal hatch. */}
          <pattern id={hatchId} width={5} height={5} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={5} height={5} className="fill-transparent" />
            <line x1={0} y1={0} x2={0} y2={5} strokeWidth={1} className="stroke-primary/35" />
          </pattern>
        </defs>

        {/* Axis. Stops at the last row rather than at `height`, which
            also spans the footer line beneath the chart. */}
        <line
          x1={labelWidth}
          y1={0}
          x2={labelWidth}
          y2={visible.length * rowHeight}
          strokeWidth={1}
          className="stroke-primary/70"
        />

        {visible.map((t, i) => {
          const y = i * rowHeight;
          const barWidth = maxProb > 0 ? (t.probability / maxProb) * barMaxWidth : 0;
          return (
            <g key={t.token} transform={`translate(0, ${y})`}>
              <text
                x={labelWidth - 8}
                y={rowHeight / 2 + 4}
                textAnchor="end"
                className={cn(
                  'font-mono text-[13px] tabular-nums',
                  t.kept ? 'fill-primary' : 'fill-primary/40',
                )}
              >
                {t.token}
              </text>
              <rect
                x={labelWidth}
                y={4}
                width={Math.max(barWidth, 0)}
                height={rowHeight - 10}
                fill={t.kept ? `url(#${stripeId})` : `url(#${hatchId})`}
                className="transition-[width] duration-300 ease-out motion-reduce:transition-none"
              />
              <text
                x={labelWidth + barWidth + 6}
                y={rowHeight / 2 + 4}
                className="fill-primary/60 font-mono text-[11px] tabular-nums"
              >
                {t.probability.toFixed(3)}
              </text>
              {i === lastKeptIndex && mode !== 'off' && (
                <g>
                  <text
                    x={chartWidth}
                    y={-4}
                    textAnchor="end"
                    className="fill-primary font-mono text-[11px] tabular-nums"
                  >
                    {mode === 'top-k'
                      ? `K = ${k}`
                      : `P = ${p.toFixed(2)} · Σ ${(cutoffCumulative ?? 0).toFixed(3)}`}
                  </text>
                  <line
                    x1={0}
                    y1={rowHeight}
                    x2={chartWidth}
                    y2={rowHeight}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    className="stroke-primary"
                  />
                </g>
              )}
            </g>
          );
        })}

        {remaining > 0 && (
          <text x={0} y={height - 6} className="fill-primary/45 font-mono text-[11px] tabular-nums">
            + {remaining} more below threshold
          </text>
        )}
      </svg>
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
  disabled: boolean;
  ariaLabel: string;
  onChange: (value: number) => void;
}

function Fader({ value, min, max, step, disabled, ariaLabel, onChange }: FaderProps) {
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
   Main instrument
   ──────────────────────────────────────────────────────────────────── */
export default function TemperatureInstrument() {
  const [temperature, setTemperature] = useState(TEMP_DEFAULT);
  const [mode, setMode] = useState<TruncationMode>('top-k');
  const [k, setK] = useState(K_DEFAULT);
  const [p, setP] = useState(P_DEFAULT);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const tapeIdRef = useRef(0);

  const distribution = useMemo(
    () => computeDistribution(temperature, mode, k, p),
    [temperature, mode, k, p],
  );

  const handleDraw = useCallback(() => {
    const drawn = sampleToken(distribution.scored);
    tapeIdRef.current += 1;
    setTape((prev) =>
      [
        {
          id: tapeIdRef.current,
          temperature,
          mode,
          token: drawn.token,
          probability: drawn.probability,
        },
        ...prev,
      ].slice(0, 12),
    );
  }, [distribution, temperature, mode]);

  const latest = tape[0];

  return (
    <div className="chassis relative w-full">
      <Screw className="left-2.5 top-2.5" />
      <Screw className="right-2.5 top-2.5" />
      <Screw className="bottom-2.5 left-2.5" />
      <Screw className="bottom-2.5 right-2.5" />

      {/* Header strip */}
      <div className="panel-divider-h flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 sm:px-8">
        <span className="plaque flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em]">
          <span aria-hidden="true" className="led led-on" />
          Next-token distribution
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Model — local · {CANDIDATES.length} candidates · recomputed live
        </span>
      </div>

      <div className="flex flex-col min-[900px]:flex-row">
        {/* Left control panel */}
        <div className="flex flex-col gap-9 px-6 py-7 sm:px-8 min-[900px]:w-[370px] min-[900px]:shrink-0">
          {/* Temperature */}
          <div className="flex flex-col gap-4">
            <span className="nameplate text-[13px] tracking-[0.18em]">Temperature</span>
            <div className="flex items-center gap-6">
              <TemperatureKnob temperature={temperature} onChange={setTemperature} />
              <div className="flex flex-col">
                <span className="readout-xl tabular-nums">{temperature.toFixed(2)}</span>
                <span className="nameplate mt-1">T</span>
              </div>
            </div>
          </div>

          {/* Truncation */}
          <div className="flex flex-col gap-5">
            <span className="nameplate">Truncation</span>
            <ToggleBank mode={mode} onChange={setMode} />

            <div className={cn('flex flex-col gap-2 transition-opacity', mode === 'off' && 'opacity-40')}>
              <div className="flex items-center justify-between">
                <span className="font-condensed text-[13px] uppercase tracking-[0.1em] text-muted-foreground">
                  {mode === 'top-p' ? 'p' : 'k'}
                </span>
                <span className="font-mono text-lg tabular-nums text-primary">
                  {mode === 'top-p' ? p.toFixed(2) : k}
                </span>
              </div>
              {mode === 'top-p' ? (
                <Fader
                  value={p}
                  min={0.05}
                  max={1}
                  step={0.01}
                  disabled={mode !== 'top-p'}
                  ariaLabel="Top-p threshold"
                  onChange={setP}
                />
              ) : (
                <Fader
                  value={k}
                  min={1}
                  max={20}
                  step={1}
                  disabled={mode !== 'top-k'}
                  ariaLabel="Top-k count"
                  onChange={setK}
                />
              )}
            </div>
          </div>

          {/* Gauges */}
          <div className="panel-divider-h pt-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <GaugeCell value={`${distribution.entropyBits.toFixed(2)}`} label="entropy bits" />
              <GaugeCell value={`${distribution.keptCount}`} label="kept" />
              <GaugeCell value={distribution.topProbability.toFixed(3)} label="p top" />
              <GaugeCell value={`${distribution.discardedMassPct.toFixed(1)}%`} label="discarded" />
            </div>
          </div>
        </div>

        <div className="panel-divider-v hidden min-[900px]:block" />

        {/* Right screen */}
        <div className="crt min-w-0 flex-1 p-5 sm:p-6">
          <p className="mb-4 font-mono text-[13px]">
            <span className="text-screen-dim">prompt → </span>
            <span className="text-screen-fg">the best way to learn ai is to</span>
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-screen-fg align-middle motion-safe:animate-pulse"
            />
          </p>
          <DistributionChart
            scored={distribution.scored}
            mode={mode}
            k={k}
            p={p}
            cutoffCumulative={distribution.cutoffCumulative}
          />
        </div>
      </div>

      {/* Tape strip */}
      <div className="panel-divider-h flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-8">
        <span className="font-mono text-[13px] tabular-nums">
          <span className="text-muted-foreground">Tape — </span>
          {latest ? (
            <span className="text-primary">
              {latest.token} · p={latest.probability.toFixed(3)}
            </span>
          ) : (
            <span className="text-muted-foreground">no draws yet</span>
          )}
        </span>
        <button
          type="button"
          onClick={handleDraw}
          className="rounded-sm border border-chassis-edge bg-primary px-4 py-2 font-condensed text-[13px] font-semibold uppercase tracking-[0.12em] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/_0.25),inset_0_-1px_0_rgb(0_0_0_/_0.25)] transition-transform active:translate-y-px"
        >
          Draw a token
        </button>
      </div>
    </div>
  );
}
