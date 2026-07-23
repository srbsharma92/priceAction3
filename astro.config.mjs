import { defineConfig } from 'astro/config';

// Static output. Cloudflare Pages Functions in /functions handle the
// live API route (/api/data) separately — no SSR adapter needed here.
export default defineConfig({
  output: 'static',
});
