import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** La prévisualisation (et donc les tests E2E) sert la même CSP que nginx en production. */
const csp = /Content-Security-Policy "([^"]+)"/.exec(
  readFileSync(new URL('./deploy/security-headers.conf', import.meta.url), 'utf8'),
)?.[1];

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    // Aucun asset en data: URI (polices comprises) : la CSP n'autorise que 'self'.
    assetsInlineLimit: 0,
  },
  server: { port: 5173 },
  preview: { headers: csp ? { 'Content-Security-Policy': csp } : {} },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/types.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
