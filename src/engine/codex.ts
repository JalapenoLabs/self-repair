// Copyright © 2026 self-repair contributors

import type { EngineContract, EngineInvokeOptions, EngineResult } from './types'

import { Codex } from '@openai/codex-sdk'

import { logInfo, logVerbose, logVerboseStream } from '../logger'

/**
 * Creates an engine that invokes OpenAI Codex via the official SDK.
 * The SDK wraps the Codex CLI, exchanging JSONL events over stdin/stdout.
 */
export function createCodexEngine(apiToken?: string): EngineContract {
  async function invoke(options: EngineInvokeOptions): Promise<EngineResult> {
    logInfo(`Invoking Codex engine in ${options.workingDirectory}`)

    if (options.verbose) {
      const promptLength = options.prompt.length
      const lineCount = options.prompt.split('\n').length
      logVerbose(
        'Prompt sent to Codex:',
        `${lineCount} lines, ${promptLength} chars`,
      )
    }

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

      // In verbose mode, use streaming to show real-time output
      if (options.verbose) {
        const { events } = await thread.runStreamed(options.prompt)
        const outputChunks: string[] = []

        for await (const event of events) {
          if (event.type === 'item.completed' && 'item' in event) {
            const item = event.item as { type: string, text?: string }
            if (item.text) {
              outputChunks.push(item.text)
              logVerboseStream(item.text + '\n')
            }
          }
          else if (event.type === 'turn.completed' && 'usage' in event) {
            if (options.verbose) {
              logVerbose('Codex turn completed', JSON.stringify(event.usage, null, 2))
            }
          }
        }

        const finalOutput = outputChunks.join('\n')
        if (options.verbose) {
          logVerbose('Codex final output:', finalOutput)
        }

        return {
          success: true,
          output: finalOutput,
          exitCode: 0,
        }
      }

      // Non-verbose: use simple run()
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
