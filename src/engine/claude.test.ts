// Copyright © 2026 self-repair contributors

import { query } from '@anthropic-ai/claude-agent-sdk'

import { describe, expect, it, vi } from 'vitest'

import { createClaudeEngine } from './claude.js'

vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logVerbose: vi.fn(),
  logVerboseStream: vi.fn(),
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

function makeSession(messages: object[]) {
  async function* gen() {
    for (const msg of messages) {
      yield msg
    }
  }
  // Cast to satisfy the Query interface while only using the AsyncGenerator portion
  return gen() as ReturnType<typeof query>
}

describe('createClaudeEngine', () => {
  it('has name "claude"', () => {
    const engine = createClaudeEngine()
    expect(engine.name).toBe('claude')
  })

  it('returns success with collected assistant text and final result', async () => {
    vi.mocked(query).mockReturnValue(
      makeSession([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Analysis complete.' }]},
        },
        { type: 'result', subtype: 'success', result: '{"title":"Bug"}' },
      ]),
    )

    const engine = createClaudeEngine('test-token')
    const result = await engine.invoke({ workingDirectory: '/tmp/repo', prompt: 'Analyze' })

    expect(result.success).toBe(true)
    expect(result.output).toContain('Analysis complete.')
    expect(result.output).toContain('{"title":"Bug"}')
    expect(result.exitCode).toBe(0)
  })

  it('accumulates text from multiple assistant messages', async () => {
    vi.mocked(query).mockReturnValue(
      makeSession([
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Part 1 ' }]}},
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Part 2' }]}},
        { type: 'result', subtype: 'success', result: '' },
      ]),
    )

    const engine = createClaudeEngine()
    const result = await engine.invoke({ workingDirectory: '/tmp', prompt: 'p' })

    expect(result.output).toContain('Part 1')
    expect(result.output).toContain('Part 2')
  })

  it('ignores non-text content blocks (tool_use, etc.)', async () => {
    vi.mocked(query).mockReturnValue(
      makeSession([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'read_file', input: {}},
              { type: 'text', text: 'Only this' },
            ],
          },
        },
        { type: 'result', subtype: 'success', result: '' },
      ]),
    )

    const engine = createClaudeEngine()
    const result = await engine.invoke({ workingDirectory: '/tmp', prompt: 'p' })

    expect(result.output).toContain('Only this')
    expect(result.output).not.toContain('read_file')
  })

  it('returns success: false with error message when the SDK throws', async () => {
    vi.mocked(query).mockImplementation(() => {
      throw new Error('API key invalid')
    })

    const engine = createClaudeEngine()
    const result = await engine.invoke({ workingDirectory: '/tmp', prompt: 'test' })

    expect(result.success).toBe(false)
    expect(result.output).toContain('API key invalid')
    expect(result.exitCode).toBe(1)
  })

  it('includes partial output collected before the error', async () => {
    vi.mocked(query).mockReturnValue(
      (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Started...' }]}}
        throw new Error('Connection dropped')
      })() as ReturnType<typeof query>,
    )

    const engine = createClaudeEngine()
    const result = await engine.invoke({ workingDirectory: '/tmp', prompt: 'test' })

    expect(result.success).toBe(false)
    expect(result.output).toContain('Started...')
    expect(result.output).toContain('Connection dropped')
  })
})
