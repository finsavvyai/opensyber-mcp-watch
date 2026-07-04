import { defineConfig } from 'tsup';
import { fileURLToPath } from 'node:url';

// Resolve the shared core to its TypeScript source so the CLI bundle is
// self-contained and does not depend on core being built first.
const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: { entry: { index: 'src/index.ts' } },
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: false,
  minify: false,
  esbuildOptions(options) {
    options.alias = { ...options.alias, '@opensyber/mcp-watch-core': coreSrc };
  },
  banner: ({ format }) => (format === 'esm' ? { js: '#!/usr/bin/env node' } : {}),
  outExtension: () => ({ js: '.js' }),
});
