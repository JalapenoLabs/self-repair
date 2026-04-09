// Copyright © 2026 self-repair contributors

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getResolvedOptions,
  isProductionGuarded,
  resetOptions,
  setSelfRepairOptions,
} from './options'

// Suppress chalk logging during tests
vi.mock('../logger', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
  logUsage: vi.fn(),
}))

// Mock token resolution to avoid filesystem reads
vi.mock('./resolve-tokens', () => ({
  resolveTokens: vi.fn((options: any) => ({
    claudeToken: options.CLAUDE_API_TOKEN ?? 'mock-claude-token',
    openaiToken: options.OPENAI_API_TOKEN ?? undefined,
    githubToken: options.GITHUB_TOKEN ?? 'mock-github-token',
  })),
}))

describe('options', () => {
  afterEach(() => {
    resetOptions()
    vi.unstubAllEnvs()
  })

  describe('setSelfRepairOptions', () => {
    it('returns resolved options with defaults applied', () => {
      const resolved = setSelfRepairOptions({})
      expect(resolved.runInProduction).toBe(false)
      expect(resolved.engine).toBe('claude')
      expect(resolved.issueTracker).toBe('github')
      expect(resolved.maxParallelRepairs).toBe(3)
      expect(resolved.maxLogCount).toBe(50)
      expect(resolved.maxTurns).toBe(50)
    })

    it('respects explicitly provided values', () => {
      const resolved = setSelfRepairOptions({
        runInProduction: true,
        engine: 'codex',
        issueTracker: 'jira',
        maxParallelRepairs: 5,
        maxLogCount: 100,
        maxTurns: 25,
        repo: 'owner/repo',
      })
      expect(resolved.runInProduction).toBe(true)
      expect(resolved.engine).toBe('codex')
      expect(resolved.issueTracker).toBe('jira')
      expect(resolved.maxParallelRepairs).toBe(5)
      expect(resolved.maxLogCount).toBe(100)
      expect(resolved.maxTurns).toBe(25)
      expect(resolved.repo).toBe('owner/repo')
    })

    it('returns the same object from getResolvedOptions', () => {
      const returned = setSelfRepairOptions({ repo: 'test/repo' })
      const fetched = getResolvedOptions()
      expect(fetched).toBe(returned)
    })
  })

  describe('getResolvedOptions', () => {
    it('throws if options have not been configured', () => {
      expect(() => getResolvedOptions()).toThrow('Options have not been configured')
    })
  })

  describe('isProductionGuarded', () => {
    it('returns false when not in production', () => {
      setSelfRepairOptions({})
      vi.stubEnv('NODE_ENV', 'development')
      expect(isProductionGuarded()).toBe(false)
    })

    it('returns true when in production without opt-in', () => {
      setSelfRepairOptions({})
      vi.stubEnv('NODE_ENV', 'production')
      expect(isProductionGuarded()).toBe(true)
    })

    it('returns false when in production with runInProduction enabled', () => {
      setSelfRepairOptions({ runInProduction: true })
      vi.stubEnv('NODE_ENV', 'production')
      expect(isProductionGuarded()).toBe(false)
    })

    it('returns false when options are not set', () => {
      expect(isProductionGuarded()).toBe(false)
    })
  })
})
