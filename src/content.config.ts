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
    /**
     * Basename in `static/art` of the cover plate's tone grid. Set on a
     * guide's root (part 0) only — chapters inherit nothing, because a
     * cover is the thing you arrive at, not a header on every page.
     */
    art: z.string().optional(),
    /**
     * Where the cover's two charges collide, in fractions of the artwork
     * (not of the plate — the plate crops).
     *
     * The cover lights itself from two sources travelling inward from
     * opposite edges, and this is the seam they meet on. It has to be
     * authored per drawing because it is a fact about the picture, not
     * about the layout: on the reaching hands it is the finger gap, and
     * putting it anywhere else lights the knuckles and leaves the one
     * charged point in the frame cold. The dwell ring draws here too.
     */
    artFocus: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.5, 0.5]),
    /**
     * How the cover idles. One per drawing, because a motion that suits
     * one of them is arbitrary on the others — the whole reason the
     * diagonal shimmer had to go.
     *
     *   reach    charges collide at the seam, and resting a cursor fills
     *            a dwell ring there. The two hands, where the gap is the
     *            subject and waiting for contact is the joke.
     *   settle   waves fall from the held objects down into the hand.
     *            The palm and its cubes, where the drawing is about what
     *            is about to land.
     *   stream   characters fall through the empty space behind the
     *            drawing. The spiral, where the subject is a thing
     *            travelling down through layers in order — so the
     *            background is the traffic it is travelling in.
     */
    artMotion: z.enum(['reach', 'settle', 'stream']).default('reach'),
    /** One line under the title on the cover. Longer than a tagline. */
    subtitle: z.string().optional(),
    /**
     * What a reader can do afterwards that they could not before.
     *
     * Deliberately not a contents list — the chapter rail already says
     * what is covered. This says what it is for, which is the only part
     * of a cover anyone reads twice.
     */
    benefits: z.array(z.string()).default([]),
    /**
     * Swap the cover's benefits list for the chat exchange — a question
     * in, an answer out, and the two questions the guide answers. For
     * guides whose pitch is a conversation, not a checklist.
     */
    exchange: z.boolean().default(false),
    /**
     * Hide the chapter Contents rail for this guide — for a single long
     * essay whose chapters are navigated with prev/next, not a map.
     */
    hideContents: z.boolean().default(false),
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


const work = defineCollection({
  loader: file('./src/data/work.json'),
  schema: z.object({
    id: z.string(),
    org: z.string(),
    role: z.string(),
    period: z.string(),
    /** Drives the green "current" pip. */
    current: z.boolean(),
    summary: z.string(),
    /** Specific outcomes. Empty for roles where the summary says enough. */
    highlights: z.array(z.string()).default([]),
    /** Explicit display order — the JSON loader does not guarantee it. */
    order: z.number().int(),
  }),
});

const collections_ = defineCollection({
  loader: file('./src/data/collections.json'),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    /** e.g. "8-part series" — what kind of thing this is. */
    seed: z.number().int(),
    url: z.string(),
    /** Poster gradient stops. Colour, so it can be desaturated. */
    from: z.string(),
    via: z.string(),
    to: z.string(),
    /** Basename in `static/art` of the ascii artwork on the poster. */
    art: z.string(),
    parts: z.number().int(),
    /** What sort of thing this is — shared vocabulary with the tools
        and guides it sits beside in the lineup. */
    kind: z.string(),
  }),
});

export const collections = {
  blog,
  guides,
  instruments,
  broadcasts,
  work,
  series: collections_,
};
export { LOCALES };
