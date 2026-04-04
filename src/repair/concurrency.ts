// Copyright © 2026 self-repair contributors

import type { ChildProcess } from 'node:child_process'

import type { ConcurrencyTracker } from '../types.js'

import { logWarning } from '../logger.js'

/**
 * Creates a concurrency tracker that limits the number of active
 * repair child processes. Automatically removes processes from the
 * set when they exit.
 */
export function createConcurrencyTracker(maxParallel: number): ConcurrencyTracker {
  const activeProcesses = new Set<ChildProcess>()

  function canSpawn(): boolean {
    if (activeProcesses.size >= maxParallel) {
      logWarning(
        `Concurrency limit reached (${activeProcesses.size}/${maxParallel}). `
        + 'Repair request will be dropped.',
      )
      return false
    }
    return true
  }

  function track(child: ChildProcess): void {
    activeProcesses.add(child)

    child.on('exit', () => {
      activeProcesses.delete(child)
    })

    child.on('error', () => {
      activeProcesses.delete(child)
    })
  }

  function activeCount(): number {
    return activeProcesses.size
  }

  return { canSpawn, track, activeCount }
}
