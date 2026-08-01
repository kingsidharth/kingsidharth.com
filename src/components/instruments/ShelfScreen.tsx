import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import DitherThumb from '@/components/DitherThumb';

export type ScreenKind = 'distribution' | 'typewriter' | 'tokens' | 'player' | 'static';

interface ShelfScreenProps {
  screen: ScreenKind;
  label?: string;
}

/** True once, read at mount — reduced-motion users get a still frame, no ticking timers. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function ShelfScreen({ screen, label }: ShelfScreenProps) {
  switch (screen) {
    case 'distribution':
      return <DistributionScreen />;
    case 'typewriter':
      return <TypewriterScreen />;
    case 'tokens':
      return <TokensScreen />;
    case 'player':
      return <PlayerScreen label={label} />;
    case 'static':
    default:
      return <StaticScreen label={label} />;
  }
}

/* ── distribution: ~10 bars breathing on a slowly-varying exponential decay ── */

function DistributionScreen() {
  const reduced = usePrefersReducedMotion();
  const barCount = 10;
  const [heights, setHeights] = useState<number[]>(() => decayHeights(barCount, 0));

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let phase = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      phase += dt * 0.0006;
      setHeights(decayHeights(barCount, phase));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="flex h-full w-full items-end justify-center gap-[3px] bg-screen px-2 pb-2">
      {heights.map((h, i) => (
        <div
          key={i}
          className={cn('w-full rounded-t-[1px]', i < 3 ? 'bg-primary' : 'bg-screen-dim')}
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Exponential decay curve, re-shaped over time by a slowly drifting rate. */
function decayHeights(count: number, phase: number): number[] {
  const rate = 0.55 + 0.25 * Math.sin(phase);
  return Array.from({ length: count }, (_, i) => {
    const base = Math.exp(-rate * i);
    const wobble = 0.08 * Math.sin(phase * 2 + i * 1.3);
    return Math.max(0.05, Math.min(1, base + wobble));
  });
}

/* ── typewriter: types an AGENTS.md snippet, pauses, clears, repeats ── */

const TYPEWRITER_LINES = [
  '# AGENTS.md',
  '',
  '## build',
  '  bun dev',
  '',
  '## never',
  '  edit /dist',
];

function TypewriterScreen() {
  const reduced = usePrefersReducedMotion();
  const [visibleLines, setVisibleLines] = useState<string[]>(TYPEWRITER_LINES);
  const [current, setCurrent] = useState('');

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function run() {
      while (!cancelled) {
        const done: string[] = [];
        for (const line of TYPEWRITER_LINES) {
          for (let i = 0; i <= line.length; i++) {
            if (cancelled) return;
            await wait((t) => (timeout = t), 28);
            setCurrent(line.slice(0, i));
          }
          done.push(line);
          setVisibleLines([...done]);
          setCurrent('');
          await wait((t) => (timeout = t), 90);
        }
        await wait((t) => (timeout = t), 1400);
        setVisibleLines([]);
        await wait((t) => (timeout = t), 400);
      }
    }

    run();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [reduced]);

  const lines = reduced ? TYPEWRITER_LINES : visibleLines;

  return (
    <div className="h-full w-full overflow-hidden bg-screen p-2 font-mono text-2xs leading-snug text-screen-fg">
      {lines.map((line, i) => (
        <div key={i}>{line || ' '}</div>
      ))}
      {!reduced && current && (
        <div>
          {current}
          <span className="animate-pulse">▍</span>
        </div>
      )}
    </div>
  );
}

/** Resolves once `ms` elapses; hands the timeout handle back so callers can clear it. */
function wait(setHandle: (t: ReturnType<typeof setTimeout>) => void, ms: number): Promise<void> {
  return new Promise((resolve) => {
    setHandle(setTimeout(resolve, ms));
  });
}

/* ── tokens: cycles labelled token chunks, wrapping to a second row ── */

const TOKEN_SETS: readonly string[][] = [
  ['learn', 'ing', ' AI', ' is'],
  ['token', 'iser', ' cost', 's'],
  ['हिं', 'दी', ' text', ' ×1.7'],
];

function TokensScreen() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % TOKEN_SETS.length);
    }, 2200);
    return () => clearInterval(id);
  }, [reduced]);

  const tokens = TOKEN_SETS[index];
  const isDevanagari = index === 2;

  return (
    <div className="flex h-full w-full flex-wrap content-center items-center justify-center gap-1 bg-screen p-2">
      {tokens.map((tok, i) => (
        <span
          key={`${index}-${i}`}
          lang={isDevanagari ? 'hi' : undefined}
          className="rounded-[2px] border border-border bg-muted px-1 py-0.5 font-mono text-2xs text-screen-fg"
        >
          {tok}
        </span>
      ))}
    </div>
  );
}

/* ── player: compact media-player face ── */

function PlayerScreen({ label }: { label?: string }) {
  const reduced = usePrefersReducedMotion();
  const title = label ?? 'Freshcast — Episode 04';
  const total = 227; // seconds
  const [elapsed, setElapsed] = useState(63);
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setElapsed((e) => (e + 1) % total);
    }, 1000);
    return () => clearInterval(id);
  }, [reduced]);

  const progress = elapsed / total;

  return (
    <div className="flex h-full w-full items-center gap-2 bg-screen p-1.5">
      <DitherThumb motif="orb" seed={11} width={28} aspect="square" className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="overflow-hidden whitespace-nowrap">
          <div
            ref={marqueeRef}
            className={cn(
              'inline-block font-mono text-2xs text-screen-fg',
              !reduced && 'animate-[marquee_8s_linear_infinite]'
            )}
          >
            {title}
          </div>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-screen-dim/30">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-2xs text-screen-dim">
          <span>{formatTime(elapsed)}</span>
          <div className="flex items-center gap-1 text-screen-fg" aria-hidden="true">
            <span>⏮</span>
            <span>⏸</span>
            <span>⏭</span>
          </div>
          <span>{formatTime(total)}</span>
        </div>
      </div>
      <style>{`
        @keyframes marquee {
          0%, 15% { transform: translateX(0); }
          85%, 100% { transform: translateX(calc(-100% + 4rem)); }
        }
      `}</style>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── static: idle placeholder ── */

function StaticScreen({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-screen p-2">
      <span className="font-mono text-2xs text-screen-dim">{label ?? 'idle'}</span>
    </div>
  );
}
