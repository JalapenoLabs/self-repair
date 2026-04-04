// Copyright © 2026 self-repair contributors

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  computeErrorHash,
  isRecentDuplicate,
  recordError,
  resetDeduplication,
} from './deduplication'

// Suppress chalk logging during tests
vi.mock('../logger', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
}))

describe('deduplication', () => {
  afterEach(() => {
    resetDeduplication()
  })

  describe('computeErrorHash', () => {
    it('produces a 16-character hex hash', () => {
      const hash = computeErrorHash({ error: 'TypeError: Cannot read property "x"' })
      expect(hash).toMatch(/^[a-f0-9]{16}$/)
    })

    it('produces the same hash for identical errors', () => {
      const hashA = computeErrorHash({ error: 'Something broke' })
      const hashB = computeErrorHash({ error: 'Something broke' })
      expect(hashA).toBe(hashB)
    })

    it('produces different hashes for different errors', () => {
      const hashA = computeErrorHash({ error: 'Error A' })
      const hashB = computeErrorHash({ error: 'Error B' })
      expect(hashA).not.toBe(hashB)
    })

    it('normalizes absolute paths so location differences do not affect hash', () => {
      const hashA = computeErrorHash({ error: 'Error in C:\\Users\\dev\\project\\src\\app.ts' })
      const hashB = computeErrorHash({ error: 'Error in /home/ci/project/src/app.ts' })
      expect(hashA).toBe(hashB)
    })

    it('normalizes line:column numbers', () => {
      const hashA = computeErrorHash({ error: 'Error at app.ts:42:17' })
      const hashB = computeErrorHash({ error: 'Error at app.ts:99:3' })
      expect(hashA).toBe(hashB)
    })

    it('strips ISO timestamps', () => {
      const hashA = computeErrorHash({ error: 'Error at 2026-01-15T10:30:00.000Z' })
      const hashB = computeErrorHash({ error: 'Error at 2026-04-03T22:15:00.000Z' })
      expect(hashA).toBe(hashB)
    })

    it('incorporates the first 3 stack lines into the hash', () => {
      const hashWithStack = computeErrorHash({
        error: 'TypeError',
        stack: 'at foo()\nat bar()\nat baz()\nat qux()',
      })
      const hashWithoutStack = computeErrorHash({ error: 'TypeError' })
      expect(hashWithStack).not.toBe(hashWithoutStack)
    })
  })

  describe('isRecentDuplicate / recordError', () => {
    it('returns false for a never-seen error', () => {
      expect(isRecentDuplicate({ error: 'brand new error' })).toBe(false)
    })

    it('returns true for a recently recorded error', () => {
      const trigger = { error: 'duplicate me' }
      recordError(trigger)
      expect(isRecentDuplicate(trigger)).toBe(true)
    })

    it('returns false for a different error even after recording', () => {
      recordError({ error: 'error A' })
      expect(isRecentDuplicate({ error: 'error B' })).toBe(false)
    })

    it('expires entries after the dedup window', () => {
      const trigger = { error: 'will expire' }
      recordError(trigger)

      // Fast-forward past the dedup window (10 minutes + 1ms)
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60 * 1000 + 1)

      expect(isRecentDuplicate(trigger)).toBe(false)
    })
  })
})
