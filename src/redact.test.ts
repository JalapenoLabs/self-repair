// Copyright © 2026 self-repair contributors

import { afterEach, describe, expect, it } from 'vitest'

import { initRedaction, redact, resetRedaction } from './redact'
import type { ResolvedOptions } from './types'

/** Builds a minimal ResolvedOptions with only the fields redaction cares about. */
function makeOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    runInProduction: false,
    engine: 'claude',
    issueTracker: 'github',
    maxParallelRepairs: 3,
    maxLogCount: 50,
    verbose: false,
    ...overrides,
  }
}

describe('redact — pattern-based', () => {
  it('masks Anthropic API keys', () => {
    const input = 'Token: sk-ant-api03-abcdefghij1234567890'
    expect(redact(input)).toBe('Token: [REDACTED]')
  })

  it('masks OpenAI API keys', () => {
    const input = 'key=sk-proj-abcdefghijklmnopqrstuvwx'
    expect(redact(input)).toBe('key=[REDACTED]')
  })

  it('masks GitHub tokens', () => {
    const input = 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345'
    expect(redact(input)).toBe('[REDACTED]')
  })

  it('masks Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature'
    expect(redact(input)).toBe('Authorization: [REDACTED]')
  })

  it('masks Atlassian API tokens', () => {
    const input = 'ATATTaBcDeFgHiJkLmNoPqRsTuVwXyZ0123'
    expect(redact(input)).toBe('[REDACTED]')
  })

  it('leaves normal text untouched', () => {
    const input = 'Cloning repository into /tmp/self-repair-abc123/repo'
    expect(redact(input)).toBe(input)
  })

  it('masks multiple tokens in the same string', () => {
    const input = 'claude=sk-ant-api03-abcdefghij1234567890 github=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345'
    const result = redact(input)
    expect(result).not.toContain('sk-ant')
    expect(result).not.toContain('ghp_')
    expect(result).toBe('claude=[REDACTED] github=[REDACTED]')
  })
})

describe('redact — exact-value matching', () => {
  afterEach(() => {
    resetRedaction()
  })

  it('redacts the exact claudeToken value', () => {
    initRedaction(makeOptions({ claudeToken: 'my-custom-claude-key-abc' }))
    expect(redact('using token my-custom-claude-key-abc here')).toBe(
      'using token [REDACTED] here',
    )
  })

  it('redacts the exact githubToken value', () => {
    initRedaction(makeOptions({ githubToken: 'some-github-token-value-12345' }))
    expect(redact('auth: some-github-token-value-12345')).toBe('auth: [REDACTED]')
  })

  it('redacts the exact jiraApiToken value', () => {
    initRedaction(makeOptions({ jiraApiToken: 'jira-secret-token-xyz' }))
    expect(redact('header jira-secret-token-xyz end')).toBe('header [REDACTED] end')
  })

  it('redacts multiple exact tokens in one string', () => {
    initRedaction(makeOptions({
      claudeToken: 'claude-secret-abc',
      openaiToken: 'openai-secret-xyz',
    }))
    const input = 'claude=claude-secret-abc openai=openai-secret-xyz'
    expect(redact(input)).toBe('claude=[REDACTED] openai=[REDACTED]')
  })

  it('ignores tokens shorter than 8 characters', () => {
    initRedaction(makeOptions({ claudeToken: 'short' }))
    expect(redact('token is short here')).toBe('token is short here')
  })

  it('handles undefined tokens gracefully', () => {
    initRedaction(makeOptions({ claudeToken: undefined, githubToken: undefined }))
    expect(redact('nothing to redact')).toBe('nothing to redact')
  })

  it('exact match takes priority over pattern match', () => {
    const fakeKey = 'sk-ant-api03-my-real-secret-key-123'
    initRedaction(makeOptions({ claudeToken: fakeKey }))
    const result = redact(`key=${fakeKey}`)
    expect(result).toBe('key=[REDACTED]')
    expect(result).not.toContain('sk-ant')
  })
})
