import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    noExternal: ['@noble/secp256k1'],
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.js' };
    },
  },
  {
    entry: ['bin/cli.ts'],
    format: ['cjs'],
    banner: { js: '#!/usr/bin/env node' },
    outDir: 'dist',
    platform: 'node',
    outExtension() {
      return { js: '.cjs' };
    },
  },
]);
