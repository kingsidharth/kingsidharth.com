import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Accent = 'amber' | 'purple' | 'pink' | 'teal' | 'cool';
type Typeset = 'default' | 'comfortable' | 'compact';
type ThemeMode = 'light' | 'dark';
type Tab = 'typesetting' | 'theme';

const ACCENT_KEY = 'design:accent';
const TYPESET_KEY = 'design:typeset';
const THEME_KEY = 'theme';

/* The only hardcoded colours in this file — swatch previews for palettes
   that are not the currently-active one, so they cannot be read from CSS. */
const ACCENT_SWATCH: Record<Accent, string> = {
  amber: 'oklch(0.66 0.155 66)',
  purple: 'oklch(0.64 0.19 302)',
  pink: 'oklch(0.65 0.2 350)',
  teal: 'oklch(0.65 0.12 194)',
  cool: 'oklch(0.63 0.16 260)',
};

const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: 'pink', label: 'Pink (default)' },
  { value: 'purple', label: 'Purple' },
  { value: 'amber', label: 'Amber' },
  { value: 'teal', label: 'Teal' },
  { value: 'cool', label: 'Cool blue' },
];

const TYPESET_OPTIONS: { value: Typeset; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'The bench’s standard size and leading' },
  {
    value: 'comfortable',
    label: 'Comfortable',
    description: 'Larger type, looser leading, narrower measure',
  },
  {
    value: 'compact',
    label: 'Compact',
    description: 'Smaller type, tighter leading, wider measure',
  },
];

function readAccent(): Accent {
  try {
    const stored = localStorage.getItem(ACCENT_KEY);
    if (stored === 'purple' || stored === 'amber' || stored === 'teal' || stored === 'cool') {
      return stored;
    }
  } catch {
    /* private mode: fall back to the default */
  }
  return 'pink';
}

function readTypeset(): Typeset {
  try {
    const stored = localStorage.getItem(TYPESET_KEY);
    if (stored === 'comfortable' || stored === 'compact') return stored;
  } catch {
    /* private mode: fall back to the default */
  }
  return 'default';
}

function applyAccent(accent: Accent) {
  if (accent === 'pink') {
    document.documentElement.removeAttribute('data-accent');
  } else {
    document.documentElement.setAttribute('data-accent', accent);
  }
  try {
    if (accent === 'pink') {
      localStorage.removeItem(ACCENT_KEY);
    } else {
      localStorage.setItem(ACCENT_KEY, accent);
    }
  } catch {
    /* private mode: the choice just will not persist */
  }
}

function applyTypeset(typeset: Typeset) {
  if (typeset === 'default') {
    document.documentElement.removeAttribute('data-typeset');
  } else {
    document.documentElement.setAttribute('data-typeset', typeset);
  }
  try {
    if (typeset === 'default') {
      localStorage.removeItem(TYPESET_KEY);
    } else {
      localStorage.setItem(TYPESET_KEY, typeset);
    }
  } catch {
    /* private mode: the choice just will not persist */
  }
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    btn.setAttribute('aria-pressed', String(dark));
  }
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* private mode: the choice just will not persist */
  }
}

function Screw({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('screw absolute', className)} />;
}

/** Inline gear/sliders glyph — no icon library. */
function SlidersGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="currentColor" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="currentColor" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="11" cy="18" r="2" fill="currentColor" stroke="currentColor" />
    </svg>
  );
}

function CloseGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'typesetting', label: 'Typesetting' },
  { id: 'theme', label: 'Theme colour' },
];

export default function DesignSettings() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('typesetting');
  const [accent, setAccent] = useState<Accent>('pink');
  const [typeset, setTypeset] = useState<Typeset>('default');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const panelId = `design-settings-panel-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    setAccent(readAccent());
    setTypeset(readTypeset());
    setThemeMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    setMounted(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // Escape + outside click.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePanel();
      }
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      closePanel();
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, closePanel]);

  // Basic focus trap: keep Tab navigation inside the panel while open.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Move initial focus into the panel.
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let nextIndex = index;
    if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TABS.length - 1;
    const next = TABS[nextIndex];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }, []);

  const handleTypesetSelect = useCallback((value: Typeset) => {
    setTypeset(value);
    applyTypeset(value);
  }, []);

  const handleAccentSelect = useCallback((value: Accent) => {
    setAccent(value);
    applyAccent(value);
  }, []);

  const handleThemeSelect = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-label="Design settings"
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'chassis fixed bottom-4 left-4 z-40 flex size-11 items-center justify-center rounded-full sm:bottom-6 sm:left-6',
          'text-foreground transition-transform duration-150 ease-out hover:scale-105 active:scale-95',
        )}
      >
        <Screw className="left-1 top-1" />
        <Screw className="bottom-1 right-1" />
        <SlidersGlyph className="size-5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Design settings"
          className={cn(
            'chassis fixed bottom-[4.75rem] left-4 z-50 flex max-h-[calc(100vh-6rem)] w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto sm:bottom-[5.5rem] sm:left-6',
            'transition-opacity duration-150 ease-out',
          )}
        >
          <Screw className="left-2.5 top-2.5" />
          <Screw className="right-2.5 top-2.5" />

          {/* Header strip */}
          <div className="panel-divider-h flex items-center justify-between gap-2 px-4 py-3">
            <span className="plaque text-xs font-semibold tracking-wide">DESIGN</span>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close design settings"
              className="cap flex size-7 items-center justify-center rounded-full text-foreground"
            >
              <CloseGlyph className="size-3.5" />
            </button>
          </div>

          {/* Tabs */}
          <div role="tablist" aria-label="Design settings tabs" className="panel-divider-h flex px-2 pt-2">
            {TABS.map((t, index) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`${panelId}-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${panelId}-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
                className={cn(
                  'flex-1 rounded-t-md px-2 py-2 text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'text-foreground border-b-2 border-accent'
                    : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Typesetting panel */}
          <div
            role="tabpanel"
            id={`${panelId}-panel-typesetting`}
            aria-labelledby={`${panelId}-tab-typesetting`}
            hidden={tab !== 'typesetting'}
            className="flex flex-col gap-2 p-4"
          >
            {TYPESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleTypesetSelect(option.value)}
                aria-pressed={typeset === option.value}
                className={cn(
                  'groove flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors',
                  typeset === option.value ? 'ring-2 ring-accent' : '',
                )}
              >
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}

            <div className="crt mt-2 p-3">
              <p className="text-screen-fg text-sm leading-normal">
                The quick brown fox jumps over the lazy dog, reading comfortably at any size.
              </p>
            </div>
          </div>

          {/* Theme colour panel */}
          <div
            role="tabpanel"
            id={`${panelId}-panel-theme`}
            aria-labelledby={`${panelId}-tab-theme`}
            hidden={tab !== 'theme'}
            className="flex flex-col gap-4 p-4"
          >
            <div className="flex flex-col gap-2">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleAccentSelect(option.value)}
                  aria-pressed={accent === option.value}
                  className={cn(
                    'groove flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                    accent === option.value ? 'ring-2 ring-accent' : '',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="cap size-5 shrink-0 rounded-full"
                    style={{ background: ACCENT_SWATCH[option.value] }}
                  />
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                </button>
              ))}
            </div>

            <div className="panel-divider-h pt-3">
              <span className="mb-2 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Light / Dark
              </span>
              <div className="groove flex rounded-full p-1">
                <button
                  type="button"
                  onClick={() => handleThemeSelect('light')}
                  aria-pressed={themeMode === 'light'}
                  className={cn(
                    'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    themeMode === 'light' ? 'cap text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeSelect('dark')}
                  aria-pressed={themeMode === 'dark'}
                  className={cn(
                    'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    themeMode === 'dark' ? 'cap text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
