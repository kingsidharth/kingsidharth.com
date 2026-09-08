/* ──────────────────────────────────────────────────────────────────
   Panel 3 — the sampler.

   This is the panel the other two were building toward: the dial from
   panel 1 and the distribution from panel 2, now with the piece that
   was missing between them. Temperature reshapes; the filters decide
   what is left to pick from.

   The three filters are toggles, not a radio group, because that is
   what they are. Every model card in existence recommends several at
   once — `top_p 0.95, top_k 20, min_p 0.0` is one pipeline with three
   knobs, not a menu. An earlier version of this panel made them
   mutually exclusive and taught the wrong thing on the first click.
   Greedy is the one real alternative: it never reaches a distribution,
   so it overrides the chain rather than joining it.
   ────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SAMPLER,
  FILTER_INFO,
  FILTER_ORDER,
  GREEDY_INFO,
  PROMPTS,
  PROMPT_ORDER,
  TEMP_NEUTRAL,
  computeDistribution,
  sampleToken,
} from '@/lib/sampling';
import type {
  ControlInfo,
  FilterId,
  FilterStep,
  PromptId,
  SamplerConfig,
  ScoredToken,
} from '@/lib/sampling';
import {
  Fader,
  GaugeCell,
  PanelHead,
  PanelScrews,
  PromptTabs,
  SETTLE_MS,
  TemperatureDial,
  useEasedTemperature,
  useReducedMotion,
  useSettled,
} from './panel';

const CHART_ROWS = 10;
const TAPE_LENGTH = 14;

/* ────────────────────────────────────────────────────────────────────
   The control bank — four square lamps. Greedy stands apart because it
   is the only exclusive one.
   ──────────────────────────────────────────────────────────────────── */
function LampButton({
  label,
  on,
  dimmed,
  onClick,
  pressed,
}: {
  label: string;
  on: boolean;
  dimmed?: boolean;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'plaque flex h-[72px] flex-col items-center justify-center gap-2.5 rounded-sm transition-[transform,filter,opacity] duration-100',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary',
        on ? 'translate-y-px brightness-[1.06] shadow-none' : 'hover:brightness-105 active:translate-y-px',
        dimmed && 'opacity-45',
      )}
    >
      <span aria-hidden="true" className={cn('led', on && 'led-on')} />
      <span
        className={cn(
          'font-condensed text-[13px] leading-none',
          /* No colour of its own — the plaque owns its ink, and it
             inverts with the chassis. On/off reads as weight and
             opacity instead. */
          on ? 'font-semibold' : 'opacity-55',
        )}
      >
        {label}
      </span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────
   The pipeline readout — the count falling through each filter.

   This is the whole argument for making them toggles. `15 → 8 → 4`
   says, in one line, that the filters run in series on each other's
   output: top-k hands 8 candidates to top-p, which hands 4 to min-p.
   ──────────────────────────────────────────────────────────────────── */
function ChainReadout({ chain }: { chain: FilterStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 font-mono text-[11px] tabular-nums">
      {chain.map((step, i) => (
        <span key={step.id} className="flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden="true" className="text-muted-foreground/60">
              →
            </span>
          )}
          <span
            className={cn(
              'rounded-sm border px-1.5 py-0.5',
              i === chain.length - 1
                ? 'border-primary/60 text-primary'
                : 'border-chassis-edge text-muted-foreground',
            )}
          >
            {step.label} · {step.kept}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   The distribution, with the cut drawn where the chain leaves it.
   ──────────────────────────────────────────────────────────────────── */
function DistributionChart({
  scored,
  cutLabel,
  flagCorrect,
}: {
  scored: ScoredToken[];
  cutLabel: string;
  flagCorrect: boolean;
}) {
  const rows = scored.slice(0, CHART_ROWS);
  const hidden = scored.length - rows.length;
  const max = scored[0]?.probability ?? 1;
  const lastKept = rows.reduce((acc, t, i) => (t.kept ? i : acc), -1);

  return (
    <div className="crt flex flex-1 flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="nameplate text-[11px] text-screen-dim">Distribution</span>
        <span className="font-mono text-[10px] text-screen-dim">
          after temperature, before the draw
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((token, i) => (
          <li key={token.token} className="flex flex-col gap-1.5">
            <div className={cn('flex items-baseline gap-2', !token.kept && 'opacity-40')}>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-screen-plain">
                {token.token}
              </span>
              {flagCorrect && token.correct && (
                <span className="shrink-0 rounded-sm border border-success-screen/50 px-1.5 py-px font-condensed text-[10px] font-semibold uppercase tracking-wide text-success-screen">
                  correct
                </span>
              )}
              <span className="w-[46px] shrink-0 text-right font-mono text-[11px] tabular-nums text-screen-plain-dim">
                {(token.probability * 100).toFixed(1)}%
              </span>
            </div>
            <div
              className={cn(
                'h-[3px] w-full rounded-full bg-screen-plain/12',
                !token.kept && 'opacity-40',
              )}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
                  token.kept ? 'bg-screen-plain/65' : 'bg-screen-plain/25',
                )}
                style={{ width: `${max > 0 ? (token.probability / max) * 100 : 0}%` }}
              />
            </div>

            {/* The cut. Drawn between rows rather than beside them,
                because that is physically what truncation is: a line
                through the sorted list with the survivors above it. */}
            {i === lastKept && i < rows.length - 1 && (
              <div className="mt-1 flex items-center gap-2.5 pt-0.5">
                <span className="h-px flex-1 bg-contrast/75" />
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-contrast">
                  {cutLabel}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="mt-auto border-t border-primary/20 pt-2.5 font-mono text-[11px] tabular-nums text-screen-dim">
          + {hidden} more below, all discarded
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Explainer — plain prose. The panel already supplies the enclosure;
   a rule down the side of a paragraph inside it is a second frame
   around text that was not asking to be quoted.
   ──────────────────────────────────────────────────────────────────── */
function Explainer({ info }: { info: ControlInfo }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="nameplate text-[13px] text-foreground">{info.label}</span>
        <code className="font-mono text-[12px] text-primary">{info.maths}</code>
      </div>
      <p className="max-w-[64ch] leading-relaxed text-foreground">{info.plain}</p>
      <p className="max-w-[64ch] leading-relaxed text-muted-foreground">{info.cost}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Main panel
   ──────────────────────────────────────────────────────────────────── */
interface TapeEntry {
  id: number;
  token: string;
  correct: boolean;
}

export default function SamplerInstrument() {
  const [target, setTarget] = useState(TEMP_NEUTRAL);
  const [promptId, setPromptId] = useState<PromptId>('poetry');
  const [config, setConfig] = useState<SamplerConfig>(DEFAULT_SAMPLER);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const tapeId = useRef(0);

  const reducedMotion = useReducedMotion();
  const temperature = useEasedTemperature(target, !reducedMotion);

  const prompt = PROMPTS[promptId];
  const isFactual = prompt.kind === 'factual';

  const distribution = useMemo(
    () => computeDistribution(promptId, temperature, config),
    [promptId, temperature, config],
  );

  const distributionRef = useRef(distribution);
  distributionRef.current = distribution;

  /* Greedy suppresses the filters in effect, not in state: flipping it
     back off should restore the chain the reader had built rather than
     hand them a blank panel. */
  const toggleGreedy = useCallback(() => {
    setConfig((c) => ({ ...c, greedy: !c.greedy }));
  }, []);

  const toggleFilter = useCallback((id: FilterId) => {
    setConfig((c) => ({
      // Reaching for a filter is a statement that you want to sample,
      // so it releases greedy rather than silently doing nothing.
      greedy: false,
      filters: { ...c.filters, [id]: { ...c.filters[id], on: !c.filters[id].on } },
    }));
  }, []);

  const setFilterValue = useCallback((id: FilterId, value: number) => {
    setConfig((c) => ({ ...c, filters: { ...c.filters, [id]: { ...c.filters[id], value } } }));
  }, []);

  /* The drawn token re-rolls once the controls come to rest, not on
     every eased frame — mid-drag the sentence would otherwise flicker
     through a dozen words a second, which reads as noise rather than as
     the dial rewriting the output. */
  const settleKey = useSettled(
    `${promptId}|${config.greedy}|${FILTER_ORDER.map(
      (id) => `${config.filters[id].on}:${config.filters[id].value}`,
    ).join('|')}|${temperature.toFixed(2)}`,
    SETTLE_MS,
  );

  const [drawn, setDrawn] = useState<{ token: string; correct: boolean } | null>(null);

  const draw = useCallback((record: boolean) => {
    const current = distributionRef.current;
    if (!current.scored.some((t) => t.kept)) {
      setDrawn(null);
      return;
    }
    const token = sampleToken(current.scored);
    setDrawn({ token: token.token, correct: token.correct });
    if (record) {
      tapeId.current += 1;
      setTape((prev) =>
        [{ id: tapeId.current, token: token.token, correct: token.correct }, ...prev].slice(
          0,
          TAPE_LENGTH,
        ),
      );
    }
  }, []);

  useEffect(() => {
    draw(false);
  }, [settleKey, draw]);

  // Switching prompts mid-run leaves a tape of words from a different
  // question, which reads as the sampler having produced nonsense.
  const handlePrompt = useCallback((id: PromptId) => {
    setPromptId(id);
    setTape([]);
  }, []);

  const tabs = useMemo(() => PROMPT_ORDER.map((id) => ({ id, label: PROMPTS[id].label })), []);
  const distinct = useMemo(() => new Set(tape.map((t) => t.token)).size, [tape]);

  const activeFilters = FILTER_ORDER.filter((id) => config.filters[id].on);
  const cutLabel = config.greedy
    ? 'argmax — everything below is discarded'
    : activeFilters.length === 0
      ? 'nothing cut — sampling the whole distribution'
      : `cut by ${activeFilters.map((id) => FILTER_INFO[id].label.toLowerCase()).join(' + ')}`;

  const explaining: ControlInfo[] = config.greedy
    ? [GREEDY_INFO]
    : activeFilters.map((id) => FILTER_INFO[id]);

  return (
    <div className="chassis relative w-full">
      <PanelScrews />

      <PanelHead
        label="Sampler"
        meta={
          <>
            T = {temperature.toFixed(2)} · {distribution.keptCount} of {prompt.candidates.length}{' '}
            kept
          </>
        }
      />

      <div className="flex min-w-0 flex-col min-[980px]:flex-row">
        {/* ── controls ─────────────────────────────────────────────── */}
        <div className="flex w-full min-w-0 flex-col gap-7 px-5 py-6 sm:px-8 min-[980px]:w-[380px] min-[980px]:shrink-0">
          <div className="flex flex-col gap-4">
            <span className="nameplate">Temperature</span>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 min-[980px]:justify-start">
              <TemperatureDial
                temperature={temperature}
                target={target}
                onChange={setTarget}
                size={136}
              />
              <div className="flex min-w-0 flex-col">
                <span className="readout-xl tabular-nums">{temperature.toFixed(2)}</span>
                <span className="nameplate mt-1">
                  {temperature < 0.95 ? 'sharpened' : temperature > 1.05 ? 'flattened' : 'neutral'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="nameplate">Decoding</span>
              <span className="font-condensed text-[12px] text-muted-foreground">
                greedy, or any mix of the three
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <LampButton
                label={GREEDY_INFO.label}
                on={config.greedy}
                pressed={config.greedy}
                onClick={toggleGreedy}
              />
              {FILTER_ORDER.map((id) => (
                <LampButton
                  key={id}
                  label={FILTER_INFO[id].label}
                  on={!config.greedy && config.filters[id].on}
                  pressed={config.filters[id].on}
                  dimmed={config.greedy}
                  onClick={() => toggleFilter(id)}
                />
              ))}
            </div>

            <ChainReadout chain={distribution.chain} />
          </div>

          {/* One fader per engaged filter, stacked in the order they
              run. Off filters have no fader at all: a disabled control
              is a thing to wonder about, an absent one is not. */}
          <div className="flex flex-col gap-5">
            {config.greedy ? (
              <p className="max-w-[40ch] font-condensed text-[13px] leading-snug text-muted-foreground">
                Greedy has nothing to cut. It never reaches a distribution — it reads the top of
                the list and stops, so every knob on this panel is inert while its lamp is lit.
              </p>
            ) : activeFilters.length === 0 ? (
              <p className="max-w-[40ch] font-condensed text-[13px] leading-snug text-muted-foreground">
                No filter engaged. This is pure temperature sampling: a weighted die over the
                whole vocabulary, tail and all. Watch the tape.
              </p>
            ) : (
              activeFilters.map((id) => {
                const info = FILTER_INFO[id];
                const state = config.filters[id];
                const max = id === 'top-k' ? prompt.candidates.length : info.fader.max;
                return (
                  <div key={id} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="nameplate">{info.fader.name}</span>
                      <span className="font-mono text-lg tabular-nums text-primary">
                        {info.format(Math.min(state.value, max), prompt.candidates.length)}
                      </span>
                    </div>
                    <Fader
                      value={Math.min(state.value, max)}
                      min={info.fader.min}
                      max={max}
                      step={info.fader.step}
                      ariaLabel={`${info.label} value`}
                      onChange={(v) => setFilterValue(id, v)}
                    />
                    <p className="font-condensed text-[13px] leading-snug text-muted-foreground">
                      {info.fader.caption}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="panel-divider-h -mx-5 sm:-mx-8" />

          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <GaugeCell value={distribution.effectiveChoices.toFixed(1)} label="effective choices" />
            {isFactual ? (
              <GaugeCell
                value={`${((distribution.correctProbability ?? 1) * 100).toFixed(0)}%`}
                label="chance of a correct answer"
                valueClassName={
                  (distribution.correctProbability ?? 1) >= 0.95
                    ? 'text-success'
                    : (distribution.correctProbability ?? 1) < 0.8
                      ? 'text-destructive'
                      : undefined
                }
              />
            ) : (
              <GaugeCell value={`${distribution.entropyBits.toFixed(2)}`} label="entropy bits" />
            )}
            <GaugeCell value={`${distribution.keptCount}`} label="tokens kept" />
            <GaugeCell
              value={`${distribution.discardedMassPct.toFixed(1)}%`}
              label="mass discarded"
            />
          </div>
        </div>

        <div className="panel-divider-v hidden min-[980px]:block" />

        {/* ── screens ──────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
          <PromptTabs items={tabs} active={promptId} onChange={handlePrompt} />

          <div className="crt flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <p className="min-w-0 flex-1 font-mono text-[15px] leading-snug text-screen-plain-dim">
                {prompt.text}{' '}
                {drawn && (
                  <span
                    className={cn(
                      'font-semibold',
                      isFactual && !drawn.correct ? 'text-destructive' : 'text-screen-plain',
                    )}
                  >
                    {drawn.token}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    'ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-screen-fg align-middle',
                    !reducedMotion && 'motion-safe:animate-pulse',
                  )}
                />
              </p>
              <button
                type="button"
                onClick={() => draw(true)}
                className="shrink-0 whitespace-nowrap rounded-sm border border-screen-fg/50 px-3 py-1.5 font-mono text-[12px] text-screen-fg transition-transform hover:border-screen-fg hover:bg-screen-fg/10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-screen-fg active:translate-y-px"
              >
                Draw again
              </button>
            </div>

            {isFactual && drawn && !drawn.correct && (
              <p className="font-mono text-[11px] text-destructive">
                ✗ wrong answer — this is the sampler, not the model, getting it wrong
              </p>
            )}

            {/* The tape. Under greedy it fills with fourteen identical
                words, which is a more convincing argument than any
                sentence about determinism. */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-primary/20 pt-3">
              <span className="mr-1 font-mono text-[11px] text-screen-dim">tape</span>
              {tape.length === 0 ? (
                <span className="font-mono text-[11px] text-screen-dim">no draws yet</span>
              ) : (
                <>
                  {tape.map((entry) => (
                    <span
                      key={entry.id}
                      className={cn(
                        'rounded-sm border px-1.5 py-px font-mono text-[11px]',
                        isFactual && !entry.correct
                          ? 'border-destructive/50 text-destructive'
                          : 'border-screen-plain/30 text-screen-plain',
                      )}
                    >
                      {entry.token}
                    </span>
                  ))}
                  <span className="ml-1 font-mono text-[11px] tabular-nums text-screen-dim">
                    {distinct} distinct in {tape.length}
                  </span>
                </>
              )}
            </div>
          </div>

          <DistributionChart
            scored={distribution.scored}
            cutLabel={cutLabel}
            flagCorrect={isFactual}
          />
        </div>
      </div>

      {/* ── what is engaged, said twice ─────────────────────────────── */}
      <div className="panel-divider-h flex flex-col gap-7 border-b-0 border-t px-5 py-6 sm:px-8">
        {explaining.length === 0 ? (
          <p className="max-w-[64ch] leading-relaxed text-muted-foreground">
            Nothing engaged. Temperature reshapes the distribution and the draw takes it as it
            comes — every token in the vocabulary is reachable, including the ones at the bottom
            that make no sense. That is the problem the three filters exist to solve.
          </p>
        ) : (
          explaining.map((info) => <Explainer key={info.label} info={info} />)
        )}

        {activeFilters.length > 1 && !config.greedy && (
          <p className="max-w-[64ch] leading-relaxed text-muted-foreground">
            With more than one engaged they run in series, in the order above: each cuts what the
            previous one left. That is why the counts in the readout only ever fall, and why the
            last filter in the chain often appears to do nothing — the one before it had already
            made the cut. Frameworks disagree about that order, which is one more reason a config
            copied between them does not mean the same thing.
          </p>
        )}
      </div>
    </div>
  );
}
