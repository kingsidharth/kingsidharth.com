// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.kingsidharth.com',

  // Jekyll owns ./public as its build destination (and it is gitignored),
  // so Astro gets its own static asset dir.
  publicDir: './static',
  outDir: './dist',

  // Locale routing is owned by the `src/pages/[...locale]/` segment and
  // `getStaticPaths`, not by Astro's route generator. Declaring `fallback`
  // here would make Astro emit a second `/hi/*` copy of every route on top
  // of the ones we already emit, yielding `/hi/hi/about`. Content-level
  // fallback to the default locale lives in `src/lib/content.ts`.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'hi'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },

  integrations: [react(), mdx(), sitemap({ i18n: { defaultLocale: 'en', locales: { en: 'en', hi: 'hi' } } })],

  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
