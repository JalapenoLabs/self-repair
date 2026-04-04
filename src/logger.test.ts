// Copyright © 2026 self-repair contributors

import { afterEach, describe, expect, it, vi } from 'vitest'

import { logError, logInfo, logStep, logSuccess, logWarning } from './logger.js'

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
