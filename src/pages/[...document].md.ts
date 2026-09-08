import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { splitId } from '@/lib/content';
import { localePath } from '@/lib/i18n';

export async function getStaticPaths() {
  const groups = await Promise.all((['blog', 'speaking', 'guides'] as const).map(async collection => {
    return (await getCollection(collection, ({data}) => !data.draft)).map(entry => {
      const { locale, slug } = splitId(entry.id);
      const route = localePath(locale, `${collection === 'blog' ? 'notes' : collection}/${slug}`);
      return { params: { document: route.slice(1) }, props: { title: entry.data.title, description: entry.data.description, date: entry.data.pubDate.toISOString().slice(0, 10), body: entry.body ?? '', route } };
    });
  }));
  return groups.flat();
}
export const GET: APIRoute = ({props, site}) => new Response(
  `# ${props.title}\n\n${props.description}\n\nPublished: ${props.date}\nCanonical: ${new URL(props.route, site)}\n\n${props.body.replace(/<!-- Imported by scripts\/import-64notes.ts -->\s*/, '')}\n`,
  { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
);
