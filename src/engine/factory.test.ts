// Copyright © 2026 self-repair contributors

import type { ResolvedOptions } from '../types.js'

import { describe, expect, it, vi } from 'vitest'

import { createEngine } from './factory.js'

// Suppress chalk logging during tests
vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
}))

function buildOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    runInProduction: false,
    engine: 'claude',
    issueTracker: 'github',
    maxParallelRepairs: 3,
    maxLogCount: 50,
    verbose: false,
    claudeToken: 'test-claude-token',
    openaiToken: 'test-openai-token',
    ...overrides,
  }
}

describe('engine factory', () => {
  it('creates a Claude engine when engine is claude', () => {
    const engine = createEngine(buildOptions({ engine: 'claude' }))
    expect(engine.name).toBe('claude')
  })

  it('creates a Codex engine when engine is codex', () => {
    const engine = createEngine(buildOptions({ engine: 'codex' }))
    expect(engine.name).toBe('codex')
  })

  it('returns an engine with an invoke method', () => {
    const engine = createEngine(buildOptions())
    expect(typeof engine.invoke).toBe('function')
  })
})
