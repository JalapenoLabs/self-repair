// Copyright © 2026 self-repair contributors

//
// This script runs in a detached child process. It parses the repair
// payload from the environment and executes the full repair pipeline.

import type { ChildWorkerPayload } from '../types'

import { CHILD_PAYLOAD_ENV_KEY } from '../constants'
import { logError, logInfo } from '../logger'
import { executeRepairPipeline } from './pipeline'

async function main(): Promise<void> {
  const rawPayload = process.env[CHILD_PAYLOAD_ENV_KEY]
  if (!rawPayload) {
    logError(`Missing ${CHILD_PAYLOAD_ENV_KEY} environment variable. Cannot proceed.`)
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
