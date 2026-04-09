// Copyright © 2026 self-repair contributors

import type { EngineContract, EngineInvokeOptions, EngineResult, EngineUsageStats } from './types'

import { Codex } from '@openai/codex-sdk'

import { logInfo, logUsage, logVerbose, logVerboseStream } from '../logger'

/**
 * Creates an engine that invokes OpenAI Codex via the official SDK.
 * The SDK wraps the Codex CLI, exchanging JSONL events over stdin/stdout.
 */
export function createCodexEngine(apiToken?: string, model?: string): EngineContract {
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
        ...(model ? { model } : {}),
      })

      // In verbose mode, use streaming to show real-time output
      if (options.verbose) {
        const { events } = await thread.runStreamed(options.prompt)
        const outputChunks: string[] = []
        let usageStats: EngineUsageStats = {}

        for await (const event of events) {
          if (event.type === 'item.completed' && 'item' in event) {
            const item = event.item as { type: string, text?: string }
            if (item.text) {
              outputChunks.push(item.text)
              logVerboseStream(item.text + '\n')
            }
          }
          else if (event.type === 'turn.completed' && 'usage' in event) {
            const turnUsage = event.usage as {
              input_tokens: number
              cached_input_tokens: number
              output_tokens: number
            } | null
            if (turnUsage) {
              usageStats = {
                inputTokens: turnUsage.input_tokens,
                outputTokens: turnUsage.output_tokens,
                cacheReadTokens: turnUsage.cached_input_tokens,
              }
            }
          }
        }

        const finalOutput = outputChunks.join('\n')
        logUsage('codex', usageStats)
        return {
          success: true,
          output: finalOutput,
          exitCode: 0,
          usage: usageStats,
        }
      }

      // Non-verbose: use simple run()
      const result = await thread.run(options.prompt)
      const usageStats: EngineUsageStats = result.usage
        ? {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          cacheReadTokens: result.usage.cached_input_tokens,
        }
        : {}

      logUsage('codex', usageStats)
      return {
        success: true,
        output: result.finalResponse,
        exitCode: 0,
        usage: usageStats,
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
