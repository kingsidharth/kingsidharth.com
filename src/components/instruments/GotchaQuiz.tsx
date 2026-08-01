import { useCallback, useId, useRef, useState } from 'react';
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

function Screw({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('screw absolute', className)} />;
}

export default function GotchaQuiz() {
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

  return (
    <div ref={rootRef} className="chassis relative w-full" data-revealed={revealed ? 'true' : undefined}>
      <Screw className="left-2.5 top-2.5" />
      <Screw className="right-2.5 top-2.5" />

      {/* Header strip */}
      <div className="panel-divider-h flex items-center gap-3 px-6 py-3.5 sm:px-8">
        <span className="plaque flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em]">
          <span aria-hidden="true" className={cn('led', revealed && 'led-on')} />
          Gotcha
        </span>
      </div>

      <div className="flex flex-col gap-6 px-6 py-7 sm:px-8">
        <p id={questionId} className="font-sans text-xl text-foreground">
          {QUESTION}
        </p>

        <div role="radiogroup" aria-labelledby={questionId} className="flex flex-col gap-2">
          {OPTIONS.map((option) => {
            const isSelected = selected === option.id;
            const isWrongPick = wrongTried.has(option.id);
            const isCorrectAndRevealed = revealed && option.correct;
            const showAsWrong = isWrongPick && !(revealed && option.correct);

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={revealed && !option.correct}
                onClick={() => handleSelect(option)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-sm border border-transparent px-3 py-2.5 text-left transition-colors focus-visible:outline-none',
                  'hover:bg-muted/60',
                  revealed && !option.correct && 'cursor-default opacity-60 hover:bg-transparent',
                  isCorrectAndRevealed && 'border-primary/40 bg-primary/10',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 rounded-[3px]',
                    isSelected || isCorrectAndRevealed ? 'bg-primary' : 'groove',
                  )}
                />
                <span className="flex-1 font-sans text-sm text-foreground">{option.label}</span>
                {isCorrectAndRevealed && <span className="text-primary">✓</span>}
                {showAsWrong && <span className="text-destructive">✗</span>}
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
          <div className="crt flex flex-col gap-2 p-4 sm:p-5">
            <span className="nameplate text-screen-dim text-[11px] tracking-[0.18em]">
              {selected === correctOption.id ? 'Correct' : 'Answer'}
            </span>
            <p className="font-mono text-[13px] leading-relaxed text-screen-fg">
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
    </div>
  );
}
