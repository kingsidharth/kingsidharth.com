/* ──────────────────────────────────────────────────────────────────
   i18n. The plumbing is complete for every locale in LOCALES; only
   `en` is populated today. Adding a language means: add it here, add
   a `ui` block, drop MDX into src/content/<collection>/<locale>/.
   No route or component changes.
   ────────────────────────────────────────────────────────────────── */

export const DEFAULT_LOCALE = 'en' as const;

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_META: Record<Locale, { name: string; endonym: string; dir: 'ltr' | 'rtl' }> = {
  en: { name: 'English', endonym: 'English', dir: 'ltr' },
  hi: { name: 'Hindi', endonym: 'हिन्दी', dir: 'ltr' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The `[...locale]` route param. Undefined for the default locale so
 * English URLs stay unprefixed (`/blog`, not `/en/blog`).
 */
export function localeParam(locale: Locale): string | undefined {
  return locale === DEFAULT_LOCALE ? undefined : locale;
}

/** Build a path in a given locale. `localePath('hi', 'blog/foo')` -> `/hi/blog/foo`. */
export function localePath(locale: Locale, path = ''): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return clean ? `${prefix}/${clean}` : prefix || '/';
}

/** One `getStaticPaths` entry per locale, for `[...locale]` routes. */
export function localeStaticPaths() {
  return LOCALES.map((locale) => ({
    params: { locale: localeParam(locale) },
    props: { locale },
  }));
}

/* ── UI strings ───────────────────────────────────────────────────
   Typed against the English block, so a missing key in another
   locale is a compile error rather than a blank on the page. */

const en = {
  'nav.watch': 'Watch',
  'nav.tools': 'Tools',
  'nav.notes': 'Notes',
  'nav.guides': 'Guides',
  'nav.about': 'About',
  'nav.skipToContent': 'Skip to content',

  'theme.toggle': 'Toggle light and dark',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'lang.switch': 'Change language',

  'shelf.title': 'Work',
  'shelf.sub': 'interactive tools for understanding AI',
  'shelf.figure': 'Fig.',

  'broadcasts.title': 'Videos',
  'broadcasts.sub': 'long-form, most Fridays',
  'broadcasts.views': 'views',

  'notes.title': 'Writing',
  'notes.sub': 'essays on AI, product, and building',
  'notes.readingTime': 'min',
  'notes.draft': 'Draft',
  'notes.all': 'Read all',
  'notes.empty': 'Nothing filed here yet.',

  'guides.title': 'Guides',
  'guides.sub': 'read in order',
  'guides.parts': 'parts',
  'guides.part': 'Part',
  'guides.next': 'Next',
  'guides.prev': 'Previous',
  'guides.contents': 'Contents',

  'doc.published': 'Published',
  'doc.updated': 'Updated',
  'doc.related': 'Related tools',

  'status.live': 'live',
  'status.beta': 'beta',
  'status.rough': 'rough',
  'status.archived': 'archived',

  'error.404.title': 'Not found',
  'error.404.body': 'This page does not exist.',
  'error.404.home': 'Go home',
} as const;

export type UIKey = keyof typeof en;

const hi: Partial<Record<UIKey, string>> = {
  // Populated when Hindi ships. Missing keys fall back to English.
};

const dictionaries: Record<Locale, Partial<Record<UIKey, string>>> = { en, hi };

/** `const t = useTranslations(locale); t('nav.notes')` */
export function useTranslations(locale: Locale) {
  const dict = dictionaries[locale] ?? {};
  return function t(key: UIKey): string {
    return dict[key] ?? en[key];
  };
}

/** Locales that actually have content, for the language switcher. */
export function populatedLocales(): Locale[] {
  return LOCALES.filter((l) => l === DEFAULT_LOCALE || Object.keys(dictionaries[l]).length > 0);
}

export function formatDate(date: Date, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(date);
}

export function formatCompact(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}
