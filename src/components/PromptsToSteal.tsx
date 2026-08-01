import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  /** The audience this prompt is for — shown as a small nameplate label. */
  audience: string;
  /** What the prompt does for that audience — shown up front, no click required. */
  title: string;
  prompt: string;
}

const CATEGORIES: Category[] = [
  {
    id: 'anyone',
    audience: 'Anyone',
    title: 'Find your blind spot',
    prompt: 'What superpower am I not using?',
  },
  {
    id: 'founders',
    audience: 'Founders',
    title: 'Pitch it to a sceptic',
    prompt:
      "Act as a sceptical investor. Read my landing page copy and list the three claims you don't believe, and exactly what evidence would change your mind.",
  },
  {
    id: 'designers',
    audience: 'Designers',
    title: 'Watch a stranger use it',
    prompt:
      "Here's my screen. Describe what a first-time user would try to do first, and where they'd hesitate. Don't suggest fixes yet — just tell me what you see.",
  },
  {
    id: 'pms',
    audience: 'PMs',
    title: 'Turn a request into evals',
    prompt:
      'Turn this feature request into three eval cases with pass/fail criteria a junior could apply without asking me anything.',
  },
  {
    id: 'engineers',
    audience: 'Engineers',
    title: 'Write the handover note',
    prompt:
      'Explain what this code does to whoever maintains it after I leave. Then list the three things most likely to break it.',
  },
];

/** Decorative screw, matches the chassis idiom used across instrument cards. */
function Screw({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('screw absolute', className)} />;
}

type CopyState = 'idle' | 'copied' | 'manual';

/** A single prompt row: audience label, title, and the CRT readout with its
 * copy control. Owns its own transient copy-feedback state so copying one
 * prompt never leaks a stale "Copied" label onto another row. */
function PromptRow({ category }: { category: Category }) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const textRef = useRef<HTMLParagraphElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const selectPromptText = useCallback(() => {
    const node = textRef.current;
    if (!node || typeof window === 'undefined') return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const handleCopy = useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    let succeeded = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(category.prompt);
        succeeded = true;
      }
    } catch {
      succeeded = false;
    }

    if (succeeded) {
      setCopyState('copied');
    } else {
      // Clipboard API unavailable (insecure context) or rejected
      // (permissions) — fall back to selecting the text so ⌘C still works.
      selectPromptText();
      setCopyState('manual');
    }

    timeoutRef.current = setTimeout(() => setCopyState('idle'), 2000);
  }, [category.prompt, selectPromptText]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="nameplate shrink-0 text-muted-foreground">{category.audience}</span>
      </div>
      <h4 className="font-sans text-lg font-semibold leading-snug text-foreground">{category.title}</h4>

      <div className="crt p-4 sm:p-5">
        <p
          ref={textRef}
          className="select-text whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-screen-fg"
        >
          {category.prompt}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'group inline-flex w-fit items-center gap-2 rounded-md border px-3.5 py-2 font-sans text-sm font-medium transition-colors',
          'border-border bg-transparent hover:border-chassis-edge hover:bg-muted/50',
          'focus-visible:outline-none',
        )}
      >
        {copyState === 'copied' ? (
          <>
            <span aria-hidden="true" className="text-success">
              ✓
            </span>
            <span className="text-foreground">Copied</span>
          </>
        ) : copyState === 'manual' ? (
          <span className="text-foreground">Press ⌘C</span>
        ) : (
          <>
            <CopyIcon />
            <span className="text-foreground">Copy prompt</span>
          </>
        )}
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M3 10.5H2.5A1 1 0 0 1 1.5 9.5V2.5A1 1 0 0 1 2.5 1.5H9.5A1 1 0 0 1 10.5 2.5V3" />
    </svg>
  );
}

export default function PromptsToSteal() {
  return (
    <div className="chassis relative w-full">
      <Screw className="left-2.5 top-2.5" />
      <Screw className="right-2.5 top-2.5" />

      <div className="panel-divider-h flex items-center gap-3 px-6 py-3.5 sm:px-8">
        <span className="plaque flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em]">
          <span aria-hidden="true" className="led led-on" />
          Prompts
        </span>
      </div>

      <div className="flex flex-col gap-6 px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-2">
          <h3 className="text-balance font-sans text-2xl font-semibold leading-tight text-foreground">
            Prompts to steal
          </h3>
          <p className="font-sans text-sm text-muted-foreground">Copy them. They work.</p>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {CATEGORIES.map((category) => (
            <div key={category.id} className="py-6 first:pt-0 last:pb-0">
              <PromptRow category={category} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
