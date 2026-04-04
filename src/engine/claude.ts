// Copyright © 2026 self-repair contributors

import type { EngineContract, EngineInvokeOptions, EngineResult } from './types.js'

import { query } from '@anthropic-ai/claude-agent-sdk'

import { ENGINE_MAX_TURNS } from '../constants.js'
import { logInfo } from '../logger.js'

/**
 * Creates an engine that invokes Claude Code via the official Agent SDK.
 * The SDK spawns a Claude Code process under the hood, giving the agent
 * full access to read, edit, and run commands in the working directory.
 */
export function createClaudeEngine(apiToken?: string): EngineContract {
  async function invoke(options: EngineInvokeOptions): Promise<EngineResult> {
    logInfo(`Invoking Claude engine in ${options.workingDirectory}`)

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
          const textBlocks = message.message.content.filter(
            (block: { type: string }) => block.type === 'text',
          )
          for (const block of textBlocks) {
            if ('text' in block) {
              outputChunks.push(block.text as string)
            }
          }
        }

        // Capture the final result
        if (message.type === 'result') {
          if (message.subtype === 'success') {
            outputChunks.push(message.result)
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
