// Copyright © 2026 self-repair contributors

import { getResolvedOptions, isProductionGuarded } from '../config/options'
import { validateAllPermissions } from '../issue-tracker/permissions'
import { logError, logInfo, logWarning } from '../logger'
import { startSelfRepair } from '../repair/start'

let registered = false

/**
 * Registers global `uncaughtException` and `unhandledRejection` handlers
 * that automatically trigger self-repair when a fatal crash occurs.
 *
 * Returns a Promise that resolves once permission validation completes.
 * The Promise does NOT need to be awaited -- if not awaited, permissions
 * are validated in the background and a warning is logged on failure.
 * The crash handlers are registered immediately regardless.
 *
 * Throws synchronously if `setSelfRepairOptions` has not been called.
 */
export function registerCrashHandler(): Promise<void> {
  const options = getResolvedOptions()

  // Production guard
  if (isProductionGuarded()) {
    return Promise.resolve()
  }

  // Prevent double-registration
  if (registered) {
    logWarning('Crash handler already registered. Skipping duplicate registration.')
    return Promise.resolve()
  }

  // Register handlers immediately -- don't wait for async permission check
  process.on('uncaughtException', (error: Error) => {
    logError(`Uncaught exception detected: ${error.message}`)
    startSelfRepair({
      error: error.message,
      stack: error.stack,
      timestamp: Date.now(),
    })
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const errorMessage = reason instanceof Error
      ? reason.message
      : String(reason)
    const stack = reason instanceof Error
      ? reason.stack
      : undefined

    logError(`Unhandled rejection detected: ${errorMessage}`)
    startSelfRepair({
      error: errorMessage,
      stack,
      timestamp: Date.now(),
    })
  })

  registered = true
  logInfo('Crash handler registered.')

  // Validate permissions in the background
  const permissionCheck = validateAllPermissions(options)
    .then(() => {
      logInfo('Permission validation passed.')
    })
    .catch((error) => {
      logError(
        `Permission validation failed: ${error instanceof Error ? error.message : error}. `
        + 'Self-repair may not function correctly. '
        + 'Check your tokens and repository configuration.',
      )
    })

  return permissionCheck
}
