// Copyright © 2026 self-repair contributors

import type { EngineContract, EngineInvokeOptions, EngineResult, EngineUsageStats } from './types'

import { query } from '@anthropic-ai/claude-agent-sdk'

import { logError, logInfo, logUsage, logVerbose, logVerboseStream, logWarning } from '../logger'

/**
 * Truncates a string for display in verbose logs.
 */
function truncate(text: string, maxLength = 200): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength) + '...'
}

/**
 * Creates an engine that invokes Claude Code via the official Agent SDK.
 * The SDK spawns a Claude Code process under the hood, giving the agent
 * full access to read, edit, and run commands in the working directory.
 */
export function createClaudeEngine(apiToken?: string, model?: string): EngineContract {
  async function invoke(options: EngineInvokeOptions): Promise<EngineResult> {
    logInfo(`Invoking Claude engine in ${options.workingDirectory}`)

    if (options.verbose) {
      const promptLength = options.prompt.length
      const lineCount = options.prompt.split('\n').length
      logVerbose(
        'Prompt sent to Claude:',
        `${lineCount} lines, ${promptLength} chars`,
      )
    }

    const outputChunks: string[] = []
    let usageStats: EngineUsageStats = {}

    try {
      const session = query({
        prompt: options.prompt,
        ...(model ? { model } : {}),
        options: {
          cwd: options.workingDirectory,
          maxTurns: options.maxTurns,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          env: {
            ...process.env,
            ...(apiToken ? { ANTHROPIC_API_KEY: apiToken } : {}),
          },
        },
      })

      for await (const message of session) {
        // Capture assistant text output for the run log
        if (message.type === 'assistant' && typeof message.message === 'object') {
          for (const block of message.message.content) {
            if (block.type === 'text' && 'text' in block) {
              const text = block.text as string
              outputChunks.push(text)
              if (options.verbose) {
                logVerboseStream(text + '\n')
              }
            }

            // Log tool invocations with their input in verbose mode
            if (options.verbose && block.type === 'tool_use' && 'name' in block) {
              const inputStr = 'input' in block
                ? truncate(JSON.stringify(block.input))
                : ''
              logVerboseStream(`[tool: ${block.name}] ${inputStr}\n`)
            }
          }
        }

        // Log tool result summaries in verbose mode
        if (options.verbose && message.type === 'tool_use_summary') {
          const summary = (message as { summary?: string }).summary
          if (summary) {
            logVerboseStream(`[tool result] ${truncate(summary, 500)}\n`)
          }
        }

        // Capture the final result and usage stats
        if (message.type === 'result') {
          const resultMessage = message as {
            subtype: string
            result?: string
            num_turns?: number
            total_cost_usd?: number
            terminal_reason?: string
            usage?: {
              input_tokens: number
              output_tokens: number
              cache_creation_input_tokens: number
              cache_read_input_tokens: number
            }
          }

          // Extract usage stats (always, regardless of verbose)
          usageStats = {
            numTurns: resultMessage.num_turns,
            totalCostUsd: resultMessage.total_cost_usd,
            inputTokens: resultMessage.usage?.input_tokens,
            outputTokens: resultMessage.usage?.output_tokens,
            cacheReadTokens: resultMessage.usage?.cache_read_input_tokens,
            cacheWriteTokens: resultMessage.usage?.cache_creation_input_tokens,
          }

          if (resultMessage.subtype === 'success') {
            if (resultMessage.result) {
              outputChunks.push(resultMessage.result)
            }
            if (options.verbose) {
              logVerbose('Claude final result:', resultMessage.result ?? '')
            }
          }

          // Detect max turns hit
          if (
            resultMessage.subtype === 'error_max_turns'
            || resultMessage.terminal_reason === 'max_turns'
          ) {
            const turns = resultMessage.num_turns ?? options.maxTurns
            logError(
              `Claude hit the maximum turn limit (${turns}/${options.maxTurns}). `
              + 'The agent ran out of steps before completing its task. '
              + 'This usually means it got distracted or the task is too complex.',
            )
            logUsage('claude', usageStats)
            return {
              success: false,
              output: `Max turns reached (${turns}/${options.maxTurns}). `
                + `Partial output:\n${outputChunks.join('\n')}`,
              exitCode: 1,
              usage: usageStats,
            }
          }

          if (resultMessage.subtype.startsWith('error_')) {
            logWarning(`Claude returned error result: ${resultMessage.subtype}`)
          }
        }
      }

      logUsage('claude', usageStats)
      return {
        success: true,
        output: outputChunks.join('\n'),
        exitCode: 0,
        usage: usageStats,
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)

      logUsage('claude', usageStats)
      return {
        success: false,
        output: `Claude engine error: ${errorMessage}\n${outputChunks.join('\n')}`,
        exitCode: 1,
        usage: usageStats,
      }
    }
  }

  return { name: 'claude', invoke }
}
