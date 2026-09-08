/* ──────────────────────────────────────────────────────────────────
   Panel 1 — the dial that appears to do nothing.

   All three prompts are on screen at once, which is the whole design
   decision here. The old version made you switch prompts one at a
   time to discover that nothing moved on any of them; switching is
   work, and work spent confirming a negative is work most readers
   don't do. Side by side, the negative is free: turn one dial, watch
   three outputs refuse to move.

   The conclusion underneath stays shut until the dial has actually
   been swept. A reader told the twist before running the experiment
   has read a sentence, not learned anything.
   ────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { PROMPTS, PROMPT_ORDER, TEMP_NEUTRAL } from '@/lib/sampling';
import type { PromptId } from '@/lib/sampling';
import {
  GaugeCell,
  PanelHead,
  PanelScrews,
  TemperatureDial,
  useEasedTemperature,
  useReducedMotion,
} from './panel';

/** How much of the range has to be covered before the panel accepts that
 *  the reader ran the experiment. Half the dial: enough that "I nudged it"
 *  doesn't count, small enough that it doesn't feel like a chore. */
const SWEEP_REQUIRED = 0.9;

/** Greedy is argmax, and argmax does not depend on temperature — so the
 *  output of this whole panel is a constant, computed once. That is not a
 *  shortcut around the simulation; it *is* the lesson, in code. */
function greedyToken(promptId: PromptId): string {
  const candidates = PROMPTS[promptId].candidates;
  return candidates.reduce((best, c) => (c.logit > best.logit ? c : best), candidates[0]).token;
}

interface PromptCardProps {
  promptId: PromptId;
  recomputes: number;
  reducedMotion: boolean;
}

function PromptCard({ promptId, recomputes, reducedMotion }: PromptCardProps) {
  const prompt = PROMPTS[promptId];
  const token = useMemo(() => greedyToken(promptId), [promptId]);

  return (
    /* The minimum height only exists to keep the three cards the same
       size when they sit in a row. Stacked on a phone it is just a hole
       under a two-line sentence. */
    <div className="crt flex flex-col gap-3 p-4 min-[760px]:min-h-[168px] sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="nameplate text-[11px] text-screen-dim">{prompt.label}</span>
        <span className="font-mono text-[10px] text-screen-dim">
          {prompt.candidates.length} candidates
        </span>
      </div>

      <p className="font-mono text-[15px] leading-snug text-screen-dim">
        {prompt.text}{' '}
        <span className="font-semibold text-screen-fg">{token}</span>
        <span
          aria-hidden="true"
          className={cn(
            'ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-screen-fg align-middle',
            !reducedMotion && 'motion-safe:animate-pulse',
          )}
        />
      </p>

      {/* The counter is the joke landing. The machine is visibly doing
          work — recomputing the whole distribution on every frame of the
          drag — and visibly producing the same word each time. */}
      <p className="mt-auto border-t border-primary/20 pt-2.5 font-mono text-[11px] tabular-nums text-screen-dim">
        <span aria-hidden="true">↺ </span>
        recomputed {recomputes}× · output unchanged {recomputes}×
      </p>
    </div>
  );
}

interface TemperatureInstrumentProps {
  /**
   * Drop the prose conclusion and the hint that leads to it. The homepage
   * embed is a hook, not the argument — the three panels that finish the
   * thought live on the bench, and half an argument under a teaser reads
   * worse than none.
   */
  showConclusion?: boolean;
}

export default function TemperatureInstrument({
  showConclusion = true,
}: TemperatureInstrumentProps) {
  const [target, setTarget] = useState(TEMP_NEUTRAL);
  const [swept, setSwept] = useState({ lo: TEMP_NEUTRAL, hi: TEMP_NEUTRAL });
  const [recomputes, setRecomputes] = useState(0);

  const reducedMotion = useReducedMotion();
  const temperature = useEasedTemperature(target, !reducedMotion);

  const handleChange = useCallback((next: number) => {
    setTarget(next);
    setSwept((prev) =>
      next >= prev.lo && next <= prev.hi
        ? prev
        : { lo: Math.min(prev.lo, next), hi: Math.max(prev.hi, next) },
    );
  }, []);

  /* One tick per temperature the panel has actually held — including
     every intermediate frame of the easing, because the distribution
     genuinely is recomputed on each of them. A long drag racking up two
     hundred is the honest number and the better argument: two hundred
     full recomputations, three outputs, not one of them moved.

     Safe against a loop: `temperature` is unchanged by this effect, so
     the extra render it causes cannot re-trigger it. */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setRecomputes((n) => n + 1);
  }, [temperature]);

  const sweepSpan = swept.hi - swept.lo;
  const done = sweepSpan >= SWEEP_REQUIRED;

  return (
    <div className="flex flex-col gap-6">
      <div className="chassis relative w-full">
        <PanelScrews />

        <PanelHead
          label="Decoder"
          meta={
            <>
              picking strategy — <span className="text-foreground">greedy</span> · three prompts,
              one dial
            </>
          }
        />

        <div className="flex flex-col gap-7 px-5 py-7 sm:px-8">
          {/* Control row */}
          <div className="flex flex-col items-center gap-6 min-[560px]:flex-row min-[560px]:items-center min-[560px]:gap-8">
            <TemperatureDial temperature={temperature} target={target} onChange={handleChange} />

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div className="flex flex-col">
                  <span className="readout-xl tabular-nums">{temperature.toFixed(2)}</span>
                  <span className="nameplate mt-1.5">temperature</span>
                </div>
                <GaugeCell
                  value={sweepSpan > 0 ? `${swept.lo.toFixed(2)}–${swept.hi.toFixed(2)}` : '—'}
                  label="range swept"
                />
              </div>

              <p className="max-w-[46ch] font-condensed text-[13px] leading-snug text-muted-foreground">
                {done
                  ? 'Nothing moved. Not at 0, not at 2.0, not on any of the three.'
                  : 'Turn it all the way down, then all the way up. Watch all three outputs at once.'}
              </p>
            </div>
          </div>

          {/* Three prompts, one screen. Stacked on phones, in a row from
              the first width where three monospace lines fit without
              wrapping mid-sentence. */}
          <div className="grid gap-4 min-[760px]:grid-cols-3">
            {PROMPT_ORDER.map((id) => (
              <PromptCard
                key={id}
                promptId={id}
                recomputes={recomputes}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        </div>
      </div>

      {showConclusion && (
        <div aria-live="polite">
          {done ? (
            <Conclusion />
          ) : (
            <p className="font-condensed text-[13px] text-muted-foreground">
              Sweep the dial across its range to continue.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   The turn. Kept in this file rather than in the page copy because it
   only makes sense immediately after the experiment above has failed,
   and separating the two invites someone to move one without the other.
   ──────────────────────────────────────────────────────────────────── */
function Conclusion() {
  return (
    <div className="flex max-w-[68ch] flex-col gap-4">
      <p className="nameplate">The sentence everyone repeats</p>

      <p className="text-lg leading-snug text-foreground">
        “Temperature makes an LLM deterministic at low values and creative at high ones.”
      </p>

      <p className="max-w-[62ch] leading-relaxed text-muted-foreground">
        You just swept it end to end and all three outputs sat exactly where they were. So that
        sentence is not wrong, quite — it is the last line of a story with the middle removed.
      </p>

      <p className="max-w-[62ch] leading-relaxed text-muted-foreground">
        A model does not emit a word. It emits a score for every token it knows — tens of thousands
        of numbers — and softmax turns those scores into a{' '}
        <strong className="font-semibold text-foreground">probability distribution</strong>.
        Temperature reshapes that distribution. Something else entirely decides which token comes
        out of it, and on this panel that something is{' '}
        <strong className="font-semibold text-foreground">greedy</strong>: take the tallest bar,
        ignore the rest. Greedy throws away every change temperature made, which is why the dial
        looked broken.
      </p>

      <p className="max-w-[62ch] leading-relaxed text-foreground">
        So look at the thing temperature was reshaping the whole time.
      </p>
    </div>
  );
}
