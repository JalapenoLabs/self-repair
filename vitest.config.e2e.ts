// Copyright © 2026 self-repair contributors

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [ 'src/**/*.e2e.test.ts' ],
    restoreMocks: true,
    pool: 'forks',
    testTimeout: 300_000,
  },
})
