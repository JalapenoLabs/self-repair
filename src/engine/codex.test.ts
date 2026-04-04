// Copyright © 2026 self-repair contributors

import { Codex } from '@openai/codex-sdk'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCodexEngine } from './codex'

vi.mock('../logger', () => ({
  logInfo: vi.fn(),
  logVerbose: vi.fn(),
  logVerboseStream: vi.fn(),
}))

const mockRun = vi.fn()
const mockRunStreamed = vi.fn()
const mockStartThread = vi.fn()

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(),
}))

async function* makeEvents(events: object[]) {
  for (const e of events) {
    yield e
  }
}

describe('createCodexEngine', () => {
  beforeEach(() => {
    mockStartThread.mockReturnValue({ run: mockRun, runStreamed: mockRunStreamed })
    vi.mocked(Codex).mockImplementation(
      () => ({ startThread: mockStartThread }) as any,
    )
  })

  it('has name "codex"', () => {
    expect(createCodexEngine().name).toBe('codex')
  })

  it('uses thread.run() in non-verbose mode and returns finalResponse', async () => {
    mockRun.mockResolvedValue({ finalResponse: 'Codex analysis done' })

    const result = await createCodexEngine('api-key').invoke({
      workingDirectory: '/tmp/repo',
      prompt: 'Fix the bug',
      verbose: false,
    })

    expect(result.success).toBe(true)
    expect(result.output).toBe('Codex analysis done')
    expect(mockRun).toHaveBeenCalledWith('Fix the bug')
    expect(mockRunStreamed).not.toHaveBeenCalled()
  })

  it('uses thread.runStreamed() in verbose mode and accumulates text', async () => {
    mockRunStreamed.mockReturnValue({
      events: makeEvents([
        { type: 'item.completed', item: { type: 'text', text: 'Step 1' }},
        { type: 'item.completed', item: { type: 'text', text: ' Step 2' }},
        { type: 'turn.completed', usage: { tokens: 100 }},
      ]),
    })

    const result = await createCodexEngine('api-key').invoke({
      workingDirectory: '/tmp/repo',
      prompt: 'Fix',
      verbose: true,
    })

    expect(result.success).toBe(true)
    expect(result.output).toContain('Step 1')
    expect(result.output).toContain('Step 2')
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('returns success: false when the SDK throws', async () => {
    mockRun.mockRejectedValue(new Error('Connection refused'))

    const result = await createCodexEngine().invoke({
      workingDirectory: '/tmp',
      prompt: 'test',
      verbose: false,
    })

    expect(result.success).toBe(false)
    expect(result.output).toContain('Connection refused')
    expect(result.exitCode).toBe(1)
  })

  it('passes workingDirectory to startThread', async () => {
    mockRun.mockResolvedValue({ finalResponse: '' })

    await createCodexEngine().invoke({ workingDirectory: '/specific/dir', prompt: 'p' })

    expect(mockStartThread).toHaveBeenCalledWith(
      expect.objectContaining({ workingDirectory: '/specific/dir' }),
    )
  })
})
