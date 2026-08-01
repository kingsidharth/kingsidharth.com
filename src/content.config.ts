import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/* ──────────────────────────────────────────────────────────────────
   Locale-partitioned content.

   Every MDX collection is keyed `<locale>/<...slug>` on disk, e.g.
     src/content/blog/en/evals-are-the-new-prd.mdx  -> id "en/evals-are-the-new-prd"
     src/content/guides/hi/sampling/top-p.mdx       -> id "hi/sampling/top-p"

   `src/lib/content.ts` splits the locale off the id, so routes never
   have to know about the directory layout.
   ────────────────────────────────────────────────────────────────── */

const LOCALES = ['en', 'hi'] as const;

/** Shared frontmatter every prose document carries. */
const documentBase = {
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  draft: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  /** Set when this doc is a translation of another locale's doc. */
  translationOf: z.string().optional(),
};

/* ── semi-structured: prose with validated frontmatter ───────────── */

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/[^_]*.{md,mdx}' }),
  schema: z.object({
    ...documentBase,
    /**
     * `til` renders as a one-line entry in the index; `essay` gets a
     * reading-time stamp and its own page treatment.
     */
    kind: z.enum(['essay', 'til']).default('essay'),
    /** Instruments this note is about — rendered as a "see also" rack. */
    instruments: z.array(reference('instruments')).default([]),
  }),
});

/**
 * Guides are multi-part. A guide's root lives at `<locale>/<guide>/index.mdx`
 * and carries `part: 0`; chapters are siblings ordered by `part`.
 */
const guides = defineCollection({
  loader: glob({ base: './src/content/guides', pattern: '**/[^_]*.{md,mdx}' }),
  schema: z.object({
    ...documentBase,
    /** 0 = the guide's own landing page. 1..n = chapters, in order. */
    part: z.number().int().min(0).default(0),
    /** Shown in the sidebar instead of `title` when the title is long. */
    navLabel: z.string().optional(),
    instruments: z.array(reference('instruments')).default([]),
  }),
});

/* ── structured: pure data, no prose ─────────────────────────────── */

const instruments = defineCollection({
  loader: file('./src/data/instruments.json'),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    blurb: z.string(),
    /** Drives the status pip and the dim/lit chip on the card. */
    status: z.enum(['live', 'beta', 'rough', 'archived']),
    version: z.string(),
    /** Which screen renderer the shelf card mounts. */
    screen: z.enum(['distribution', 'typewriter', 'tokens', 'player', 'static']),
    href: z.string().optional(),
    repo: z.string().url().optional(),
    figure: z.number().int(),
  }),
});

const broadcasts = defineCollection({
  loader: file('./src/data/broadcasts.json'),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    series: z.string(),
    episode: z.string(),
    duration: z.string(),
    pubDate: z.coerce.date(),
    views: z.number().int().optional(),
    url: z.string().url(),
    /** Generative dithered thumbnail: which field function + seed. */
    motif: z.enum(['reach', 'burst', 'orb', 'tunnel', 'shards', 'grid']),
    seed: z.number().int(),
  }),
});

export const collections = { blog, guides, instruments, broadcasts };
export { LOCALES };
