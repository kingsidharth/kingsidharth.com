import { useCallback, useId, useRef, useState } from 'react';
import type React from 'react';
import { cn } from '@/lib/utils';

const QUESTION = "Temperature 0 will do what to an LLM's response?";

interface Option {
  id: string;
  label: string;
  correct: boolean;
}

const OPTIONS: Option[] = [
  { id: 'deterministic', label: 'Make it deterministic', correct: false },
  { id: 'random', label: 'Make it random', correct: false },
  { id: 'creative', label: 'Make it more creative', correct: false },
  { id: 'maths', label: 'Make it better at maths', correct: false },
  { id: 'none', label: 'None of the above', correct: true },
];

/** Sanitise a `useId()` value for use inside `aria-labelledby` references —
 * matches the convention in TemperatureInstrument, kept here even though
 * these ids never enter a `url(#…)` reference, for consistency. */
function sanitiseId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '');
}

/** A-Z letter for the option index, used as the row's clickable indicator. */
function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

interface GotchaQuizProps {
  /** When true, renders only the inner content — no `.chassis`, screws,
   * or outer rounding — so a parent panel can supply the enclosure. */
  embedded?: boolean;
}

export default function GotchaQuiz({ embedded = false }: GotchaQuizProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [wrongTried, setWrongTried] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const revealedFiredRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const questionId = `gotcha-q-${sanitiseId(useId())}`;

  const fireReveal = useCallback(() => {
    if (revealedFiredRef.current) return;
    revealedFiredRef.current = true;
    setRevealed(true);
    document.dispatchEvent(new CustomEvent('gotcha:revealed'));
    if (rootRef.current) {
      rootRef.current.setAttribute('data-revealed', 'true');
    }
  }, []);

  const handleSelect = useCallback(
    (option: Option) => {
      if (revealed) return;
      setSelected(option.id);
      if (option.correct) {
        fireReveal();
      } else {
        setWrongTried((prev) => {
          const next = new Set(prev);
          next.add(option.id);
          return next;
        });
      }
    },
    [revealed, fireReveal],
  );

  const hasWrongAttempt = wrongTried.size > 0;
  const correctOption = OPTIONS.find((o) => o.correct)!;
  const answeredCorrectly = revealed && selected === correctOption.id;

  const content = (
    <>
      {/* No badge. The panel this sits in already announces itself, and a
          plaque on top of that is furniture for its own sake. The lamp
          stays: it is the one thing here carrying state. */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-border px-6 py-3 sm:px-8">
        <span className="nameplate text-[11px]">Challenge</span>
        <span
          className={cn(
            'font-mono text-[11px] transition-colors',
            revealed ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {revealed ? 'answered' : 'unanswered'}
        </span>
      </div>

      <div className="relative z-10 flex flex-col gap-6 px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-2">
          <span className="nameplate text-[11px] text-foreground/80">
            Do you actually understand AI?
          </span>
          <h3 className="text-balance font-sans text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            Prove it.
          </h3>
        </div>

        <p id={questionId} className="font-sans text-base text-foreground sm:text-lg">
          {QUESTION}
        </p>

        <div role="radiogroup" aria-labelledby={questionId} className="flex flex-col gap-3">
          {OPTIONS.map((option, index) => {
            const isSelected = selected === option.id;
            const isWrongPick = wrongTried.has(option.id);
            const isCorrectAndRevealed = revealed && option.correct;
            const showAsWrong = isWrongPick && !(revealed && option.correct);
            const isDisabled = revealed && !option.correct;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isDisabled}
                onClick={() => handleSelect(option)}
                className={cn(
                  'group flex w-full items-center gap-4 rounded-md border px-4 py-3.5 text-left transition-colors sm:py-4',
                  'border-border bg-transparent hover:border-foreground/40 hover:bg-muted',
                  'focus-visible:outline-none',
                  isDisabled && 'cursor-default opacity-50 hover:border-border hover:bg-transparent',
                  showAsWrong && 'border-destructive/50 bg-destructive/5',
                  isCorrectAndRevealed && 'border-success bg-success/10',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-semibold transition-colors',
                    isCorrectAndRevealed && 'border-success text-success',
                    showAsWrong && 'border-destructive text-destructive',
                    !isCorrectAndRevealed &&
                      !showAsWrong &&
                      (isSelected
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground'),
                  )}
                >
                  {optionLetter(index)}
                </span>
                <span className="flex-1 font-sans text-sm text-foreground sm:text-base">
                  {option.label}
                </span>
                {isCorrectAndRevealed && (
                  <span aria-hidden="true" className="text-lg font-semibold text-success">
                    ✓
                  </span>
                )}
                {showAsWrong && (
                  <span aria-hidden="true" className="text-lg font-semibold text-destructive">
                    ✗
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!revealed && hasWrongAttempt && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-sm text-muted-foreground">Not quite — try again.</p>
            <button
              type="button"
              onClick={fireReveal}
              className="font-sans text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none"
            >
              Show me the answer
            </button>
          </div>
        )}

        {revealed && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-black/25 p-4 sm:p-5">
            <span
              className={cn(
                'nameplate text-[11px]',
                answeredCorrectly ? 'text-success' : 'text-primary',
              )}
            >
              {answeredCorrectly ? 'Correct' : 'Answer'}
            </span>
            <p className="readout text-[13px] leading-relaxed">
              Temperature 0 means greedy decoding — always take the highest-probability token.
              <br />
              That is not the same as deterministic in practice: batching, floating-point
              non-associativity on GPUs, and MoE routing mean identical inputs can still produce
              different outputs.
              <br />
              It is obviously not random, and it is the least creative setting a model can run at
              — not the most.
              <br />
              It does not make a model better at maths in general either. Greedy only helps if the
              top token was already correct; it cannot fix a model that is confidently wrong.
            </p>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div ref={rootRef} className="relative w-full" data-revealed={revealed ? 'true' : undefined}>
        {content}
      </div>
    );
  }

  /* A banner, not a chassis. The quiz is page furniture — the thing it
     reveals is the instrument, and that one keeps its hardware. */
  return (
    <div
      ref={rootRef}
      className="banner grain relative w-full"
      style={{ '--banner-base': 'oklch(0.3 0.09 320)' } as React.CSSProperties}
      data-revealed={revealed ? 'true' : undefined}
    >
      {content}
    </div>
  );
}
