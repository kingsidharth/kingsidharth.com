import { readdir, readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { parse, stringify } from 'yaml';
import TurndownService from 'turndown';

// Run once against a local checkout; builds use the committed Markdown.
const source = resolve(process.argv[2] ?? '../64notes.com');
const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
converter.keep(['video', 'source', 'iframe', 'table']);
converter.remove(['script', 'style']);
type Legacy = Record<string, unknown>;
const string = (value: unknown) => typeof value === 'string' ? value : '';
const manifest: { source: string; destination: string }[] = [];
const paths = new Map<string, string>();
const groups = [['_posts', 'blog'], ['design/_posts', 'blog'], ['podcast/_posts', 'blog'], ['speaking', 'speaking']] as const;
const noteSlugs = new Set<string>();
for (const folder of ['_posts', 'design/_posts', 'podcast/_posts']) {
  for (const filename of await readdir(resolve(source, folder))) {
    const match = filename.match(/^\d{4}-\d{2}-\d{2}-(.+)\.(?:html|markdown|md)$/);
    if (match) noteSlugs.add(match[1].toLowerCase());
  }
}
for (const [folder, collection] of groups) {
  const directory = folder === 'speaking' ? resolve('app/speaking/_posts') : resolve(source, folder);
  for (const filename of (await readdir(directory)).sort()) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.(?:html|markdown|md)$/);
    if (!match) continue;
    const raw = await readFile(resolve(directory, filename), 'utf8');
    const parts = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!parts) throw new Error(`Missing frontmatter: ${filename}`);
    let data: Legacy;
    try { data = parse(parts[1].replace(/^([\w_]+: "[^"\n]*)\n([^"\n]*")/gm, "$1 $2")) as Legacy; } catch (error) { throw new Error(`Invalid frontmatter: ${filename}`, { cause: error }); }
    if (data.published === false || data.status === 'draft') continue;
    const slug = match[2].toLowerCase();
    const destination = `/${collection === 'blog' ? 'notes' : 'speaking'}/${slug}`;
    if (paths.has(destination)) throw new Error(`Slug collision: ${filename}`);
    paths.set(destination, filename);
    let body = parts[2].replace(/{%\s*comment\s*%}[\s\S]*?{%\s*endcomment\s*%}/g, '');
    // Resolve assignments before removing their declarations.
    for (const assignment of parts[2].matchAll(/{%\s*assign\s+(\w+)\s*=\s*['"]([^'"]+)['"]\s*%}/g)) {
      body = body.replaceAll(new RegExp(`{{\\s*${assignment[1]}\\s*}}`, 'g'), assignment[2]);
    }
    body = body.replace(/{%\s*assign\s+[^%]+%}/g, "");
    body = body.replace(/<!--([\s\S]*?)-->/g, '');
    body = body.replace(/<script\b[^>]*data-id=["']([^"']+)["'][^>]*>[\s\S]*?<\/script>/g, '<a href="https://speakerdeck.com/player/$1">View slides</a>');
    if (filename.endsWith('.html')) body = converter.turndown(body);
    body = body.replace(/(?:https?:\/\/(?:www\.)?64notes\.com)?\/images\//g, '/media/64notes/');
    body = body.replace(/https?:\/\/(?:www\.)?64notes\.com\/[^\s)"<>]*/g, (url: string) => {
      const parsed = new URL(url);
      const oldSlug = parsed.pathname.replace(/^\/(?:design\/|podcast\/)?/, '').replace(/\/$/, '').toLowerCase();
      return noteSlugs.has(oldSlug) ? `/notes/${oldSlug}${parsed.search}${parsed.hash}` : url;
    });
    if (/{%|{{/.test(body)) throw new Error(`Unresolved Liquid: ${filename}`);
    const links = collection === 'speaking'
      ? [['Slides', data.slide_link], ['Video', data.video_link], ['Event', data.evlink]]
      : [['Listen on Spotify', data.spotify_url], ['Listen to episode', data.anchor_url]];
    for (const [label, url] of links) if (string(url)) body += `\n\n[${label}](${url})`;
    if (collection === 'speaking' && string(data.youtube_video_id) && !string(data.video_link)) body += `\n\n[Watch video](https://www.youtube.com/watch?v=${data.youtube_video_id})`;
    const title = string(data.title);
    const description = string(data.seo_description) || string(data.subheader) || [string(data.event), string(data.place)].filter(Boolean).join(' — ') || title;
    const metadata = { title, description, pubDate: match[1], tags: Array.isArray(data.tags) ? data.tags.map(String) : [], ...(collection === 'speaking' ? { event: string(data.event), place: string(data.place) } : {}) };
    const target = `src/content/${collection}/en`;
    await mkdir(target, { recursive: true });
    const output = `${target}/${slug}.md`;
    // Re-imports are deterministic; never replace independently authored content.
    try { const existing = await readFile(output, 'utf8'); if (!existing.includes('Imported by scripts/import-64notes.ts')) throw new Error(`Refusing overwrite: ${output}`); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    await writeFile(output, `---\n${stringify(metadata)}---\n\n<!-- Imported by scripts/import-64notes.ts -->\n\n${body.trim()}\n`);
    manifest.push({ source: `${folder}/${basename(filename)}`, destination });
  }
}
await mkdir('static/media/64notes', { recursive: true });
await cp(resolve(source, 'images'), 'static/media/64notes', { recursive: true });
await writeFile('src/data/legacy-import.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported ${manifest.filter(x => x.destination.startsWith('/notes/')).length} notes and ${manifest.filter(x => x.destination.startsWith('/speaking/')).length} talks.`);
