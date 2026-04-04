// Copyright © 2026 self-repair contributors

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [ 'src/**/*.test.ts' ],
    exclude: [ 'src/**/*.e2e.test.ts' ],
    restoreMocks: true,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: [ 'text' ],
      include: [ 'src/**/*.ts' ],
      exclude: [ 'src/**/*.test.ts' ],
    },
    reporters: [ 'default', 'junit' ],
    outputFile: {
      junit: 'test-results/junit.xml',
    },
  },
})
