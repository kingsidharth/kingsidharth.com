import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Cartridge {
  id: string;
  /** The audience this prompt is for — printed small on the label sticker. */
  audience: string;
  /**
   * A benefit, not a restatement. An earlier pass showed a title that
   * merely described the prompt, which said the same thing twice; these
   * say what you get, so they sit on the label rather than duplicating
   * the prompt itself.
   */
  title: string;
  prompt: string;
  /** Cartridge shell colour. Hardcoded by design — each cartridge is its
   * own physical object, the way the programme cards next door each get
   * their own colour. Everything else in this file uses theme tokens. */
  bg: string;
  /** Label ink. Chosen per-shell so text stays legible against `bg`. */
  ink: string;
}

const CARTRIDGES: Cartridge[] = [
  {
    id: 'anyone',
    audience: 'Anyone',
    title: 'Find the superpower you\'re not using',
    prompt: 'What superpower am I not using?',
    bg: 'oklch(0.30 0.11 275)',
    ink: 'oklch(0.90 0.15 195)',
  },
  {
    id: 'founders',
    audience: 'Founders',
    title: 'Stress-test your landing page',
    prompt:
      "Act as a sceptical investor. Read my landing page copy and list the three claims you don't believe, and exactly what evidence would change your mind.",
    bg: 'oklch(0.31 0.13 20)',
    ink: 'oklch(0.92 0.14 85)',
  },
  {
    id: 'designers',
    audience: 'Designers',
    title: 'See your screen like a first-time user',
    prompt:
      "Here's my screen. Describe what a first-time user would try to do first, and where they'd hesitate. Don't suggest fixes yet — just tell me what you see.",
    bg: 'oklch(0.30 0.13 320)',
    ink: 'oklch(0.92 0.13 90)',
  },
  {
    id: 'pms',
    audience: 'PMs',
    title: 'Turn feature requests into evals',
    prompt:
      'Turn this feature request into three eval cases with pass/fail criteria a junior could apply without asking me anything.',
    bg: 'oklch(0.28 0.10 155)',
    ink: 'oklch(0.90 0.16 130)',
  },
  {
    id: 'engineers',
    audience: 'Engineers',
    title: 'Understand code you didn\'t write',
    prompt:
      'Explain what this code does to whoever maintains it after I leave. Then list the three things most likely to break it.',
    bg: 'oklch(0.29 0.10 240)',
    ink: 'oklch(0.90 0.14 200)',
  },
];

const EJECT_MS = 200;
const INSERT_MS = 250;
const READING_MS = 400;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Decorative screw, matches the chassis idiom used across instrument cards. */
function Screw({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('screw absolute', className)} />;
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

type DeckPhase = 'empty' | 'ejecting' | 'inserting' | 'reading' | 'loaded';

interface DeckState {
  /** The cartridge currently seated in the decoder, if any. */
  loadedId: string | null;
  /** The cartridge sliding toward the slot, set only while `phase` is
   * 'inserting'. */
  pendingId: string | null;
  phase: DeckPhase;
}

/** One physical cartridge in the stash: a raised shell with a printed
 * label and a strip of contact pins along its trailing edge. Seating
 * (loaded) dims it, pulls it toward the decoder, and hides the pins —
 * they've disappeared into the slot. */
function CartridgeButton({
  cartridge,
  seated,
  ejecting,
  onSelect,
}: {
  cartridge: Cartridge;
  seated: boolean;
  ejecting: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={seated}
      onClick={() => onSelect(cartridge.id)}
      className="screen-raised group relative flex w-full flex-col gap-2 overflow-visible px-4 py-3.5 text-left"
      style={{
        backgroundColor: cartridge.bg,
        color: cartridge.ink,
        transform: seated ? 'translateX(14px) scale(0.985)' : 'translateX(0) scale(1)',
        opacity: seated ? 0.55 : 1,
        transitionProperty: 'transform, opacity, box-shadow',
        transitionDuration: `${ejecting ? EJECT_MS : INSERT_MS}ms`,
        transitionTimingFunction: 'ease',
      }}
    >
      <span className="font-condensed text-[0.6875rem] font-semibold" style={{ color: cartridge.ink, opacity: 0.75 }}>
        {cartridge.audience}
      </span>
      <span className="sprite-text font-sans text-base leading-snug" style={{ color: cartridge.ink }}>
        {cartridge.title}
      </span>

      {/* Contact pins — a strip of thin metal bars along the edge that
          plugs into the decoder. They vanish once seated. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-3 right-1.5 w-2 rounded-sm transition-opacity"
        style={{
          background:
            'repeating-linear-gradient(180deg, oklch(0.85 0.14 85) 0 3px, oklch(0.5 0.09 70) 3px 4px, transparent 4px 6px)',
          opacity: seated ? 0 : 0.9,
          transitionDuration: `${ejecting ? EJECT_MS : INSERT_MS}ms`,
        }}
      />
    </button>
  );
}

type CopyState = 'idle' | 'copied' | 'manual';

/** The decoder's screen: the loaded prompt, a "reading" beat while it
 * loads, or the empty-slot state. Owns its own transient copy-feedback
 * state, reset whenever the loaded cartridge changes so a stale
 * "Copied" label never survives a swap. */
function DecoderScreen({ cartridge, phase }: { cartridge: Cartridge | null; phase: DeckPhase }) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const textRef = useRef<HTMLParagraphElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCopyState('idle');
  }, [cartridge?.id]);

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
    if (!cartridge) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    let succeeded = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cartridge.prompt);
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
  }, [cartridge, selectPromptText]);

  const showLoaded = phase === 'loaded' && cartridge;
  const showReading = phase === 'reading';

  return (
    <div className="flex flex-col gap-3">
      <div className="crt flex min-h-[200px] flex-col justify-center p-4 sm:p-5">
        <div aria-live="polite" aria-atomic="true">
          {showLoaded ? (
            <p
              ref={textRef}
              className="chromatic select-text whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-screen-fg"
            >
              {cartridge.prompt}
            </p>
          ) : showReading ? (
            <p className="font-mono text-[13px] text-screen-dim">reading…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[13px] text-screen-dim">no cartridge</p>
              <p className="font-mono text-[11px] text-screen-dim opacity-70">
                select one from the stash
              </p>
            </div>
          )}
        </div>
      </div>

      {showLoaded ? (
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
      ) : null}
    </div>
  );
}

export default function PromptsToSteal() {
  const [deck, setDeck] = useState<DeckState>({ loadedId: null, pendingId: null, phase: 'empty' });
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => clearTimeouts, [clearTimeouts]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
  }, []);

  const insert = useCallback(
    (targetId: string, reduced: boolean) => {
      if (reduced) {
        setDeck({ loadedId: targetId, pendingId: null, phase: 'loaded' });
        return;
      }
      setDeck({ loadedId: null, pendingId: targetId, phase: 'inserting' });
      schedule(() => {
        setDeck({ loadedId: targetId, pendingId: null, phase: 'reading' });
        schedule(() => {
          setDeck((current) =>
            current.loadedId === targetId ? { ...current, phase: 'loaded' } : current,
          );
        }, READING_MS);
      }, INSERT_MS);
    },
    [schedule],
  );

  const handleSelect = useCallback(
    (id: string) => {
      // Ignore clicks mid-transition — the state machine below assumes
      // it always starts from a settled phase.
      if (deck.phase === 'ejecting' || deck.phase === 'inserting') return;
      if (deck.loadedId === id && (deck.phase === 'reading' || deck.phase === 'loaded')) return;

      const reduced = prefersReducedMotion();
      clearTimeouts();

      if (deck.loadedId && deck.loadedId !== id) {
        if (reduced) {
          insert(id, true);
          return;
        }
        setDeck({ loadedId: deck.loadedId, pendingId: id, phase: 'ejecting' });
        schedule(() => insert(id, false), EJECT_MS);
      } else {
        insert(id, reduced);
      }
    },
    [deck.loadedId, deck.phase, clearTimeouts, schedule, insert],
  );

  const seatedId = deck.phase === 'inserting' ? deck.pendingId : deck.phase === 'reading' || deck.phase === 'loaded' ? deck.loadedId : null;
  const ejectingId = deck.phase === 'ejecting' ? deck.loadedId : null;

  const loadedCartridge = deck.phase === 'loaded' ? CARTRIDGES.find((c) => c.id === deck.loadedId) ?? null : null;

  return (
    <div className="chassis relative w-full">
      <Screw className="left-2.5 top-2.5" />
      <Screw className="right-2.5 top-2.5" />

      <div className="panel-divider-h flex items-center gap-3 px-6 py-3.5 sm:px-8">
        <span className="plaque flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-semibold">
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

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-6">
          <div className="flex flex-col gap-3">
            <span className="nameplate">Stash</span>
            <div className="flex flex-col gap-3 overflow-visible">
              {CARTRIDGES.map((cartridge) => (
                <CartridgeButton
                  key={cartridge.id}
                  cartridge={cartridge}
                  seated={seatedId === cartridge.id}
                  ejecting={ejectingId === cartridge.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="nameplate">Decoder</span>
            <DecoderScreen cartridge={loadedCartridge} phase={deck.phase} />
          </div>
        </div>
      </div>
    </div>
  );
}
