// Copyright © 2026 self-repair contributors

import type { RunLog } from './types'

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import { SELF_REPAIR_HOME_DIR, SELF_REPAIR_LOGS_DIR } from '../constants'
import { logError, logInfo } from '../logger'

/**
 * Returns the absolute path to the self-repair logs directory (~/.self-repair/logs/).
 * Creates the directory if it doesn't exist.
 */
export function getLogsDirectory(): string {
  const logsDir = join(homedir(), SELF_REPAIR_HOME_DIR, SELF_REPAIR_LOGS_DIR)
  mkdirSync(logsDir, { recursive: true })
  return logsDir
}

/**
 * Writes a completed run log to disk as a JSON file.
 * Filename format: `<timestamp>-<errorHash>.json`
 */
export function writeRunLog(runLog: RunLog): string | null {
  try {
    const logsDir = getLogsDirectory()
    const timestamp = runLog.startedAt.replace(/[:.]/g, '-')
    const filename = `${timestamp}-${runLog.errorHash}.json`
    const filePath = join(logsDir, filename)

    const content = JSON.stringify(runLog, null, 2)
    writeFileSync(filePath, content, 'utf-8')

    logInfo(`Run log written to ${filePath}`)
    return filePath
  }
  catch (error) {
    logError(`Failed to write run log: ${error}`)
    return null
  }
}
