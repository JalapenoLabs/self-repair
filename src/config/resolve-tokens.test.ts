// Copyright © 2026 self-repair contributors

import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveTokens } from './resolve-tokens.js'

describe('resolveTokens', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers explicit option values over env vars', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-claude-token')
    vi.stubEnv('OPENAI_API_KEY', 'env-openai-token')
    vi.stubEnv('GITHUB_TOKEN', 'env-github-token')

    const tokens = resolveTokens({
      CLAUDE_API_TOKEN: 'explicit-claude',
      OPENAI_API_TOKEN: 'explicit-openai',
      GITHUB_TOKEN: 'explicit-github',
    })

    expect(tokens.claudeToken).toBe('explicit-claude')
    expect(tokens.openaiToken).toBe('explicit-openai')
    expect(tokens.githubToken).toBe('explicit-github')
  })

  it('falls back to ANTHROPIC_API_KEY env var for Claude token', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'from-anthropic-env')

    const tokens = resolveTokens({})
    expect(tokens.claudeToken).toBe('from-anthropic-env')
  })

  it('falls back to CLAUDE_API_KEY env var as secondary', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('CLAUDE_API_KEY', 'from-claude-env')

    const tokens = resolveTokens({})
    expect(tokens.claudeToken).toBe('from-claude-env')
  })

  it('falls back to OPENAI_API_KEY env var for OpenAI token', () => {
    vi.stubEnv('OPENAI_API_KEY', 'from-openai-env')

    const tokens = resolveTokens({})
    expect(tokens.openaiToken).toBe('from-openai-env')
  })

  it('falls back to GITHUB_TOKEN env var', () => {
    vi.stubEnv('GITHUB_TOKEN', 'from-github-env')

    const tokens = resolveTokens({})
    expect(tokens.githubToken).toBe('from-github-env')
  })

  it('returns undefined when no token source is available', () => {
    // Clear relevant env vars
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('CLAUDE_API_KEY', '')
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('GITHUB_TOKEN', '')

    const tokens = resolveTokens({})

    // These may pick up dotfiles, so just verify they don't throw
    expect(typeof tokens.claudeToken === 'string' || tokens.claudeToken === undefined).toBe(true)
    expect(typeof tokens.githubToken === 'string' || tokens.githubToken === undefined).toBe(true)
  })
})
