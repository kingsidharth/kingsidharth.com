import rss from '@astrojs/rss';
import type { APIContext, GetStaticPaths } from 'astro';
import { getLocalized, splitId } from '@/lib/content';
import { localePath, localeStaticPaths } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

export const getStaticPaths = (() => localeStaticPaths()) satisfies GetStaticPaths;

export async function GET(context: APIContext) {
  const { locale } = context.props as { locale: Locale };
  const notes = await getLocalized('blog', locale);

  return rss({
    title: 'Sidharth — Field notes',
    description: 'Findings, not claims. Notes on building with AI.',
    site: context.site ?? 'https://www.kingsidharth.com',
    trailingSlash: false,
    items: notes.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate,
      categories: entry.data.tags,
      link: localePath(splitId(entry.id).locale, `notes/${splitId(entry.id).slug}`),
    })),
    customData: `<language>${locale === 'hi' ? 'hi-IN' : 'en-GB'}</language>`,
  });
}
