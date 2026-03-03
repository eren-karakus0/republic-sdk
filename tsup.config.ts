import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
  },
  {
    entry: ['bin/cli.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    outDir: 'dist',
    noExternal: [/(.*)/],
    platform: 'node',
  },
]);
