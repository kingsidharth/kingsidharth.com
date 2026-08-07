/* ──────────────────────────────────────────────────────────────────
   Panel 2 — what the model actually emits.

   No controls. This panel exists to be *read*, and a dial on it would
   only invite fiddling before the reader has understood what the rows
   are. The distribution is shown at T = 1: the un-reshaped thing, the
   numbers that were always there behind the single word panel 1 kept
   printing.

   Colour discipline: token text is screen-white, bars and figures are
   dim, and the only saturated thing anywhere on the panel is the
   green "correct" flag on the maths column. On a screen where
   everything glows, a signal only reads as a signal if it is the one
   thing wearing a colour.
   ────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { PROMPTS, PROMPT_ORDER, TEMP_NEUTRAL, computeDistribution } from '@/lib/sampling';
import type { PromptId, SamplerConfig, ScoredToken } from '@/lib/sampling';
import { PanelHead, PanelScrews, PromptTabs } from './panel';

/** Rows per column. Eight is where the tail stops paying for its height —
 *  and leaving a visible remainder is the honest way to show that a real
 *  vocabulary has tens of thousands of rows below this fold. */
const ROWS = 8;

/** Nothing truncated — the raw softmax, which is this panel's subject. */
const UNFILTERED: SamplerConfig = {
  greedy: false,
  filters: {
    'top-k': { on: false, value: 0 },
    'top-p': { on: false, value: 1 },
    'min-p': { on: false, value: 0 },
  },
};

function TokenRow({ token, max, flagCorrect }: { token: ScoredToken; max: number; flagCorrect: boolean }) {
  const width = max > 0 ? (token.probability / max) * 100 : 0;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-screen-plain">
          {token.token}
        </span>
        {flagCorrect && token.correct && (
          <span className="shrink-0 rounded-sm border border-success-screen/50 px-1.5 py-px font-condensed text-[10px] font-semibold uppercase tracking-wide text-success-screen">
            correct
          </span>
        )}
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-screen-plain-dim">
          {token.logprob.toFixed(2)}
        </span>
        <span className="w-[42px] shrink-0 text-right font-mono text-[11px] tabular-nums text-screen-plain-dim">
          {(token.probability * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-[3px] w-full rounded-full bg-screen-plain/12">
        <div className="h-full rounded-full bg-screen-plain/45" style={{ width: `${width}%` }} />
      </div>
    </li>
  );
}

function PromptColumn({ promptId, visible }: { promptId: PromptId; visible: boolean }) {
  const prompt = PROMPTS[promptId];
  /* Every filter off: this panel shows the distribution as the model
     handed it over, with nothing cut away. It is the "before" that the
     sampler panel later cuts into. */
  const scored = useMemo(
    () => computeDistribution(promptId, TEMP_NEUTRAL, UNFILTERED).scored,
    [promptId],
  );

  const rows = scored.slice(0, ROWS);
  const hidden = scored.length - rows.length;
  const max = scored[0]?.probability ?? 1;

  return (
    <section
      aria-label={`${prompt.label} — ${prompt.text}`}
      className={cn('crt flex-col gap-4 p-4 sm:p-5', visible ? 'flex' : 'hidden', 'min-[900px]:flex')}
    >
      <div className="flex flex-col gap-2">
        <span className="nameplate text-[11px] text-screen-dim">{prompt.label}</span>
        <p className="font-mono text-[14px] leading-snug text-screen-plain">
          {prompt.text}
          <span aria-hidden="true" className="text-screen-dim"> ▁▁▁</span>
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {rows.map((token) => (
          <TokenRow
            key={token.token}
            token={token}
            max={max}
            flagCorrect={prompt.kind === 'factual'}
          />
        ))}
      </ul>

      {hidden > 0 && (
        <p className="mt-auto border-t border-primary/20 pt-2.5 font-mono text-[11px] tabular-nums text-screen-dim">
          + {hidden} more here, and ~50,000 more in a real vocabulary
        </p>
      )}
    </section>
  );
}

export default function LogprobsInstrument() {
  const [active, setActive] = useState<PromptId>('language');
  const tabs = useMemo(
    () => PROMPT_ORDER.map((id) => ({ id, label: PROMPTS[id].label })),
    [],
  );

  return (
    <div className="chassis relative w-full">
      <PanelScrews />

      <PanelHead
        label="Logprobs"
        meta={
          <>
            T = 1.00 · raw model output, <span className="text-foreground">before</span> anything
            picks
          </>
        }
      />

      <div className="flex flex-col gap-5 px-5 py-6 sm:px-8">
        {/* Tabs on phones, three columns from the first width where three
            token tables fit without the numbers colliding. */}
        <PromptTabs items={tabs} active={active} onChange={setActive} className="min-[900px]:hidden" />

        <div className="grid gap-4 min-[900px]:grid-cols-3">
          {PROMPT_ORDER.map((id) => (
            <PromptColumn key={id} promptId={id} visible={id === active} />
          ))}
        </div>

        {/* The legend. "Logprob" is the one word on this panel that a
            reader can nod along to for a paragraph without actually
            knowing, so it gets said plainly, once, in place. */}
        <dl className="grid gap-x-8 gap-y-3 border-t border-chassis-edge pt-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="nameplate text-[11px]">the percentage</dt>
            <dd className="max-w-[46ch] font-condensed text-[13px] leading-snug text-muted-foreground">
              How often this token would be the next word, if you ran this prompt a thousand times.
              Down the column, they add to 100%.
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="nameplate text-[11px]">the negative number — the logprob</dt>
            <dd className="max-w-[46ch] font-condensed text-[13px] leading-snug text-muted-foreground">
              The natural log of that percentage, which is the form APIs hand back. Always negative;
              0 would be certainty. −0.7 is about half the time, −2.3 about a tenth, −4.6 about a
              hundredth. Further from zero, less likely.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
