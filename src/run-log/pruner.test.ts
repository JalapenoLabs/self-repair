// Copyright © 2026 self-repair contributors

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pruneRunLogs } from './pruner.js'

// Suppress chalk logging during tests
vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
}))

let testLogsDir: string

// Mock getLogsDirectory to use a temp dir
vi.mock('./writer.js', () => ({
  getLogsDirectory: () => testLogsDir,
}))

describe('pruneRunLogs', () => {
  beforeEach(() => {
    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
    testLogsDir = join(tmpdir(), `self-repair-test-${suffix}`)
    mkdirSync(testLogsDir, { recursive: true })
  })

  afterEach(() => {
    // Best-effort cleanup
    try {
      rmSync(testLogsDir, { recursive: true, force: true })
    }
    catch {
      // Best-effort cleanup
    }
  })

  it('does nothing when under the max count', () => {
    writeFileSync(join(testLogsDir, 'log1.json'), '{}')
    writeFileSync(join(testLogsDir, 'log2.json'), '{}')

    pruneRunLogs(5)

    expect(readdirSync(testLogsDir).filter((f) => f.endsWith('.json'))).toHaveLength(2)
  })

  it('deletes the oldest logs when over the max count', () => {
    // Create 5 log files with staggered creation
    for (let index = 0; index < 5; index++) {
      const filename = `log-${String(index).padStart(3, '0')}.json`
      writeFileSync(join(testLogsDir, filename), JSON.stringify({ index }))
    }

    pruneRunLogs(3)

    const remaining = readdirSync(testLogsDir).filter((f) => f.endsWith('.json'))
    expect(remaining.length).toBe(3)
  })

  it('ignores non-JSON files', () => {
    writeFileSync(join(testLogsDir, 'readme.txt'), 'not a log')
    writeFileSync(join(testLogsDir, 'log1.json'), '{}')

    pruneRunLogs(1)

    expect(existsSync(join(testLogsDir, 'readme.txt'))).toBe(true)
  })
})
