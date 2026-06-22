// @ts-check
import { defineConfig } from 'astro/config';

// Static output — deploys to Vercel (or any static host) with no build framework.
// HANDOFF: Framework "Other", no build command needed beyond `astro build`.
export default defineConfig({
  site: 'https://www.veloclubcasaitalia.ch',
  server: { port: 5189, host: true },
});
