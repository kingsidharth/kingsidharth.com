/* ──────────────────────────────────────────────────────────────────
   TransformerEngine — the island shell. Free-floating: no frame, no
   fixed aspect — the parent sizes it (the story layout pins it to
   the viewport) and the page background shows through.

   In `story` mode the level is driven by scroll: the shell observes
   sibling <section data-engine-level="…"> markers inside the closest
   [data-engine-story] ancestor and dives the camera as each section
   crosses the reading zone. Tapping a dive target still works; the
   next scroll re-syncs.

   The three.js scene lives in EngineCanvas.tsx behind a React.lazy
   boundary so the WebGL chunk only loads on pages that show the viz.

   ┌───────────────────────────────────────────────────────────────┐
   │ BLACK CANVAS? READ THIS BEFORE TOUCHING ANY SCENE CODE.       │
   │ This viz has repeatedly looked "broken" for reasons outside   │
   │ these files. Check in order:                                  │
   │ 1. Backgrounded tab — browsers freeze rAF on inactive tabs    │
   │    and macOS Chrome can kill the WebGL context outright,      │
   │    leaving a black canvas. Foreground the tab and reload      │
   │    before suspecting code. Context loss is handled below      │
   │    (the canvas remounts on `webglcontextlost`).               │
   │ 2. A dev server with a wedged dep optimizer. Signature: the    │
   │    console shows "Failed to fetch dynamically imported         │
   │    module …/EngineCanvas.tsx" while the NETWORK tab shows      │
   │    504s for /node_modules/.vite/deps/three.js,                 │
   │    @react-three_fiber, @react-three_drei. The trigger is       │
   │    UNRELATED to this file: running `astro build` while the     │
   │    dev server is up clobbers the shared node_modules/.vite     │
   │    cache, and the running server's `?v=` chunk hashes stop     │
   │    existing on disk. Remedy: restart the dev server (delete    │
   │    node_modules/.vite first if it persists). Never run the     │
   │    build against this project root while dev is running —      │
   │    build into a worktree or stop dev first.                    │
   │ 3. A dead lazy chunk. Vite HMR invalidating EngineCanvas.tsx  │
   │    mid-edit 500s its URL and the dynamic import dies — the    │
   │    island used to sit silently empty. Now EngineBoundary      │
   │    catches it and retries with a fresh lazy() (a rejected     │
   │    lazy never recovers on its own).                           │
   │ 4. Verify against the production build (`bun run build` +     │
   │    `bunx astro preview`) in a fresh browser. If it renders    │
   │    there, the code is fine — the problem is the environment.  │
   └───────────────────────────────────────────────────────────────┘
   ────────────────────────────────────────────────────────────────── */
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BREADCRUMB, COLORS, CRUMB_TARGET, LEVELS, LEVEL_INDEX, setEnginePalette, type LevelId } from '@/lib/transformer-engine';
import { cn } from '@/lib/utils';

/** Module-level loader so each retry can build a FRESH lazy() —
    React.lazy caches a rejected import forever, so re-rendering the
    same lazy instance can never recover once the chunk fetch fails.
    The fetch fails in dev whenever HMR invalidates EngineCanvas.tsx
    mid-edit (its `?t=` URL 500s while the file is half-saved); in
    prod it takes a genuine network error. Either way the boundary
    below remounts with a new lazy and the import is re-attempted. */
const loadEngine = () => import('./EngineCanvas');

/** Catches a dead canvas (failed chunk load, WebGL init failure) and
    swaps in a retry affordance instead of a silently empty region. */
class EngineBoundary extends Component<
  { onError: () => void; fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function BootSkeleton() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase">
      <span style={{ color: COLORS.blueHot }}>Warming up the engine</span>
      <span className="block h-px w-24 animate-pulse" style={{ background: 'var(--steel-500)' }} />
    </div>
  );
}

/** Shown when the canvas chunk won't load. Auto-retries a few times
    (the dev-server hiccup case clears itself); past that it's a real
    failure and the reader gets a manual retry. */
function StalledEngine({ exhausted, onRetry }: { exhausted: boolean; onRetry: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase">
      <span style={{ color: COLORS.blueHot }}>
        {exhausted ? 'The engine stalled' : 'The engine stalled — restarting'}
      </span>
      {exhausted && (
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer border border-rule px-3 py-2 transition-colors hover:border-foreground/40"
          style={{ color: COLORS.blueHot }}
        >
          Try again
        </button>
      )}
    </div>
  );
}

const HUD_TEXT = 'font-mono text-[10px] uppercase tracking-[0.18em]';
const HUD_DIM = { color: 'var(--steel-500)' } as const;
/* No module-level HUD_HOT: COLORS is mutated on a theme flip, so a
   snapshot would keep the old theme's blue. Read it inline at render. */

/** Zoom is a pair of buttons, not the wheel — the wheel belongs to
    the page (story scroll), so pinching the camera to the scroll
    gesture trapped readers inside the canvas. */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.6;
const ZOOM_STEP = 1.3;

export default function TransformerEngine({
  initialLevel = 'overview',
  story = false,
  className,
}: {
  initialLevel?: LevelId;
  story?: boolean;
  className?: string;
}) {
  const [level, setLevel] = useState<LevelId>(initialLevel);
  const [inView, setInView] = useState(true);
  const [hintVisible, setHintVisible] = useState(true);
  const [zoomBias, setZoomBias] = useState(1);
  /* Light is the document default; read the real class on the client
     so a dark-first render doesn't hydrate into the light palette. */
  const [light, setLight] = useState(
    () => typeof document === 'undefined' || !document.documentElement.classList.contains('dark'),
  );
  /* Bumped when the browser kills the WebGL context (backgrounded
     tabs, GPU pressure) — the whole canvas remounts fresh instead of
     sitting black until a manual reload. See the header comment. */
  const [canvasKey, setCanvasKey] = useState(0);
  /* Bumped to retry a failed lazy chunk: each attempt gets its own
     lazy() (a rejected one never recovers) and its own boundary. */
  const [attempt, setAttempt] = useState(0);
  const Engine = useMemo(() => lazy(loadEngine), [attempt]);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);

  const MAX_RETRIES = 4;
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const handleCanvasError = useCallback(() => {
    if (attempt >= MAX_RETRIES) return;
    retryTimer.current = setTimeout(retry, 1500);
  }, [attempt, retry]);
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  /* Follow the site theme. The palette is mutated BEFORE the state
     update so the canvas remount (keyed on `light` below) builds its
     materials from the new hexes in the same render. */
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const isLight = !root.classList.contains('dark');
      setEnginePalette(isLight);
      setLight(isLight);
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  /* Pause the render loop when the canvas is off the page. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Story mode: the story wrapper bleeds to the viewport edges. The
     classic left-1/2 / -translate-x-1/2 trick only works when the
     parent is viewport-centred — inside the guide's off-centre prose
     column it skews right and overflows the page. Measure the parent
     and offset by hand instead. */
  useEffect(() => {
    if (!story) return;
    const storyRoot = wrapRef.current?.closest<HTMLElement>('[data-engine-story]');
    if (!storyRoot) return;
    const fit = () => {
      const parent = storyRoot.parentElement;
      if (!parent) return;
      storyRoot.style.width = `${document.documentElement.clientWidth}px`;
      storyRoot.style.left = '0px';
      storyRoot.style.translate = 'none';
      storyRoot.style.marginLeft = `${-(parent.getBoundingClientRect().left + window.scrollX)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [story]);

  /* Story mode: scroll sets the level. A section claims the camera
     when its middle band crosses the reading zone. */
  useEffect(() => {
    if (!story) return;
    const storyRoot = wrapRef.current?.closest('[data-engine-story]');
    if (!storyRoot) return;
    const sections = storyRoot.querySelectorAll<HTMLElement>('[data-engine-level]');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const next = (entry.target as HTMLElement).dataset.engineLevel as LevelId | undefined;
          if (next) setLevel(next);
        }
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [story]);

  const interact = useCallback(() => setHintVisible(false), []);

  const zoomStep = useCallback(
    (factor: number) => {
      interact();
      setZoomBias((b) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, b * factor)));
    },
    [interact],
  );

  const dive = useCallback(
    (next: LevelId) => {
      interact();
      setLevel(next);
    },
    [interact],
  );

  const back = useCallback(() => {
    setLevel((current) => {
      if (current === 'attention' || current === 'mlp') return 'block';
      if (current === 'block') return 'overview';
      if (current === 'deep') return 'mlp';
      if (current === 'packed') return 'overview';
      return current;
    });
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        interact();
        back();
      } else if (e.key === 'Enter') {
        dive(LEVELS[Math.min(LEVEL_INDEX[level] + 1, LEVELS.length - 1)]);
      } else if (e.key === '+' || e.key === '=') {
        zoomStep(ZOOM_STEP);
      } else if (e.key === '-' || e.key === '_') {
        zoomStep(1 / ZOOM_STEP);
      }
    },
    [back, dive, interact, level, zoomStep],
  );

  const crumbs = BREADCRUMB[level];

  return (
    <div
      ref={wrapRef}
      className={cn('engine-dots relative h-full w-full select-none overflow-hidden', className)}
      role="application"
      aria-label="Interactive 3D exploded view of a transformer language model. Scroll to travel through it, drag to orbit, tap a glowing part to dive inside it. Escape zooms back out."
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={interact}
    >
      <EngineBoundary
        key={attempt}
        onError={handleCanvasError}
        fallback={<StalledEngine exhausted={attempt >= MAX_RETRIES} onRetry={retry} />}
      >
        <Suspense fallback={<BootSkeleton />}>
          <Engine
            key={`${canvasKey}-${light ? 'light' : 'dark'}`}
            level={level}
            onDive={dive}
            onInteract={interact}
            onContextLost={() => setCanvasKey((k) => k + 1)}
            frameloop={inView ? 'always' : 'never'}
            reducedMotion={reducedMotion.current}
            zoomBias={zoomBias}
          />
        </Suspense>
      </EngineBoundary>

      {/* breadcrumb — floats over the drawing, page background behind it */}
      <nav aria-label="Dive path" className="absolute top-3 left-1 z-10 flex items-center gap-1 sm:left-2">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={crumb} className="flex items-center gap-1">
              {i > 0 && (
                <span className={HUD_TEXT} style={HUD_DIM} aria-hidden>
                  /
                </span>
              )}
              <button
                type="button"
                disabled={isLast}
                onClick={() => dive(CRUMB_TARGET[i] ?? 'overview')}
                className={cn(HUD_TEXT, '-m-2 p-2', !isLast && 'cursor-pointer hover:opacity-100')}
                style={isLast ? { color: COLORS.blueHot } : HUD_DIM}
                aria-current={isLast ? 'location' : undefined}
              >
                {crumb}
              </button>
            </span>
          );
        })}
      </nav>

      {/* zoom — explicit controls, never the wheel */}
      <div className="absolute right-2 bottom-3 z-10 flex gap-1">
        {(
          [
            ['−', 'Zoom out', 1 / ZOOM_STEP],
            ['+', 'Zoom in', ZOOM_STEP],
          ] as const
        ).map(([glyph, label, factor]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={() => zoomStep(factor)}
            className="grid size-8 cursor-pointer place-items-center border border-rule bg-background/70 font-mono text-sm backdrop-blur-sm transition-colors hover:border-foreground/40"
            style={HUD_DIM}
          >
            {glyph}
          </button>
        ))}
      </div>

      {/* hint */}
      <span
        className={cn(
          HUD_TEXT,
          'absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-center transition-opacity duration-700',
          hintVisible ? 'opacity-100' : 'opacity-0',
        )}
        style={HUD_DIM}
      >
        {story ? 'scroll to travel · drag to orbit · tap a part to dive' : 'drag to orbit · tap a part to dive'}
      </span>
    </div>
  );
}
