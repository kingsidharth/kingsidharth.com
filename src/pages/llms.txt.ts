import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { splitId } from '@/lib/content';
import { localePath } from '@/lib/i18n';
export const GET: APIRoute = async ({site}) => {
  const sections = await Promise.all((['blog', 'speaking', 'guides'] as const).map(async collection => {
    const entries = await getCollection(collection, ({data}) => !data.draft);
    return `## ${collection === 'blog' ? 'Notes' : collection}\n\n` + entries.map(entry => {
      const {locale, slug} = splitId(entry.id);
      const path = localePath(locale, `${collection === 'blog' ? 'notes' : collection}/${slug}.md`);
      return `- [${entry.data.title.replace(/[\[\]\n]/g, '')}](${new URL(path, site)}): ${entry.data.description.replace(/\n/g, ' ')}`;
    }).join('\n');
  }));
  return new Response(`# Sidharth\n\n> Writing, talks, and guides on design, startups, and AI.\n\nSitemap: ${new URL('/sitemap.xml', site)}\nRSS: ${new URL('/rss.xml', site)}\n\n${sections.join('\n\n')}\n`, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
};
