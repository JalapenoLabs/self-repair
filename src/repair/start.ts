// Copyright © 2026 self-repair contributors

import type { ConcurrencyTracker, RepairTrigger, ResolvedOptions } from '../types'

import { getResolvedOptions, isProductionGuarded } from '../config/options'
import { logInfo, logWarning } from '../logger'
import { createConcurrencyTracker } from './concurrency'
import { isRecentDuplicate, recordError } from './deduplication'
import { spawnChildProcess } from './spawn-child'

// ─── Module-Level Concurrency State ─────────────────────────────────────────

let tracker: ConcurrencyTracker | null = null

function getTracker(options: ResolvedOptions): ConcurrencyTracker {
  if (!tracker) {
    tracker = createConcurrencyTracker(options.maxParallelRepairs)
  }
  return tracker
}

/**
 * Triggers a self-repair process for the given error. This is the primary
 * public API for manually invoking repair outside of the crash handler.
 *
 * The repair runs in a fully detached child process and does not block
 * the calling thread. Returns immediately after spawning.
 *
 * @param trigger - The error information to diagnose and repair.
 * @param optionsOverride - Optional resolved options. If omitted, uses the
 *   globally configured options from `setSelfRepairOptions`.
 */
export function startSelfRepair(
  trigger: RepairTrigger,
  optionsOverride?: ResolvedOptions,
): void {
  const options = optionsOverride ?? getResolvedOptions()

  // Production guard
  if (isProductionGuarded()) {
    return
  }

  // Normalize trigger
  const normalizedTrigger: RepairTrigger = {
    error: typeof trigger.error === 'string'
      ? trigger.error
      : String(trigger.error),
    stack: trigger.stack,
    timestamp: trigger.timestamp ?? Date.now(),
  }

  // Deduplication check
  if (isRecentDuplicate(normalizedTrigger)) {
    return
  }

  // Concurrency check
  const concurrencyTracker = getTracker(options)
  if (!concurrencyTracker.canSpawn()) {
    logWarning('Repair request dropped due to concurrency limit.')
    return
  }

  // Record this error to prevent duplicate triggers
  recordError(normalizedTrigger)

  logInfo(
    `Starting self-repair for: ${normalizedTrigger.error.slice(0, 100)}`
    + (normalizedTrigger.error.length > 100 ? '...' : ''),
  )

  // Spawn detached repair process
  const child = spawnChildProcess(options, normalizedTrigger)
  concurrencyTracker.track(child)
}
