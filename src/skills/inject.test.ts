// Copyright © 2026 self-repair contributors

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { injectSkills } from './inject.js'

// Suppress chalk logging during tests
vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
}))

let testTargetDir: string
let testSkillsSource: string

describe('injectSkills', () => {
  beforeEach(() => {
    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
    const base = join(tmpdir(), `self-repair-test-${suffix}`)
    testTargetDir = join(base, 'repo')
    testSkillsSource = join(base, 'skills-source')

    mkdirSync(testTargetDir, { recursive: true })
    mkdirSync(join(testSkillsSource, 'bug-report'), { recursive: true })
    mkdirSync(join(testSkillsSource, 'repair'), { recursive: true })

    writeFileSync(join(testSkillsSource, 'bug-report', 'SKILL.md'), '# Bug Report')
    writeFileSync(join(testSkillsSource, 'repair', 'SKILL.md'), '# Repair')
  })

  afterEach(() => {
    try {
      const { rmSync } = require('node:fs')
      rmSync(join(testTargetDir, '..'), { recursive: true, force: true })
    }
    catch {
      // Ignore cleanup failures
    }
  })

  it('copies skills into the target repo .claude/skills/ directory', () => {
    const result = injectSkills(testTargetDir, testSkillsSource)

    expect(existsSync(join(result, 'bug-report', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(result, 'repair', 'SKILL.md'))).toBe(true)
  })

  it('creates the .claude/skills/ directory if it does not exist', () => {
    const targetSkillsDir = join(testTargetDir, '.claude', 'skills')
    expect(existsSync(targetSkillsDir)).toBe(false)

    injectSkills(testTargetDir, testSkillsSource)

    expect(existsSync(targetSkillsDir)).toBe(true)
  })

  it('throws if the skills source does not exist', () => {
    expect(() => injectSkills(testTargetDir, '/nonexistent/path')).toThrow(
      'Skills source directory not found',
    )
  })
})
