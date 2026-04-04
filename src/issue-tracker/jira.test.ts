// Copyright © 2026 self-repair contributors

import type { BugReport } from '../types.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createJiraTracker } from './jira.js'

vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

const CONFIG = {
  host: 'mycompany.atlassian.net',
  project: 'ENG',
  apiToken: 'jira-api-token',
  email: 'dev@example.com',
}

const bugReport: BugReport = {
  title: 'Login crash',
  description: 'App crashes on login',
  severity: 'high',
  complexity: 'simple',
  affectedFiles: ['src/auth.ts'],
  reproductionSteps: '1. Open app\n2. Log in',
}

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeResponse(ok: boolean, body: unknown, status = ok ? 200 : 401): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('createJiraTracker', () => {
  describe('validatePermissions', () => {
    it('resolves when CREATE_ISSUES and BROWSE_PROJECTS are granted', async () => {
      mockFetch.mockResolvedValue(
        makeResponse(true, {
          permissions: {
            CREATE_ISSUES: { havePermission: true },
            BROWSE_PROJECTS: { havePermission: true },
          },
        }),
      )
      await expect(createJiraTracker(CONFIG).validatePermissions()).resolves.toBeUndefined()
    })

    it('throws when the HTTP request fails', async () => {
      mockFetch.mockResolvedValue(makeResponse(false, {}, 401))
      await expect(createJiraTracker(CONFIG).validatePermissions()).rejects.toThrow(
        'authentication failed',
      )
    })

    it('throws when CREATE_ISSUES permission is missing', async () => {
      mockFetch.mockResolvedValue(
        makeResponse(true, {
          permissions: {
            CREATE_ISSUES: { havePermission: false },
            BROWSE_PROJECTS: { havePermission: true },
          },
        }),
      )
      await expect(createJiraTracker(CONFIG).validatePermissions()).rejects.toThrow(
        'CREATE_ISSUES',
      )
    })

    it('throws when BROWSE_PROJECTS permission is missing', async () => {
      mockFetch.mockResolvedValue(
        makeResponse(true, {
          permissions: {
            CREATE_ISSUES: { havePermission: true },
            BROWSE_PROJECTS: { havePermission: false },
          },
        }),
      )
      await expect(createJiraTracker(CONFIG).validatePermissions()).rejects.toThrow(
        'BROWSE_PROJECTS',
      )
    })
  })

  describe('findExistingIssue', () => {
    it('returns null when no matching issue is found', async () => {
      mockFetch.mockResolvedValue(
        makeResponse(true, { total: 0, issues: [] }),
      )
      const result = await createJiraTracker(CONFIG).findExistingIssue('abc123')
      expect(result).toBeNull()
    })

    it('returns an IssueReference when a matching issue exists', async () => {
      mockFetch.mockResolvedValue(
        makeResponse(true, { total: 1, issues: [{ key: 'ENG-42' }] }),
      )
      const result = await createJiraTracker(CONFIG).findExistingIssue('abc123')
      expect(result).toEqual({
        tracker: 'jira',
        id: 'ENG-42',
        url: `https://${CONFIG.host}/browse/ENG-42`,
      })
    })

    it('returns null on HTTP error rather than throwing', async () => {
      mockFetch.mockResolvedValue(makeResponse(false, {}, 500))
      const result = await createJiraTracker(CONFIG).findExistingIssue('abc123')
      expect(result).toBeNull()
    })

    it('includes the error hash in the JQL search query', async () => {
      mockFetch.mockResolvedValue(makeResponse(true, { total: 0, issues: [] }))
      await createJiraTracker(CONFIG).findExistingIssue('deadbeef')
      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toContain('deadbeef')
    })
  })

  describe('createIssue', () => {
    it('creates an issue and returns an IssueReference', async () => {
      mockFetch.mockResolvedValue(makeResponse(true, { key: 'ENG-99' }, 201))
      const result = await createJiraTracker(CONFIG).createIssue(bugReport, 'hash123')
      expect(result).toEqual({
        tracker: 'jira',
        id: 'ENG-99',
        url: `https://${CONFIG.host}/browse/ENG-99`,
      })
    })

    it('sends the bug report title as the issue summary', async () => {
      mockFetch.mockResolvedValue(makeResponse(true, { key: 'ENG-1' }, 201))
      await createJiraTracker(CONFIG).createIssue(bugReport, 'hash123')
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body.fields.summary).toBe(bugReport.title)
    })

    it('embeds the error hash in the issue description', async () => {
      mockFetch.mockResolvedValue(makeResponse(true, { key: 'ENG-1' }, 201))
      await createJiraTracker(CONFIG).createIssue(bugReport, 'hash123')
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body.fields.description).toContain('hash123')
    })

    it('throws when the Jira API returns an error response', async () => {
      mockFetch.mockResolvedValue(makeResponse(false, { errorMessages: ['Bad request'] }, 400))
      await expect(createJiraTracker(CONFIG).createIssue(bugReport, 'hash123')).rejects.toThrow(
        'HTTP 400',
      )
    })
  })
})
