// Copyright © 2026 self-repair contributors

//
// End-to-end test for the full repair pipeline. Requires a real
// ANTHROPIC_API_KEY to invoke Claude. Skipped when the key is absent.
//
// Run with: yarn test:e2e
// Or:       ANTHROPIC_API_KEY=sk-... yarn test:e2e
//
// Note: verbose mode is enabled so Claude's thoughts and tool usage
// stream to stdout during the test. This is intentional -- when debugging
// a failing e2e test, you want to see exactly what Claude did.

import type { BugReport, ChildWorkerPayload, ResolvedOptions } from '../types.js'

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { resolveSkillsSourcePath } from '../skills/inject.js'
import { executeRepairPipeline } from './pipeline.js'

// ─── Mock GitHub operations, git clone, and run logging ─────────────────────
// Everything else (tmp dir, skill injection, Claude engine) runs for real.

const mockFindExistingIssue = vi.fn().mockResolvedValue(null)
const mockCreateIssue = vi.fn().mockResolvedValue({
  tracker: 'github',
  id: '99',
  url: 'https://github.com/test/buggy-app/issues/99',
})

vi.mock('../issue-tracker/factory.js', () => ({
  createIssueTracker: vi.fn(() => ({
    kind: 'github',
    validatePermissions: vi.fn().mockResolvedValue(undefined),
    findExistingIssue: mockFindExistingIssue,
    createIssue: mockCreateIssue,
  })),
}))

vi.mock('../pull-request/github.js', () => ({
  createGitHubPullRequest: vi.fn().mockResolvedValue({
    url: 'https://github.com/test/buggy-app/pull/1',
    number: 1,
  }),
}))

vi.mock('../run-log/writer.js', () => ({
  writeRunLog: vi.fn().mockReturnValue('/tmp/fake-log.json'),
}))

vi.mock('../run-log/pruner.js', () => ({
  pruneRunLogs: vi.fn(),
}))

// Mock cloneRepository to do a local git clone from our synthetic repo
// instead of hitting GitHub. The synthetic repo path is set in beforeAll.
let syntheticRepoPath = ''

vi.mock('../git/clone.js', () => ({
  cloneRepository: vi.fn(async (_repo: string, targetDir: string) => {
    execFileSync('git', [ 'clone', syntheticRepoPath, targetDir ])
  }),
}))

// ─── Synthetic buggy repo ───────────────────────────────────────────────────

function createSyntheticRepo(): string {
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const repoDir = join(tmpdir(), `self-repair-e2e-${suffix}`)

  mkdirSync(join(repoDir, 'src'), { recursive: true })

  writeFileSync(
    join(repoDir, 'package.json'),
    JSON.stringify({
      name: 'buggy-app',
      version: '1.0.0',
      type: 'module',
    }, null, 2),
  )

  // A file with a clear null-dereference bug
  writeFileSync(
    join(repoDir, 'src', 'index.ts'),
    [
      '// Main application entry point',
      '',
      'type User = { name: string, email: string }',
      '',
      'function getUser(id: string): User | undefined {',
      '  // TODO: implement database lookup',
      '  return undefined',
      '}',
      '',
      'function greetUser(userId: string): string {',
      '  const user = getUser(userId)',
      '  // Bug: user can be undefined, but we access .name unconditionally',
      '  return `Hello, ${user.name}!`',
      '}',
      '',
      'console.log(greetUser("user-123"))',
      '',
    ].join('\n'),
  )

  // Initialize a git repo so the pipeline can work with it
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  }
  execFileSync('git', [ 'init' ], { cwd: repoDir })
  execFileSync('git', [ 'add', '-A' ], { cwd: repoDir })
  execFileSync(
    'git',
    [ 'commit', '-m', 'Initial commit with null-dereference bug' ],
    { cwd: repoDir, env: gitEnv },
  )

  return repoDir
}

// ─── Test ───────────────────────────────────────────────────────────────────

describe.runIf(process.env.ANTHROPIC_API_KEY)(
  'end-to-end: full pipeline with Claude',
  () => {
    beforeAll(() => {
      syntheticRepoPath = createSyntheticRepo()
    })

    afterAll(() => {
      try {
        rmSync(syntheticRepoPath, { recursive: true, force: true })
      }
      catch {
        // Best-effort cleanup
      }
    })

    it('diagnoses a bug, files an issue, and attempts a repair', async () => {
      const options: ResolvedOptions = {
        runInProduction: false,
        engine: 'claude',
        issueTracker: 'github',
        maxParallelRepairs: 3,
        maxLogCount: 50,
        verbose: true,
        claudeToken: process.env.ANTHROPIC_API_KEY,
        githubToken: 'fake-gh-token',
        repo: 'test/buggy-app',
      }

      const payload: ChildWorkerPayload = {
        options,
        trigger: {
          error: 'TypeError: Cannot read properties of undefined (reading \'name\')',
          stack: [
            'TypeError: Cannot read properties of undefined (reading \'name\')',
            '    at greetUser (src/index.ts:13:30)',
            '    at Object.<anonymous> (src/index.ts:16:13)',
          ].join('\n'),
          timestamp: Date.now(),
        },
        skillsSourcePath: resolveSkillsSourcePath(),
      }

      // Execute the full pipeline with a real Claude invocation.
      // If this fails, surface a clear message rather than a raw SDK error.
      try {
        await executeRepairPipeline(payload)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Pipeline e2e test failed during execution: ${message}. `
          + 'Check that ANTHROPIC_API_KEY is valid and the Claude Agent SDK is reachable.',
        )
      }

      // ─── Assertions ─────────────────────────────────────────────────

      // Issue tracker should have been called to create an issue
      expect(mockCreateIssue).toHaveBeenCalledOnce()

      // The bug report passed to createIssue should be well-structured
      const bugReport = mockCreateIssue.mock.calls[0]?.[0] as BugReport
      expect(bugReport).toBeDefined()
      expect(bugReport.title).toBeTruthy()
      expect(bugReport.description).toBeTruthy()
      expect(bugReport.severity).toMatch(/^(low|medium|high|critical)$/)
      expect(bugReport.complexity).toMatch(/^(simple|complex)$/)

      // Claude should have identified the affected file
      expect(bugReport.affectedFiles).toEqual(
        expect.arrayContaining([ expect.stringContaining('index.ts') ]),
      )

      // Run log should have been written
      const { writeRunLog } = await import('../run-log/writer.js')
      expect(writeRunLog).toHaveBeenCalledOnce()

      // If Claude assessed this as simple, it should have attempted a PR.
      // If complex, PR creation is correctly skipped.
      const { createGitHubPullRequest } = await import('../pull-request/github.js')
      if (bugReport.complexity === 'simple') {
        expect(createGitHubPullRequest).toHaveBeenCalled()
      }
      else {
        expect(createGitHubPullRequest).not.toHaveBeenCalled()
      }
    })
  },
)
