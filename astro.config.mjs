// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output — deploys to Vercel (or any static host) with no build framework.
// `site` is the canonical URL: used for sitemap, canonical links and OG image URLs.
// Update it to the custom domain (e.g. https://www.veloclubcasaitalia.ch) once live there.
export default defineConfig({
  site: 'https://casa-italia.vercel.app',
  server: { port: 5189, host: true },
  integrations: [sitemap()],
});
