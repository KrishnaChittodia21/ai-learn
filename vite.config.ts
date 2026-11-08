import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// M10: GitHub Pages can't send headers, so the Content-Security-Policy is a <meta> tag. Build only: the dev server
// injects inline scripts that this policy would block. frame-ancestors is ignored in <meta>, so clickjacking isn't
// covered (accepted risk, docs/SECURITY-CHECK.md).
// - style-src 'unsafe-inline': the boot splash <style> and React/motion style attributes
// - worker-src blob:: the drill runner's throwaway worker (src/lib/drillRunner.ts)
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  'worker-src blob:',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), csp()],
  // relative asset URLs so the build works from any sub-path, e.g. GitHub Pages' /ai-learn/
  base: './',
  // topic bodies load on demand (src/content/index.ts); name their chunks topic-<id> so they read clearly in the bundle check
  build: {
    rolldownOptions: {
      output: {
        chunkFileNames: (chunk) => (chunk.facadeModuleId?.includes('/src/content/topics/') ? 'assets/topic-[name]-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
