import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A single five-point star, drawn as two stacked copies: a muted base
 * star and a primary-coloured copy clipped to `fraction` of its width.
 * Clipping (rather than a gradient stop) keeps the unfilled remainder
 * visibly present in the muted colour, as the brief asks for. */
const STAR_PATH =
  'M12 2.5l2.9 6.06 6.6.83-4.9 4.55 1.28 6.56L12 17.4l-5.88 3.1 1.28-6.56-4.9-4.55 6.6-.83L12 2.5z';

function Star({ fraction }: { fraction: number }) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <span className="relative inline-block h-[15px] w-[15px] shrink-0">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full text-muted-foreground/40" aria-hidden="true">
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 h-full w-full text-primary"
        style={{ clipPath: `inset(0 ${100 - clamped * 100}% 0 0)` }}
        aria-hidden="true"
      >
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fraction={rating - i} />
      ))}
    </span>
  );
}

interface IntroRow {
  id: string;
  label: string;
  content: ReactNode;
}

const ROWS: IntroRow[] = [
  {
    id: 'build-products',
    label: 'Build products',
    content: (
      <p>
        Payment Links at Instamojo — over half the company&apos;s GMV. Booking flows at Headout used by millions of
        travellers.
      </p>
    ),
  },
  {
    id: 'teach-ai',
    label: 'Teach AI to engineers and non-coders',
    content: (
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <div className="flex flex-col gap-1">
          <span className="gauge-value">1M+</span>
          <span className="gauge-label">learners taught</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="gauge-value flex items-center gap-2">
            4.5+/5
            <StarRating rating={4.5} />
          </span>
          <span className="gauge-label">average rating</span>
        </div>
      </div>
    ),
  },
  {
    id: 'build-tools',
    label: 'Build visualisation and teaching tools',
    content: (
      <p>
        Interactive instruments that show what a model is actually doing. There&apos;s one further down this page —
        take it apart.
      </p>
    ),
  },
  {
    id: 'help-startups',
    label: 'Help startups',
    content: <p>Fine-tuning models, custom agents, AI solutions, cost control.</p>,
  },
  {
    id: 'read-papers',
    label: 'Read research papers',
    content: (
      <p>I annotate them as I go and write up what actually held. The notes are more useful than the summaries.</p>
    ),
  },
];

/** The first row starts open so the interaction pattern (rows reveal
 * detail) is discoverable without a wall of unexplained clickable text. */
const INITIAL_OPEN: ReadonlySet<string> = new Set([ROWS[0]!.id]);

export default function HeroIntro() {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(INITIAL_OPEN);
  const baseId = useId();

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex w-full min-w-0 flex-col">
      <span className="nameplate text-primary">Bengaluru</span>

      <h1 className="mt-3 text-4xl font-semibold text-foreground sm:text-5xl">I&apos;m Sidharth. I:</h1>

      <div className="mt-6 flex flex-col">
        {ROWS.map((row) => {
          const isOpen = openIds.has(row.id);
          const panelId = `${baseId}-${row.id}-panel`;
          const labelId = `${baseId}-${row.id}-label`;
          return (
            <div key={row.id} className="border-b border-border first:border-t">
              <button
                type="button"
                id={labelId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(row.id)}
                className="group flex w-full items-start gap-3 py-4 text-left focus-visible:outline-none"
              >
                <span aria-hidden="true" className="mt-[0.75em] h-px w-4 shrink-0 bg-primary" />
                <span className="min-w-0 flex-1 text-xl font-medium text-foreground sm:text-2xl">{row.label}</span>
                <span
                  aria-hidden="true"
                  className="mt-1 w-4 shrink-0 text-center font-mono text-lg leading-none text-contrast"
                >
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {/* Grid-rows 0fr/1fr trick: animates height without ever
                  measuring it in JS. The global reduced-motion media query
                  in global.css already collapses all transition durations
                  to ~0, so this snaps under reduced motion for free. */}
              <div
                id={panelId}
                role="region"
                aria-labelledby={labelId}
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="overflow-hidden">
                  <div className="pb-5 pl-7 text-base text-muted-foreground">{row.content}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-base text-muted-foreground">
        16+ years working with startups. Currently at Outskill; before that Headout, Instamojo and more. I also run a{' '}
        <a
          href="https://youtube.com/@kingsidharth"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          YouTube channel
        </a>
        .
      </p>
    </div>
  );
}
