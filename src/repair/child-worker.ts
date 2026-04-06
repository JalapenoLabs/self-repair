// Copyright © 2026 self-repair contributors

//
// This script runs in a detached child process. It reads the repair
// payload from a temporary file (path passed via env var), deletes the
// file immediately to minimize token exposure, then executes the pipeline.

import type { ChildWorkerPayload } from '../types'

import { readFileSync, unlinkSync } from 'node:fs'

import { CHILD_PAYLOAD_ENV_KEY } from '../constants'
import { logError, logInfo } from '../logger'
import { executeRepairPipeline } from './pipeline'

async function main(): Promise<void> {
  const payloadPath = process.env[CHILD_PAYLOAD_ENV_KEY]
  if (!payloadPath) {
    logError(`Missing ${CHILD_PAYLOAD_ENV_KEY} environment variable. Cannot proceed.`)
    process.exit(1)
  }

  // Read and immediately delete the payload file to minimize the
  // window where tokens are on disk.
  let rawPayload: string
  try {
    rawPayload = readFileSync(payloadPath, 'utf-8')
    unlinkSync(payloadPath)
  }
  catch (error) {
    logError(`Failed to read payload file at ${payloadPath}: ${error}`)
    process.exit(1)
  }

  let payload: ChildWorkerPayload
  try {
    payload = JSON.parse(rawPayload) as ChildWorkerPayload
  }
  catch (error) {
    logError(`Failed to parse repair payload: ${error}`)
    process.exit(1)
  }

  logInfo(
    `Child worker started for repo: ${payload.options.repo ?? 'unknown'} `
    + `(engine: ${payload.options.engine})`,
  )

  await executeRepairPipeline(payload)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logError(`Unhandled error in child worker: ${error}`)
    process.exit(1)
  })
