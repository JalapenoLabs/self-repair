// Copyright © 2026 self-repair contributors

import type { ChildProcess } from 'node:child_process'
import type { ChildWorkerPayload, ResolvedOptions, RepairTrigger } from '../types.js'

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CHILD_PAYLOAD_ENV_KEY } from '../constants.js'
import { logInfo } from '../logger.js'
import { resolveSkillsSourcePath } from '../skills/inject.js'

/**
 * Resolves the absolute path to the child-worker script.
 * In production this points to `dist/child-worker.js`.
 */
function resolveChildWorkerPath(): string {
  const currentFileDir = dirname(fileURLToPath(import.meta.url))
  return resolve(currentFileDir, 'child-worker.js')
}

/**
 * Spawns a fully detached child process to execute the repair pipeline.
 * The parent process can safely exit or restart without affecting the child.
 *
 * The payload (options + trigger) is passed via the `SELF_REPAIR_PAYLOAD`
 * environment variable to avoid command-line length limits and special
 * character escaping issues.
 */
export function spawnChildProcess(
  options: ResolvedOptions,
  trigger: RepairTrigger,
): ChildProcess {
  const payload: ChildWorkerPayload = {
    options,
    trigger: {
      error: trigger.error,
      stack: trigger.stack,
      timestamp: trigger.timestamp ?? Date.now(),
    },
    skillsSourcePath: resolveSkillsSourcePath(),
  }

  const childWorkerPath = resolveChildWorkerPath()
  logInfo(`Spawning repair process: ${childWorkerPath}`)

  const child = spawn(
    process.execPath,
    [ childWorkerPath ],
    {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        [CHILD_PAYLOAD_ENV_KEY]: JSON.stringify(payload),
      },
    },
  )

  // Allow the parent to exit without waiting for the child
  child.unref()

  return child
}
