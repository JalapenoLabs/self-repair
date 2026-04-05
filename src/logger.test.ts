// Copyright © 2026 self-repair contributors

import { afterEach, describe, expect, it, vi } from 'vitest'

import { logError, logInfo, logStep, logSuccess, logVerbose, logVerboseStream, logWarning } from './logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logInfo writes to console.log with the prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logInfo('test message')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toContain('self-repair')
    expect(spy.mock.calls[0]?.[0]).toContain('test message')
  })

  it('logSuccess writes to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logSuccess('great success')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toContain('great success')
  })

  it('logWarning writes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logWarning('heads up')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toContain('heads up')
  })

  it('logError writes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('something broke')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toContain('something broke')
  })

  it('logStep includes the step counter', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logStep(3, 7, 'Cloning repository...')
    expect(spy).toHaveBeenCalledOnce()
    const output = spy.mock.calls[0]?.[0] as string
    expect(output).toContain('3/7')
    expect(output).toContain('Cloning repository...')
  })
})

describe('verbose logging redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logVerbose redacts tokens in content', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logVerbose('test label', 'token: sk-ant-api03-abcdefghij1234567890')
    const contentCall = spy.mock.calls[1]?.[0] as string
    expect(contentCall).toContain('[REDACTED]')
    expect(contentCall).not.toContain('sk-ant')
  })

  it('logVerboseStream redacts tokens in content', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    logVerboseStream('key: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345')
    const output = spy.mock.calls[0]?.[0] as string
    expect(output).toContain('[REDACTED]')
    expect(output).not.toContain('ghp_')
  })
})
