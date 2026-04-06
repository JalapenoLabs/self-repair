// Copyright © 2026 self-repair contributors

import type { ChildProcess } from 'node:child_process'
import type { ChildWorkerPayload, ResolvedOptions, RepairTrigger } from '../types'

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

import { CHILD_PAYLOAD_ENV_KEY } from '../constants'
import { logInfo } from '../logger'
import { resolveSkillsSourcePath } from '../skills/inject'

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
 * The payload is written to a temporary file and the file path is passed
 * via the `SELF_REPAIR_PAYLOAD` environment variable. The child reads the
 * file and immediately deletes it, minimizing the window where tokens are
 * on disk. This avoids exposing tokens in /proc/<pid>/environ on Linux.
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

  // Write the payload to a temp file instead of passing it as an env var.
  // This prevents tokens from being visible in /proc/<pid>/environ.
  const payloadDir = join(tmpdir(), 'self-repair-payloads')
  mkdirSync(payloadDir, { recursive: true })
  const payloadFile = join(payloadDir, `payload-${randomBytes(8).toString('hex')}.json`)
  writeFileSync(payloadFile, JSON.stringify(payload), { mode: 0o600 })

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
        [CHILD_PAYLOAD_ENV_KEY]: payloadFile,
      },
    },
  )

  // Allow the parent to exit without waiting for the child
  child.unref()

  return child
}
