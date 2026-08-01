import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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

/* ────────────────────────────────────────────────────────────────────
   Rotary knob
   ──────────────────────────────────────────────────────────────────── */
interface TemperatureKnobProps {
  temperature: number;
  onChange: (next: number) => void;
}

function TemperatureKnob({ temperature, onChange }: TemperatureKnobProps) {
  const knobRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

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
    let logStep = coarse ? 0.15 : 0.03;
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

  const knurlCount = 32;
  const knurls = Array.from({ length: knurlCount }, (_, i) => {
    const deg = (360 / knurlCount) * i;
    return deg;
  });

  const ticks = [
    { value: TEMP_MIN, label: '0.05' },
    { value: 0.32, label: '0.32' },
    { value: TEMP_MAX, label: '2.0' },
  ];

  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 50;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size + 34 }}>
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
        {/* Outer tick scale */}
        {Array.from({ length: 25 }, (_, i) => i).map((i) => {
          const deg = ANGLE_MIN + (i / 24) * (ANGLE_MAX - ANGLE_MIN);
          const isBelow = deg <= angle;
          const rad = (deg * Math.PI) / 180;
          const x1 = cx + Math.sin(rad) * (radius + 8);
          const y1 = cy - Math.cos(rad) * (radius + 8);
          const x2 = cx + Math.sin(rad) * (radius + 13);
          const y2 = cy - Math.cos(rad) * (radius + 13);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={1}
              className={isBelow ? 'stroke-accent' : 'stroke-muted-foreground/50'}
            />
          );
        })}

        {/* Knob body */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          className="fill-chassis-hi stroke-chassis-edge"
          strokeWidth={1.5}
        />

        {/* Knurling around the rim */}
        {knurls.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = cx + Math.sin(rad) * (radius - 6);
          const y1 = cy - Math.cos(rad) * (radius - 6);
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
              className="stroke-chassis-edge"
            />
          );
        })}

        <circle cx={cx} cy={cy} r={radius - 10} className="fill-chassis-lo" />

        {/* Pointer line */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.sin((angle * Math.PI) / 180) * (radius - 14)}
          y2={cy - Math.cos((angle * Math.PI) / 180) * (radius - 14)}
          strokeWidth={2.5}
          strokeLinecap="round"
          className="stroke-primary"
        />
        <circle cx={cx} cy={cy} r={3} className="fill-primary" />
      </svg>

      {ticks.map((tick) => {
        const deg = temperatureToAngle(tick.value);
        const rad = (deg * Math.PI) / 180;
        const x = cx + Math.sin(rad) * (radius + 24);
        const y = cy - Math.cos(rad) * (radius + 24);
        return (
          <span
            key={tick.value}
            className="readout absolute -translate-x-1/2 -translate-y-1/2 text-[10px] text-muted-foreground"
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
   Rocker switch bank
   ──────────────────────────────────────────────────────────────────── */
interface RockerBankProps {
  mode: TruncationMode;
  onChange: (mode: TruncationMode) => void;
}

const MODE_LABELS: { value: TruncationMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'top-k', label: 'Top-k' },
  { value: 'top-p', label: 'Top-p' },
];

function RockerBank({ mode, onChange }: RockerBankProps) {
  return (
    <div role="group" aria-label="Truncation mode" className="flex gap-2">
      {MODE_LABELS.map((item) => {
        const engaged = mode === item.value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={engaged}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex-1 rounded-md border border-chassis-edge bg-chassis-lo p-1 transition-colors',
            )}
          >
            <span
              className={cn(
                'block rounded-sm border border-chassis-edge px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wide transition-all duration-150',
                engaged
                  ? 'translate-y-0.5 bg-primary text-primary-foreground shadow-inner'
                  : 'bg-chassis-hi text-muted-foreground',
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
   Bar chart
   ──────────────────────────────────────────────────────────────────── */
interface DistributionChartProps {
  scored: ScoredToken[];
  keptCount: number;
  mode: TruncationMode;
  k: number;
  p: number;
  cutoffCumulative: number | null;
}

function DistributionChart({ scored, keptCount, mode, k, p, cutoffCumulative }: DistributionChartProps) {
  // `useId()` returns delimiters like «r0» that are not valid inside a
  // `url(#…)` reference — strip everything that is not alphanumeric or the
  // fill silently falls back to black.
  const patternId = `hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const visible = scored.slice(0, CHART_ROWS);
  const remaining = scored.length - visible.length;
  const maxProb = scored[0]?.probability ?? 1;

  const rowHeight = 22;
  const labelWidth = 76;
  const valueWidth = 56;
  const chartWidth = 320;
  const barMaxWidth = chartWidth - labelWidth - valueWidth;
  const height = visible.length * rowHeight + 28;

  const lastKeptIndex = visible.reduce(
    (acc, t, i) => (t.kept ? i : acc),
    -1,
  );

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${chartWidth} ${height}`}
        role="img"
        aria-label="Token probability distribution"
        className="min-w-[280px]"
      >
        <defs>
          <pattern
            id={patternId}
            width={5}
            height={5}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width={5} height={5} className="fill-transparent" />
            <line x1={0} y1={0} x2={0} y2={5} strokeWidth={1.5} className="stroke-muted-foreground/60" />
          </pattern>
        </defs>

        {visible.map((t, i) => {
          const y = i * rowHeight;
          const barWidth = maxProb > 0 ? (t.probability / maxProb) * barMaxWidth : 0;
          return (
            <g key={t.token} transform={`translate(0, ${y})`}>
              <text
                x={labelWidth - 6}
                y={rowHeight / 2 + 4}
                textAnchor="end"
                className={cn(
                  'font-mono text-[11px]',
                  t.kept ? 'fill-foreground' : 'fill-muted-foreground',
                )}
              >
                {t.token}
              </text>
              <rect
                x={labelWidth}
                y={4}
                width={barMaxWidth}
                height={rowHeight - 10}
                className="fill-muted/40"
              />
              <rect
                x={labelWidth}
                y={4}
                width={barWidth}
                height={rowHeight - 10}
                fill={t.kept ? undefined : `url(#${patternId})`}
                className={cn(
                  'transition-[width] duration-300 ease-out motion-reduce:transition-none',
                  t.kept && 'fill-accent',
                )}
              />
              <text
                x={labelWidth + barMaxWidth + 8}
                y={rowHeight / 2 + 4}
                className={cn(
                  'font-mono text-[11px]',
                  t.kept ? 'fill-foreground' : 'fill-muted-foreground',
                )}
              >
                {t.probability.toFixed(3)}
              </text>
              {i === lastKeptIndex && mode !== 'off' && (
                <g>
                  <line
                    x1={0}
                    y1={rowHeight}
                    x2={chartWidth}
                    y2={rowHeight}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    className="stroke-primary"
                  />
                  {/* Parked at the right end of the bar track, just below
                      the cut line. Discarded bars are short by definition,
                      so that strip is always empty — unlike the token
                      column on the left or the value column on the right,
                      each of which the label would otherwise sit on top of. */}
                  <text
                    x={labelWidth + barMaxWidth - 4}
                    y={rowHeight + 13}
                    textAnchor="end"
                    className="fill-primary font-mono text-[10px]"
                  >
                    {mode === 'top-k'
                      ? `K = ${k}`
                      : `P = ${p.toFixed(2)} · Σ ${(cutoffCumulative ?? 0).toFixed(3)}`}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {remaining > 0 && (
          <text
            x={0}
            y={height - 6}
            className="fill-muted-foreground font-mono text-[10px]"
          >
            + {remaining} more below threshold
          </text>
        )}
      </svg>
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

  return (
    <div className="chassis w-full p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between border-b border-rule pb-3">
        <span className="nameplate">Temperature visualiser</span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-primary"
            style={{ boxShadow: '0 0 6px var(--color-primary)' }}
          />
          <span className="nameplate text-muted-foreground">live</span>
        </span>
      </div>

      <div className="flex flex-col gap-5 min-[820px]:flex-row">
        <div className="flex flex-col gap-5 max-[819px]:w-full min-[820px]:w-[264px] min-[820px]:shrink-0">
          <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-4">
            <TemperatureKnob temperature={temperature} onChange={setTemperature} />
            <span className="readout text-base">{temperature.toFixed(2)}</span>
            <span className="nameplate text-muted-foreground">temperature</span>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
            <span className="nameplate mb-1">Truncation</span>
            <RockerBank mode={mode} onChange={setMode} />

            <div className={cn('mt-3 flex flex-col gap-1.5', mode === 'off' && 'opacity-40')}>
              <div className="flex items-center justify-between">
                <span className="nameplate text-muted-foreground">
                  {mode === 'top-p' ? 'p' : 'k'}
                </span>
                <span className="readout">
                  {mode === 'top-p' ? p.toFixed(2) : k}
                </span>
              </div>
              {mode === 'top-p' ? (
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={p}
                  disabled={mode !== 'top-p'}
                  onChange={(e) => setP(Number(e.target.value))}
                  aria-label="Top-p threshold"
                  className="w-full accent-primary disabled:cursor-not-allowed"
                />
              ) : (
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={k}
                  disabled={mode !== 'top-k'}
                  onChange={(e) => setK(Number(e.target.value))}
                  aria-label="Top-k count"
                  className="w-full accent-primary disabled:cursor-not-allowed"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-card p-4">
            <Readout label="entropy" value={`${distribution.entropyBits.toFixed(2)} bit`} />
            <Readout label="kept" value={`${distribution.keptCount}`} />
            <Readout label="top p" value={distribution.topProbability.toFixed(3)} />
            <Readout label="discarded" value={`${distribution.discardedMassPct.toFixed(1)}%`} />
          </div>

          <button
            type="button"
            onClick={handleDraw}
            className="rounded-md border border-chassis-edge bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:translate-y-px"
          >
            Draw a token
          </button>
        </div>

        <div className="crt min-w-0 flex-1 p-4">
          <DistributionChart
            scored={distribution.scored}
            keptCount={distribution.keptCount}
            mode={mode}
            k={k}
            p={p}
            cutoffCumulative={distribution.cutoffCumulative}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-rule pt-3">
        <span className="nameplate mb-2 block text-muted-foreground">Paper tape</span>
        {tape.length === 0 ? (
          <p className="readout text-muted-foreground">No draws yet — pull the lever.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tape.map((entry) => (
              <li key={entry.id} className="readout flex flex-wrap gap-3 text-xs">
                <span className="text-muted-foreground">T={entry.temperature.toFixed(2)}</span>
                <span className="text-muted-foreground">{entry.mode}</span>
                <span className="font-semibold text-foreground">{entry.token}</span>
                <span className="text-screen-fg">p={entry.probability.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="nameplate text-muted-foreground">{label}</span>
      <span className="readout text-sm">{value}</span>
    </div>
  );
}
