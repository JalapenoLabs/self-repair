// Copyright © 2026 self-repair contributors

import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      'index': 'src/index.ts',
      'child-worker': 'src/repair/child-worker.ts',
    },
    format: [ 'esm' ],
    dts: { entry: 'src/index.ts' },
    splitting: true,
    sourcemap: true,
    clean: true,
    target: 'node20',
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: [ 'esm' ],
    sourcemap: true,
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
  },
])
