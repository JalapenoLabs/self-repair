// Copyright © 2026 self-repair contributors

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import type { SelfRepairOptions } from '../types'

type ResolvedTokens = {
  claudeToken?: string
  openaiToken?: string
  githubToken?: string
}

/**
 * Reads a JSON config file and extracts a key, returning undefined on any failure.
 */
function readDotfileToken(directory: string, filename: string, key: string): string | undefined {
  try {
    const filePath = join(homedir(), directory, filename)
    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    const value = content?.[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
    return undefined
  }
  catch {
    return undefined
  }
}

/**
 * Resolves API tokens using a three-tier fallback chain:
 * 1. Explicit value from options
 * 2. Environment variable
 * 3. Dotfile in the user's home directory (~/.claude or ~/.codex)
 */
export function resolveTokens(options: SelfRepairOptions): ResolvedTokens {
  const claudeToken = options.CLAUDE_API_TOKEN
    || process.env.ANTHROPIC_API_KEY
    || process.env.CLAUDE_API_KEY
    || readDotfileToken('.claude', 'credentials.json', 'apiKey')

  const openaiToken = options.OPENAI_API_TOKEN
    || process.env.OPENAI_API_KEY
    || readDotfileToken('.codex', 'credentials.json', 'apiKey')

  const githubToken = options.GITHUB_TOKEN
    || process.env.GITHUB_TOKEN

  return { claudeToken, openaiToken, githubToken }
}
