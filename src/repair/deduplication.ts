// Copyright © 2026 self-repair contributors

import { createHash } from 'node:crypto'
import path from 'node:path'

import type { RepairTrigger } from '../types.js'

import { DEDUP_WINDOW_MS } from '../constants.js'
import { logWarning } from '../logger.js'

// ─── In-Memory Dedup State ──────────────────────────────────────────────────

const recentErrors = new Map<string, number>()

/**
 * Strips volatile parts from an error string so that semantically identical
 * errors produce the same hash regardless of timestamps, absolute paths,
 * or line/column numbers.
 */
function normalizeForHashing(text: string): string {
  return text
    // Collapse Windows absolute paths to basenames
    .replace(/[A-Z]:\\[^\s:]+/g, (match) => path.win32.basename(match))
    // Collapse Unix absolute paths to basenames
    .replace(/\/[^\s:]+/g, (match) => path.posix.basename(match))
    // Strip line:column pairs (e.g. ":42:17")
    .replace(/:\d+:\d+/g, '')
    // Strip ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '')
    .trim()
}

/**
 * Computes a truncated SHA-256 hash of the normalized error message
 * and the first three lines of the stack trace.
 */
export function computeErrorHash(trigger: RepairTrigger): string {
  let normalized = normalizeForHashing(trigger.error)

  if (trigger.stack) {
    const firstStackLines = trigger.stack
      .split('\n')
      .slice(0, 3)
      .map(normalizeForHashing)
      .join('\n')
    normalized += `\n${firstStackLines}`
  }

  return createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Prunes expired entries from the dedup map, then checks whether
 * this error was already seen within the dedup window.
 */
export function isRecentDuplicate(trigger: RepairTrigger): boolean {
  const now = Date.now()

  // Evict expired entries
  for (const [ hash, timestamp ] of recentErrors) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentErrors.delete(hash)
    }
  }

  const hash = computeErrorHash(trigger)
  if (recentErrors.has(hash)) {
    logWarning(
      `Duplicate error detected (hash: ${hash}). `
      + 'Skipping -- a repair for this error was already triggered recently.',
    )
    return true
  }

  return false
}

/**
 * Records that this error has been seen, preventing duplicates
 * within the dedup window.
 */
export function recordError(trigger: RepairTrigger): void {
  const hash = computeErrorHash(trigger)
  recentErrors.set(hash, Date.now())
}

/**
 * Clears dedup state. Intended for testing only.
 */
export function resetDeduplication(): void {
  recentErrors.clear()
}
