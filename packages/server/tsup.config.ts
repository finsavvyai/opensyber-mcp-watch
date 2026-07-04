import { defineConfig } from 'tsup';
import { fileURLToPath } from 'node:url';

const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  minify: false,
  esbuildOptions(options) {
    options.alias = { ...options.alias, '@opensyber/mcp-watch-core': coreSrc };
  },
  banner: { js: '#!/usr/bin/env node' },
  outExtension: () => ({ js: '.js' }),
});
