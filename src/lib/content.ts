import { getCollection, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, isLocale, type Locale } from './i18n';

/* ──────────────────────────────────────────────────────────────────
   Content ids are `<locale>/<...slug>`. Everything here exists so no
   route or component ever has to parse that itself.
   ────────────────────────────────────────────────────────────────── */

export type ProseCollection = 'blog' | 'guides';

/** Split `en/sampling/top-p` into `{ locale: 'en', slug: 'sampling/top-p' }`. */
export function splitId(id: string): { locale: Locale; slug: string } {
  const [head, ...rest] = id.split('/');
  if (isLocale(head) && rest.length > 0) {
    return { locale: head, slug: rest.join('/') };
  }
  // A file dropped outside a locale folder is treated as default-locale.
  return { locale: DEFAULT_LOCALE, slug: id };
}

const isPublished = (entry: { data: { draft: boolean } }) =>
  import.meta.env.DEV || !entry.data.draft;

/**
 * All entries in a collection for one locale, newest first.
 * Falls back to the default locale when a locale has no content at
 * all, so a half-translated site still renders complete navigation.
 */
export async function getLocalized<C extends ProseCollection>(
  collection: C,
  locale: Locale
): Promise<CollectionEntry<C>[]> {
  const all = await getCollection(collection);
  const published = all.filter(isPublished);

  const inLocale = published.filter((e) => splitId(e.id).locale === locale);
  const source = inLocale.length > 0 ? inLocale : published.filter(
    (e) => splitId(e.id).locale === DEFAULT_LOCALE
  );

  return source.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Find one entry by locale + slug, falling back to the default locale. */
export async function getLocalizedEntry<C extends ProseCollection>(
  collection: C,
  locale: Locale,
  slug: string
): Promise<CollectionEntry<C> | undefined> {
  const all = await getCollection(collection);
  return (
    all.find((e) => e.id === `${locale}/${slug}`) ??
    all.find((e) => e.id === `${DEFAULT_LOCALE}/${slug}`)
  );
}

/* ── guides ───────────────────────────────────────────────────────
   `<locale>/<guide>/index.mdx` is the guide root (part 0); siblings
   are its chapters, ordered by `part`. */

export type Guide = {
  slug: string;
  root: CollectionEntry<'guides'>;
  chapters: CollectionEntry<'guides'>[];
};

export async function getGuides(locale: Locale): Promise<Guide[]> {
  const entries = await getLocalized('guides', locale);

  const byGuide = new Map<string, CollectionEntry<'guides'>[]>();
  for (const entry of entries) {
    const { slug } = splitId(entry.id);
    const guideSlug = slug.split('/')[0];
    const bucket = byGuide.get(guideSlug);
    if (bucket) bucket.push(entry);
    else byGuide.set(guideSlug, [entry]);
  }

  const guides: Guide[] = [];
  for (const [slug, members] of byGuide) {
    // Astro's glob loader collapses `<guide>/index.mdx` to the id `<guide>`,
    // but accept the explicit `<guide>/index` form too, and fall back to
    // whichever entry declares itself part 0.
    const root =
      members.find((m) => {
        const s = splitId(m.id).slug;
        return s === slug || s === `${slug}/index`;
      }) ?? members.find((m) => m.data.part === 0);

    if (!root) continue; // a chapter folder with no landing page is not a guide

    guides.push({
      slug,
      root,
      chapters: members.filter((m) => m !== root).sort((a, b) => a.data.part - b.data.part),
    });
  }

  return guides.sort((a, b) => b.root.data.pubDate.valueOf() - a.root.data.pubDate.valueOf());
}

/** Previous/next chapter within a guide, for the reading footer. */
export function chapterNeighbours(guide: Guide, current: CollectionEntry<'guides'>) {
  const sequence = [guide.root, ...guide.chapters];
  const i = sequence.findIndex((e) => e.id === current.id);
  return {
    prev: i > 0 ? sequence[i - 1] : undefined,
    next: i >= 0 && i < sequence.length - 1 ? sequence[i + 1] : undefined,
  };
}

/** Rough reading time. 220 wpm, the rate for technical prose. */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
