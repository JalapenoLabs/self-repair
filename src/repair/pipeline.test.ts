// Copyright © 2026 self-repair contributors

import type { BugReport, ChildWorkerPayload, MakePrSkillOutput, ResolvedOptions } from '../types.js'

import { readFileSync } from 'node:fs'

import { dir as createTmpDir } from 'tmp-promise'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cloneRepository } from '../git/clone.js'
import { createEngine } from '../engine/factory.js'
import { createIssueTracker } from '../issue-tracker/factory.js'
import { createGitHubPullRequest } from '../pull-request/github.js'
import { pruneRunLogs } from '../run-log/pruner.js'
import { writeRunLog } from '../run-log/writer.js'
import { injectSkills } from '../skills/inject.js'
import { computeErrorHash } from './deduplication.js'
import { executeRepairPipeline } from './pipeline.js'

vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
}))

vi.mock('tmp-promise', () => ({ dir: vi.fn() }))
vi.mock('../git/clone.js', () => ({ cloneRepository: vi.fn() }))
vi.mock('../skills/inject.js', () => ({ injectSkills: vi.fn() }))
vi.mock('../engine/factory.js', () => ({ createEngine: vi.fn() }))
vi.mock('../issue-tracker/factory.js', () => ({ createIssueTracker: vi.fn() }))
vi.mock('../pull-request/github.js', () => ({ createGitHubPullRequest: vi.fn() }))
vi.mock('../run-log/writer.js', () => ({ writeRunLog: vi.fn() }))
vi.mock('../run-log/pruner.js', () => ({ pruneRunLogs: vi.fn() }))
vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))
vi.mock('./deduplication.js', () => ({
  computeErrorHash: vi.fn(),
}))

// ─── Shared mock state ────────────────────────────────────────────────────────

const mockCleanup = vi.fn().mockResolvedValue(undefined)
const mockInvoke = vi.fn()
const mockFindExistingIssue = vi.fn()
const mockCreateIssue = vi.fn()

const mockEngine = { name: 'claude' as const, invoke: mockInvoke }
const mockTracker = {
  kind: 'github' as const,
  validatePermissions: vi.fn(),
  findExistingIssue: mockFindExistingIssue,
  createIssue: mockCreateIssue,
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const bugReport: BugReport = {
  title: 'Null crash in auth',
  description: 'App crashes on login',
  severity: 'high',
  complexity: 'simple',
  affectedFiles: [ 'src/auth.ts' ],
  reproductionSteps: '1. Log in',
}

const prInfo: MakePrSkillOutput = {
  branch: 'fix/null-crash',
  commitMessage: 'Fix null crash in auth',
  prTitle: 'Fix: null crash in auth',
  prBody: 'Adds null check',
}

function buildOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    runInProduction: false,
    engine: 'claude',
    issueTracker: 'github',
    maxParallelRepairs: 3,
    maxLogCount: 50,
    verbose: false,
    repo: 'owner/repo',
    githubToken: 'ghp_test',
    claudeToken: 'claude-tok',
    ...overrides,
  }
}

function buildPayload(optionOverrides: Partial<ResolvedOptions> = {}): ChildWorkerPayload {
  return {
    options: buildOptions(optionOverrides),
    trigger: {
      error: 'TypeError: Cannot read properties of null',
      stack: 'at auth.ts:42:5',
      timestamp: 1_234_567_890,
    },
    skillsSourcePath: '/mocked/skills/source',
  }
}

// ─── Default mock setup ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(computeErrorHash).mockReturnValue('abc123def456789a')

  vi.mocked(createTmpDir).mockResolvedValue({
    path: '/tmp/fake-work',
    cleanup: mockCleanup,
    name: 'fake',
  } as any)
  vi.mocked(cloneRepository).mockResolvedValue(undefined)
  vi.mocked(injectSkills).mockReturnValue('/tmp/fake-work/repo/.claude/skills')
  vi.mocked(createEngine).mockReturnValue(mockEngine)
  vi.mocked(createIssueTracker).mockReturnValue(mockTracker)
  vi.mocked(readFileSync).mockReturnValue('# Skill content' as any)

  mockFindExistingIssue.mockResolvedValue(null)
  mockCreateIssue.mockResolvedValue({
    tracker: 'github',
    id: '42',
    url: 'https://github.com/owner/repo/issues/42',
  })
  vi.mocked(createGitHubPullRequest).mockResolvedValue({
    url: 'https://github.com/owner/repo/pull/1',
    number: 1,
  })

  // Default: 3 sequential successful invocations (bug-report, repair, make-pr)
  mockInvoke
    .mockResolvedValueOnce({ success: true, output: JSON.stringify(bugReport), exitCode: 0 })
    .mockResolvedValueOnce({ success: true, output: 'Changes applied', exitCode: 0 })
    .mockResolvedValueOnce({ success: true, output: JSON.stringify(prInfo), exitCode: 0 })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('executeRepairPipeline', () => {
  describe('happy path', () => {
    it('clones the repository', async () => {
      await executeRepairPipeline(buildPayload())
      expect(cloneRepository).toHaveBeenCalledWith('owner/repo', expect.any(String), 'ghp_test')
    })

    it('creates a new GitHub issue when none exists', async () => {
      await executeRepairPipeline(buildPayload())
      expect(mockCreateIssue).toHaveBeenCalledWith(bugReport, expect.any(String))
    })

    it('creates a GitHub PR after a successful repair', async () => {
      await executeRepairPipeline(buildPayload())
      expect(createGitHubPullRequest).toHaveBeenCalledWith(
        'ghp_test',
        'owner/repo',
        expect.objectContaining({ head: prInfo.branch, title: `Self repair: ${prInfo.prTitle}` }),
      )
    })

    it('records outcome as success in the run log', async () => {
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'success' }),
      )
    })

    it('includes the issue URL in the run log', async () => {
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ issueUrl: 'https://github.com/owner/repo/issues/42' }),
      )
    })
  })

  describe('existing issue', () => {
    it('skips issue creation when an existing issue is found', async () => {
      mockFindExistingIssue.mockResolvedValue({
        tracker: 'github',
        id: '7',
        url: 'https://github.com/owner/repo/issues/7',
      })
      await executeRepairPipeline(buildPayload())
      expect(mockCreateIssue).not.toHaveBeenCalled()
    })
  })

  describe('complex bug', () => {
    it('skips automated repair for complex bugs', async () => {
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce({
        success: true,
        output: JSON.stringify({ ...bugReport, complexity: 'complex' }),
        exitCode: 0,
      })
      await executeRepairPipeline(buildPayload())
      expect(createGitHubPullRequest).not.toHaveBeenCalled()
    })

    it('records outcome as partial for complex bugs', async () => {
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce({
        success: true,
        output: JSON.stringify({ ...bugReport, complexity: 'complex' }),
        exitCode: 0,
      })
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'partial' }),
      )
    })
  })

  describe('bug report failures', () => {
    it('records outcome as failure when the bug-report engine call fails', async () => {
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce({ success: false, output: 'Engine error', exitCode: 1 })
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure' }),
      )
    })

    it('records outcome as failure when bug report JSON cannot be parsed', async () => {
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce({
        success: true,
        output: 'this is not valid json',
        exitCode: 0,
      })
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure' }),
      )
    })
  })

  describe('repair failures', () => {
    it('records outcome as partial when the repair engine call fails', async () => {
      mockInvoke.mockReset()
      mockInvoke
        .mockResolvedValueOnce({ success: true, output: JSON.stringify(bugReport), exitCode: 0 })
        .mockResolvedValueOnce({ success: false, output: 'Repair failed', exitCode: 1 })
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'partial' }),
      )
    })

    it('records outcome as partial when GitHub PR creation throws', async () => {
      vi.mocked(createGitHubPullRequest).mockRejectedValue(new Error('Unprocessable entity'))
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'partial' }),
      )
    })

    it('records outcome as partial when PR info is missing from engine output', async () => {
      mockInvoke.mockReset()
      mockInvoke
        .mockResolvedValueOnce({ success: true, output: JSON.stringify(bugReport), exitCode: 0 })
        .mockResolvedValueOnce({ success: true, output: 'Changes applied', exitCode: 0 })
        .mockResolvedValueOnce({ success: true, output: 'not parseable json', exitCode: 0 })
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'partial' }),
      )
    })
  })

  describe('pre-clone failures', () => {
    it('records outcome as failure when repo is missing from options', async () => {
      await executeRepairPipeline(buildPayload({ repo: undefined }))
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure' }),
      )
    })

    it('records outcome as failure when clone throws', async () => {
      vi.mocked(cloneRepository).mockRejectedValue(new Error('Clone failed'))
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure' }),
      )
    })
  })

  describe('cleanup', () => {
    it('always writes the run log even when the pipeline fails', async () => {
      vi.mocked(cloneRepository).mockRejectedValue(new Error('Network error'))
      await executeRepairPipeline(buildPayload())
      expect(writeRunLog).toHaveBeenCalled()
    })

    it('always cleans up the temp directory even on failure', async () => {
      vi.mocked(cloneRepository).mockRejectedValue(new Error('Network error'))
      await executeRepairPipeline(buildPayload())
      expect(mockCleanup).toHaveBeenCalled()
    })

    it('always prunes old run logs after completion', async () => {
      await executeRepairPipeline(buildPayload())
      expect(pruneRunLogs).toHaveBeenCalled()
    })
  })
})
