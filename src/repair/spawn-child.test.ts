// Copyright © 2026 self-repair contributors

import type { ResolvedOptions, RepairTrigger } from '../types'

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { CHILD_PAYLOAD_ENV_KEY } from '../constants'
import { spawnChildProcess } from './spawn-child'

vi.mock('../logger', () => ({
  logInfo: vi.fn(),
}))

vi.mock('../skills/inject', () => ({
  resolveSkillsSourcePath: vi.fn().mockReturnValue('/mocked/skills/path'),
}))

const mockUnref = vi.fn()
const mockChild = { unref: mockUnref, pid: 12345 }

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

function buildOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    runInProduction: false,
    engine: 'claude',
    issueTracker: 'github',
    maxParallelRepairs: 3,
    maxLogCount: 50,
    maxTurns: 50,
    verbose: false,
    repo: 'owner/repo',
    githubToken: 'ghp_test',
    claudeToken: 'claude-tok',
    ...overrides,
  }
}

const trigger: RepairTrigger = {
  error: 'TypeError: x is null',
  stack: 'at app.ts:10:5',
  timestamp: 1_234_567_890,
}

describe('spawnChildProcess', () => {
  it('spawns using process.execPath as the command', () => {
    vi.mocked(spawn).mockReturnValue(mockChild as any)
    spawnChildProcess(buildOptions(), trigger)
    const [ cmd ] = vi.mocked(spawn).mock.calls[0]!
    expect(cmd).toBe(process.execPath)
  })

  it('spawns in detached mode with stdio ignored', () => {
    vi.mocked(spawn).mockReturnValue(mockChild as any)
    spawnChildProcess(buildOptions(), trigger)
    const [ , , opts ] = vi.mocked(spawn).mock.calls[0]!
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore' })
  })

  it('calls unref() so the parent can exit independently', () => {
    vi.mocked(spawn).mockReturnValue(mockChild as any)
    spawnChildProcess(buildOptions(), trigger)
    expect(mockUnref).toHaveBeenCalled()
  })

  it('returns the spawned ChildProcess', () => {
    vi.mocked(spawn).mockReturnValue(mockChild as any)
    const child = spawnChildProcess(buildOptions(), trigger)
    expect(child).toBe(mockChild)
  })

  it('writes payload to a temp file and passes the path via env var', () => {
    vi.mocked(spawn).mockReturnValue(mockChild as any)
    const options = buildOptions({ repo: 'test/repo' })
    spawnChildProcess(options, trigger)

    const [ , , opts ] = vi.mocked(spawn).mock.calls[0]!
    const payloadPath = (opts as any).env[CHILD_PAYLOAD_ENV_KEY] as string

    // The env var should be a file path, not raw JSON
    expect(payloadPath).toMatch(/payload-[a-f0-9]+\.json$/)

    // The file should contain the serialized payload
    const payload = JSON.parse(readFileSync(payloadPath, 'utf-8'))
    expect(payload.options.repo).toBe('test/repo')
    expect(payload.trigger.error).toBe(trigger.error)
    expect(payload.trigger.stack).toBe(trigger.stack)
  })

  it('includes process.env in the child environment', () => {
    vi.mocked(spawn).mockReturnValue(mockChild as any)
    spawnChildProcess(buildOptions(), trigger)
    const [ , , opts ] = vi.mocked(spawn).mock.calls[0]!
    expect((opts as any).env).toMatchObject(process.env)
  })
})
