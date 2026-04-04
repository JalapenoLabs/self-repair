// Copyright © 2026 self-repair contributors

import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { logInfo } from '../logger.js'
import { getLogsDirectory } from './writer.js'

type LogFileEntry = {
  path: string
  createdAt: number
}

/**
 * Prunes old run log files, keeping only the most recent `maxCount` entries.
 * Deletes the oldest files first based on filesystem creation time.
 */
export function pruneRunLogs(maxCount: number): void {
  const logsDir = getLogsDirectory()
  const entries: LogFileEntry[] = []

  for (const filename of readdirSync(logsDir)) {
    if (!filename.endsWith('.json')) {
      continue
    }

    const filePath = join(logsDir, filename)
    try {
      const stats = statSync(filePath)
      entries.push({ path: filePath, createdAt: stats.birthtimeMs })
    }
    catch {
      // Skip files we can't stat
    }
  }

  if (entries.length <= maxCount) {
    return
  }

  // Sort oldest first
  entries.sort((entryA, entryB) => entryA.createdAt - entryB.createdAt)

  const toDelete = entries.slice(0, entries.length - maxCount)
  for (const entry of toDelete) {
    try {
      unlinkSync(entry.path)
    }
    catch {
      // Best-effort cleanup
    }
  }

  logInfo(`Pruned ${toDelete.length} old run log(s)`)
}
