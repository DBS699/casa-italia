// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output — deploys to Vercel (or any static host) with no build framework.
// `site` is the canonical URL: used for sitemap, canonical links and OG image URLs.
export default defineConfig({
  site: 'https://veloclubcasaitaliabern.ch',
  server: { port: 5189, host: true },
  integrations: [sitemap({ filter: (page) => !/\/(chat|admin-demo)\/?$/.test(page) })],
});
