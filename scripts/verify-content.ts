import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import manifest from '../src/data/legacy-import.json';

const failures: string[] = [];
const exists = async (path: string) => { try { await access(path); return true; } catch { return false; } };
for (const entry of manifest) {
  const htmlPath = resolve(`dist${entry.destination}/index.html`);
  if (!await exists(htmlPath)) { failures.push(`Missing page: ${entry.destination}`); continue; }
  const markdownPath = resolve(`dist${entry.destination}.md`);
  if (!await exists(markdownPath)) failures.push(`Missing Markdown: ${entry.destination}`);
  const html = await readFile(htmlPath, 'utf8');
  if (!html.includes(`https://www.kingsidharth.com${entry.destination}`)) failures.push(`Missing canonical: ${entry.destination}`);
  for (const match of html.matchAll(/(?:src|href)="(\/media\/64notes\/[^"?#]+)/g)) {
    if (!await exists(resolve(`dist${decodeURIComponent(match[1])}`))) failures.push(`Missing media: ${match[1]}`);
  }
  for (const match of html.matchAll(/href="(\/notes\/[^"#?]+)/g)) {
    const path = match[1].replace(/\/$/, '');
    if (!await exists(resolve(`dist${path}${path.endsWith('.md') ? '' : '/index.html'}`))) failures.push(`Broken note link: ${match[1]}`);
  }
  if (/{%|{{\s*image_path/.test(html)) failures.push(`Unresolved Liquid: ${entry.destination}`);
}
const rss = await readFile('dist/rss.xml', 'utf8');
const sitemap = await readFile('dist/sitemap-0.xml', 'utf8');
for (const entry of manifest) {
  if (!sitemap.includes(`https://www.kingsidharth.com${entry.destination}`)) failures.push(`Missing sitemap entry: ${entry.destination}`);
  if (entry.destination.startsWith('/notes/') && !rss.includes(`https://www.kingsidharth.com${entry.destination}`)) failures.push(`Missing RSS item: ${entry.destination}`);
}
for (const path of ['dist/notes/index.html', 'dist/speaking/index.html', 'dist/llms.txt', 'dist/sitemap.xml', 'dist/robots.txt']) {
  if (!await exists(path)) failures.push(`Missing discovery page: ${path}`);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Verified ${manifest.length} pages, Markdown counterparts, media, note links, sitemap membership, and RSS.`);
