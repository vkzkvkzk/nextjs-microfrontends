import { defineConfig, type Options } from 'tsup';

const COMMON_CFG: Options = {
  format: ['esm', 'cjs'],
  splitting: false,
  sourcemap: true,
  minify: false,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['react', 'next', 'node_modules']
};

export default defineConfig([
  {
    ...COMMON_CFG,
    entry: {
      // Main entry
      index: 'src/index.ts',
      // Config
      'config/index': 'src/config/index.ts',
      // Next.js integrations (server-side)
      'next/config': 'src/next/config.ts',
      'next/middleware': 'src/next/middleware.ts'
    },
    outDir: 'dist'
  },
  {
    ...COMMON_CFG,
    entry: {
      'next/client': 'src/next/client.tsx'
    },
    outDir: 'dist',
    banner: {
      js: '"use client";'
    }
  },
  {
    ...COMMON_CFG,
    entry: {
      'next/dev-toolbar': 'src/next/dev-toolbar.tsx'
    },
    outDir: 'dist',
    // Mark sibling client module as external to avoid inlining
    // its 'use client' directive into the bundle
    external: [...COMMON_CFG.external!, './client'],
    banner: {
      js: '"use client";'
    }
  },
  {
    ...COMMON_CFG,
    entry: {
      cli: 'src/bin/cli.ts'
    },
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
]);
