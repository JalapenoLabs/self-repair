// Copyright © 2026 self-repair contributors

import type { EngineContract, EngineInvokeOptions, EngineResult } from './types'

import { query } from '@anthropic-ai/claude-agent-sdk'

import { ENGINE_MAX_TURNS } from '../constants'
import { logInfo, logVerbose, logVerboseStream } from '../logger'

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
export function createClaudeEngine(apiToken?: string): EngineContract {
  async function invoke(options: EngineInvokeOptions): Promise<EngineResult> {
    logInfo(`Invoking Claude engine in ${options.workingDirectory}`)

    if (options.verbose) {
      logVerbose('Prompt sent to Claude:', options.prompt)
    }

    const outputChunks: string[] = []

    try {
      const session = query({
        prompt: options.prompt,
        options: {
          cwd: options.workingDirectory,
          maxTurns: ENGINE_MAX_TURNS,
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

        // Log tool result summaries in verbose mode.
        // These are the "what did the tool actually do" messages from the SDK.
        if (options.verbose && message.type === 'tool_use_summary') {
          const summary = (message as { summary?: string }).summary
          if (summary) {
            logVerboseStream(`[tool result] ${truncate(summary, 500)}\n`)
          }
        }

        // Capture the final result
        if (message.type === 'result') {
          if (message.subtype === 'success') {
            outputChunks.push(message.result)
            if (options.verbose) {
              logVerbose('Claude final result:', message.result)
            }
          }
        }
      }

      return {
        success: true,
        output: outputChunks.join('\n'),
        exitCode: 0,
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)

      return {
        success: false,
        output: `Claude engine error: ${errorMessage}\n${outputChunks.join('\n')}`,
        exitCode: 1,
      }
    }
  }

  return { name: 'claude', invoke }
}
