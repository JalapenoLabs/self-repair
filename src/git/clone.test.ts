// Copyright © 2026 self-repair contributors

import { execFile } from 'node:child_process'

import { describe, expect, it, vi } from 'vitest'

import { cloneRepository } from './clone'

vi.mock('../logger', () => ({
  logInfo: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

function mockSuccess() {
  vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, cb: any) => {
    cb(null, '', '')
    return {} as any
  })
}

describe('cloneRepository', () => {
  it('uses a token-authenticated URL when a token is provided', async () => {
    mockSuccess()
    await cloneRepository('owner/repo', '/tmp/target', 'tok123')
    const [ , args ] = vi.mocked(execFile).mock.calls[0] as any
    expect((args as string[]).join(' ')).toContain('x-access-token:tok123@github.com/owner/repo.git')
  })

  it('uses a public URL when no token is provided', async () => {
    mockSuccess()
    await cloneRepository('owner/repo', '/tmp/target')
    const [ , args ] = vi.mocked(execFile).mock.calls[0] as any
    const joined = (args as string[]).join(' ')
    expect(joined).toContain('https://github.com/owner/repo.git')
    expect(joined).not.toContain('x-access-token')
  })

  it('passes --depth=1 for a shallow clone', async () => {
    mockSuccess()
    await cloneRepository('owner/repo', '/tmp/target')
    const [ , args ] = vi.mocked(execFile).mock.calls[0] as any
    expect(args as string[]).toContain('--depth=1')
  })

  it('passes the target directory as the last argument', async () => {
    mockSuccess()
    await cloneRepository('owner/repo', '/my/specific/dir')
    const [ , args ] = vi.mocked(execFile).mock.calls[0] as any
    expect((args as string[]).at(-1)).toBe('/my/specific/dir')
  })

  it('throws when git exits with an error', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, cb: any) => {
      cb(new Error('fatal: repository not found'))
      return {} as any
    })
    await expect(cloneRepository('owner/repo', '/tmp/target')).rejects.toThrow(
      'repository not found',
    )
  })
})
