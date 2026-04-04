// Copyright © 2026 self-repair contributors

import type { BugReport } from '../types.js'

import { Octokit } from '@octokit/rest'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGitHubTracker } from './github.js'

vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

const mockReposGet = vi.fn()
const mockIssuesGetLabel = vi.fn()
const mockIssuesCreateLabel = vi.fn()
const mockIssuesCreate = vi.fn()
const mockSearchIssues = vi.fn()

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(),
}))

const TOKEN = 'ghp_test'
const REPO = 'owner/repo'

const bugReport: BugReport = {
  title: 'NullPointerException in app.ts',
  description: 'Crash when user logs in',
  severity: 'high',
  complexity: 'simple',
  affectedFiles: ['src/app.ts'],
  reproductionSteps: '1. Log in\n2. Observe crash',
  suggestedFix: 'Add null check on line 42',
}

describe('createGitHubTracker', () => {
  beforeEach(() => {
    vi.mocked(Octokit).mockImplementation(
      () =>
        ({
          rest: {
            repos: { get: mockReposGet },
            issues: {
              getLabel: mockIssuesGetLabel,
              createLabel: mockIssuesCreateLabel,
              create: mockIssuesCreate,
            },
            search: { issuesAndPullRequests: mockSearchIssues },
          },
        }) as any,
    )

    mockReposGet.mockResolvedValue({
      data: { permissions: { push: true }, has_issues: true },
    })
    mockIssuesGetLabel.mockResolvedValue({ data: { name: 'self-repair' } })
    mockIssuesCreateLabel.mockResolvedValue({})
    mockIssuesCreate.mockResolvedValue({
      data: { number: 42, html_url: 'https://github.com/owner/repo/issues/42' },
    })
    mockSearchIssues.mockResolvedValue({ data: { total_count: 0, items: [] } })
  })

  it('throws immediately on invalid repo format', () => {
    expect(() => createGitHubTracker(TOKEN, 'no-slash')).toThrow('Expected "owner/repo"')
  })

  describe('validatePermissions', () => {
    it('resolves when the token has push access and issues are enabled', async () => {
      await expect(createGitHubTracker(TOKEN, REPO).validatePermissions()).resolves.toBeUndefined()
    })

    it('throws when the token lacks push access', async () => {
      mockReposGet.mockResolvedValue({
        data: { permissions: { push: false }, has_issues: true },
      })
      await expect(createGitHubTracker(TOKEN, REPO).validatePermissions()).rejects.toThrow(
        'push access',
      )
    })

    it('throws when issues are disabled on the repository', async () => {
      mockReposGet.mockResolvedValue({
        data: { permissions: { push: true }, has_issues: false },
      })
      await expect(createGitHubTracker(TOKEN, REPO).validatePermissions()).rejects.toThrow(
        'Issues are disabled',
      )
    })
  })

  describe('findExistingIssue', () => {
    it('returns null when no matching issue exists', async () => {
      const result = await createGitHubTracker(TOKEN, REPO).findExistingIssue('abc123')
      expect(result).toBeNull()
    })

    it('returns an IssueReference when a matching issue is found', async () => {
      mockSearchIssues.mockResolvedValue({
        data: {
          total_count: 1,
          items: [{ number: 7, html_url: 'https://github.com/owner/repo/issues/7' }],
        },
      })
      const result = await createGitHubTracker(TOKEN, REPO).findExistingIssue('abc123')
      expect(result).toEqual({
        tracker: 'github',
        id: '7',
        url: 'https://github.com/owner/repo/issues/7',
      })
    })

    it('includes the error hash in the search query', async () => {
      await createGitHubTracker(TOKEN, REPO).findExistingIssue('deadbeef')
      expect(mockSearchIssues).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining('deadbeef') }),
      )
    })
  })

  describe('createIssue', () => {
    it('creates an issue with the bug report title', async () => {
      await createGitHubTracker(TOKEN, REPO).createIssue(bugReport, 'hash123')
      expect(mockIssuesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: bugReport.title }),
      )
    })

    it('embeds the error hash marker in the issue body', async () => {
      await createGitHubTracker(TOKEN, REPO).createIssue(bugReport, 'hash123')
      const { body } = mockIssuesCreate.mock.calls[0][0] as { body: string }
      expect(body).toContain('hash123')
    })

    it('includes affected files in the issue body', async () => {
      await createGitHubTracker(TOKEN, REPO).createIssue(bugReport, 'hash123')
      const { body } = mockIssuesCreate.mock.calls[0][0] as { body: string }
      expect(body).toContain('src/app.ts')
    })

    it('returns an IssueReference with the created issue URL and id', async () => {
      const result = await createGitHubTracker(TOKEN, REPO).createIssue(bugReport, 'hash123')
      expect(result).toEqual({
        tracker: 'github',
        id: '42',
        url: 'https://github.com/owner/repo/issues/42',
      })
    })

    it('creates the self-repair label if it does not exist', async () => {
      mockIssuesGetLabel.mockRejectedValue(new Error('Not found'))
      await createGitHubTracker(TOKEN, REPO).createIssue(bugReport, 'hash123')
      expect(mockIssuesCreateLabel).toHaveBeenCalled()
    })
  })
})
