// Copyright © 2026 self-repair contributors

import type { EngineContract, EngineInvokeOptions, EngineResult } from './types.js'

import { Codex } from '@openai/codex-sdk'

import { logInfo } from '../logger.js'

/**
 * Creates an engine that invokes OpenAI Codex via the official SDK.
 * The SDK wraps the Codex CLI, exchanging JSONL events over stdin/stdout.
 */
export function createCodexEngine(apiToken?: string): EngineContract {
  async function invoke(options: EngineInvokeOptions): Promise<EngineResult> {
    logInfo(`Invoking Codex engine in ${options.workingDirectory}`)

    try {
      const codex = new Codex({
        ...(apiToken ? { apiKey: apiToken } : {}),
      })

      const thread = codex.startThread({
        workingDirectory: options.workingDirectory,
        skipGitRepoCheck: true,
        approvalPolicy: 'never',
        sandboxMode: 'danger-full-access',
      })

      const result = await thread.run(options.prompt)

      return {
        success: true,
        output: result.finalResponse,
        exitCode: 0,
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)

      return {
        success: false,
        output: `Codex engine error: ${errorMessage}`,
        exitCode: 1,
      }
    }
  }

  return { name: 'codex', invoke }
}
