// Copyright © 2026 self-repair contributors

import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { createConcurrencyTracker } from './concurrency'

// Suppress chalk logging during tests
vi.mock('../logger', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
  logUsage: vi.fn(),
}))

/**
 * Creates a fake ChildProcess-like object for testing.
 */
function createFakeChild(): EventEmitter {
  return new EventEmitter()
}

describe('concurrency tracker', () => {
  it('allows spawning when under the limit', () => {
    const tracker = createConcurrencyTracker(3)
    expect(tracker.canSpawn()).toBe(true)
    expect(tracker.activeCount()).toBe(0)
  })

  it('tracks active child processes', () => {
    const tracker = createConcurrencyTracker(3)
    const child = createFakeChild()
    tracker.track(child as any)
    expect(tracker.activeCount()).toBe(1)
  })

  it('blocks spawning at the concurrency limit', () => {
    const tracker = createConcurrencyTracker(2)
    tracker.track(createFakeChild() as any)
    tracker.track(createFakeChild() as any)
    expect(tracker.canSpawn()).toBe(false)
  })

  it('removes a process from the set when it exits', () => {
    const tracker = createConcurrencyTracker(2)
    const child = createFakeChild()
    tracker.track(child as any)
    expect(tracker.activeCount()).toBe(1)

    child.emit('exit')
    expect(tracker.activeCount()).toBe(0)
    expect(tracker.canSpawn()).toBe(true)
  })

  it('removes a process from the set on error', () => {
    const tracker = createConcurrencyTracker(2)
    const child = createFakeChild()
    tracker.track(child as any)

    child.emit('error', new Error('spawn failed'))
    expect(tracker.activeCount()).toBe(0)
  })
})
