// Copyright © 2026 self-repair contributors

import type { ResolvedOptions } from '../types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { startSelfRepair } from './start.js'

// vi.hoisted ensures these variables are initialized before vi.mock factories run
const {
  mockGetResolvedOptions,
  mockIsProductionGuarded,
  mockIsRecentDuplicate,
  mockRecordError,
  mockCanSpawn,
  mockTrack,
  mockCreateConcurrencyTracker,
  mockSpawnChildProcess,
} = vi.hoisted(() => ({
  mockGetResolvedOptions: vi.fn(),
  mockIsProductionGuarded: vi.fn(),
  mockIsRecentDuplicate: vi.fn(),
  mockRecordError: vi.fn(),
  mockCanSpawn: vi.fn(),
  mockTrack: vi.fn(),
  mockCreateConcurrencyTracker: vi.fn(),
  mockSpawnChildProcess: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('../config/options.js', () => ({
  getResolvedOptions: mockGetResolvedOptions,
  isProductionGuarded: mockIsProductionGuarded,
}))

vi.mock('./deduplication.js', () => ({
  isRecentDuplicate: mockIsRecentDuplicate,
  recordError: mockRecordError,
  computeErrorHash: vi.fn().mockReturnValue('abc123'),
  resetDeduplication: vi.fn(),
}))

vi.mock('./concurrency.js', () => ({
  createConcurrencyTracker: mockCreateConcurrencyTracker,
}))

vi.mock('./spawn-child.js', () => ({
  spawnChildProcess: mockSpawnChildProcess,
}))

function buildOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    runInProduction: false,
    engine: 'claude',
    issueTracker: 'github',
    maxParallelRepairs: 3,
    maxLogCount: 50,
    verbose: false,
    ...overrides,
  }
}

const fakeChild = { pid: 1234, unref: vi.fn() }

describe('startSelfRepair', () => {
  beforeEach(() => {
    mockIsProductionGuarded.mockReturnValue(false)
    mockIsRecentDuplicate.mockReturnValue(false)
    mockCanSpawn.mockReturnValue(true)
    mockCreateConcurrencyTracker.mockReturnValue({
      canSpawn: mockCanSpawn,
      track: mockTrack,
      activeCount: vi.fn().mockReturnValue(0),
    })
    mockSpawnChildProcess.mockReturnValue(fakeChild)
    mockGetResolvedOptions.mockReturnValue(buildOptions())
  })

  it('does nothing when production-guarded', () => {
    mockIsProductionGuarded.mockReturnValue(true)
    startSelfRepair({ error: 'boom' }, buildOptions())
    expect(mockSpawnChildProcess).not.toHaveBeenCalled()
  })

  it('does nothing for a recently recorded duplicate error', () => {
    mockIsRecentDuplicate.mockReturnValue(true)
    startSelfRepair({ error: 'duplicate error' }, buildOptions())
    expect(mockSpawnChildProcess).not.toHaveBeenCalled()
  })

  it('drops the request and logs a warning when at the concurrency limit', () => {
    mockCanSpawn.mockReturnValue(false)
    startSelfRepair({ error: 'too many' }, buildOptions())
    expect(mockSpawnChildProcess).not.toHaveBeenCalled()
  })

  it('spawns a child process on the happy path', () => {
    startSelfRepair({ error: 'real error' }, buildOptions())
    expect(mockSpawnChildProcess).toHaveBeenCalledOnce()
  })

  it('tracks the spawned child for concurrency accounting', () => {
    startSelfRepair({ error: 'real error' }, buildOptions())
    expect(mockTrack).toHaveBeenCalledWith(fakeChild)
  })

  it('records the error to prevent future duplicates', () => {
    startSelfRepair({ error: 'track me' }, buildOptions())
    expect(mockRecordError).toHaveBeenCalled()
  })

  it('uses optionsOverride when provided and skips getResolvedOptions', () => {
    const custom = buildOptions({ repo: 'custom/repo' })
    startSelfRepair({ error: 'x' }, custom)
    expect(mockGetResolvedOptions).not.toHaveBeenCalled()
    expect(mockSpawnChildProcess).toHaveBeenCalledWith(custom, expect.any(Object))
  })

  it('falls back to getResolvedOptions when no override is given', () => {
    startSelfRepair({ error: 'x' })
    expect(mockGetResolvedOptions).toHaveBeenCalled()
  })

  it('auto-populates timestamp on the trigger when not provided', () => {
    startSelfRepair({ error: 'no ts' }, buildOptions())
    const [, trigger] = mockSpawnChildProcess.mock.calls[0]
    expect(typeof trigger.timestamp).toBe('number')
    expect(trigger.timestamp).toBeGreaterThan(0)
  })
})
