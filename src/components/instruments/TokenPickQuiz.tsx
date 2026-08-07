/* ──────────────────────────────────────────────────────────────────
   The question between panel 2 and panel 3.

   There is no right answer here and the panel never marks one, which
   is deliberate: three of the four options are real decoding
   strategies people have shipped, and the fourth — "unsure" — is the
   honest one. Marking a winner would turn a question designed to
   surface an intuition into a quiz the reader tries to pass.

   Answers stay switchable after the first pick. Each option has
   something worth reading behind it, and the reader should be able to
   collect all four.
   ────────────────────────────────────────────────────────────────── */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PanelHead, PanelScrews } from './panel';

type OptionId = 'highest' | 'correct' | 'random' | 'unsure';

interface Option {
  id: OptionId;
  label: string;
  /** The name of what they just described, if it has one. */
  name: string;
  body: readonly string[];
}

const OPTIONS: readonly Option[] = [
  {
    id: 'highest',
    label: 'Pick the highest probability',
    name: 'That has a name: greedy decoding',
    body: [
      'It is also what you were already watching. Panel one was running greedy the whole time, which is why the dial did nothing — dividing every score by the same temperature never changes which score is largest.',
      'Greedy is genuinely good at some things. On "1 + 1 =" it answers 2 forever, at any temperature, and cannot be talked out of it.',
      'It is also why every model that runs greedy writes "Twinkle twinkle little star" every single time, and can never write anything else. The top bar wins by construction, so the other 49,999 tokens might as well not exist.',
    ],
  },
  {
    id: 'correct',
    label: 'The correct one',
    name: 'Reasonable — and the model has no way to do it',
    body: [
      'A language model learns by reading existing text. Given the words so far, it predicts the next word — the next token, to be precise. That is the entire job.',
      'So it has no separate channel for truth. Probability is the only signal in the building: "correct" and "what usually comes next in text like this" are the same number to the model, and it cannot tell you which one it is reporting.',
      'And look at the poetry column. There is no correct token there at all. There is a famous one, which is a different thing entirely — and on "the secret to success is", there is not even a famous one.',
    ],
  },
  {
    id: 'random',
    label: 'Random',
    name: 'Interesting — and it depends entirely on which random you mean',
    body: [
      'Uniformly random across the vocabulary would give アイス the same chance as "star". Every output would be word salad, so nobody does that.',
      'Random weighted by the probabilities, though, is exactly right — and is what almost every model you have used is doing. "star" 68% of the time, "scar" 5%, and once in a long while something further down.',
      'That still leaves a problem. The tail is enormous: fifty thousand tokens each holding a vanishing sliver, which in aggregate is a large enough sliver to get drawn. Sooner or later the weighted die lands on nonsense.',
    ],
  },
  {
    id: 'unsure',
    label: 'Unsure',
    name: 'Fair — and most people land on "take the highest one"',
    body: [
      'That answer has a name: greedy decoding. It is what panel one was doing, and it is why the dial appeared broken — dividing every score by the same temperature never changes which score is largest.',
      'Greedy is correct on "1 + 1 =" forever and lifeless on a poem forever, and it has no setting between those two. Whatever the model knew about the alternatives is discarded before you ever see it.',
    ],
  },
];

const CLOSER =
  'Every one of these is a decoding strategy, and every one of them is wrong somewhere. So there is a better move — several, in fact, and you get to choose between them.';

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export default function TokenPickQuiz() {
  const [picked, setPicked] = useState<OptionId | null>(null);
  const [seen, setSeen] = useState<Set<OptionId>>(new Set());

  const chosen = OPTIONS.find((o) => o.id === picked) ?? null;
  const remaining = OPTIONS.length - seen.size;

  const select = (id: OptionId) => {
    setPicked(id);
    setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  return (
    <div className="chassis relative w-full">
      <PanelScrews />
      <PanelHead label="Your turn" meta="no wrong answers on this one" lit={picked !== null} />

      <div className="flex flex-col gap-6 px-5 py-7 sm:px-8">
        <div className="flex flex-col gap-2">
          <h3 className="max-w-[34ch] text-balance text-2xl font-semibold leading-tight text-foreground">
            How would you pick a token from that?
          </h3>
          <p className="max-w-[50ch] text-muted-foreground">
            First thing that comes to mind. Don't work it out.
          </p>
        </div>

        <div role="radiogroup" aria-label="How would you pick a token" className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((option, index) => {
            const on = picked === option.id;
            const read = seen.has(option.id) && !on;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => select(option.id)}
                className={cn(
                  'flex items-center gap-3.5 rounded-md border px-4 py-3.5 text-left transition-colors',
                  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  on
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border hover:border-chassis-edge hover:bg-muted/50',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-semibold transition-colors',
                    on
                      ? 'border-primary text-primary'
                      : read
                        ? 'border-chassis-edge text-muted-foreground'
                        : 'groove border-transparent text-muted-foreground',
                  )}
                >
                  {read ? '✓' : optionLetter(index)}
                </span>
                <span className="flex-1 text-[15px] text-foreground">{option.label}</span>
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {chosen ? (
            <div className="crt flex flex-col gap-3 p-4 sm:p-5">
              <span className="nameplate text-[11px] text-screen-dim">{chosen.name}</span>
              {chosen.body.map((para) => (
                <p key={para} className="max-w-[68ch] font-mono text-[13px] leading-relaxed text-screen-plain">
                  {para}
                </p>
              ))}
              <p className="mt-1 border-t border-primary/20 pt-3 font-mono text-[13px] leading-relaxed text-screen-plain-dim">
                {remaining > 0
                  ? `${remaining} other answer${remaining === 1 ? '' : 's'} up there worth reading — each one is a real strategy, and each is wrong somewhere.`
                  : CLOSER}
              </p>
            </div>
          ) : (
            <p className="font-condensed text-[13px] text-muted-foreground">
              Pick one to see what it is actually called.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
