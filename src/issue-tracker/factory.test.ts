// Copyright © 2026 self-repair contributors

import type { ResolvedOptions } from '../types'

import { describe, expect, it, vi } from 'vitest'

import { createIssueTracker } from './factory'

// Suppress chalk logging during tests
vi.mock('../logger', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  logStep: vi.fn(),
  logUsage: vi.fn(),
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
    githubToken: 'ghp_test',
    repo: 'owner/repo',
    ...overrides,
  }
}

describe('issue tracker factory', () => {
  it('creates a GitHub tracker when issueTracker is github', () => {
    const tracker = createIssueTracker(buildOptions({ issueTracker: 'github' }))
    expect(tracker.kind).toBe('github')
  })

  it('creates a Jira tracker when issueTracker is jira', () => {
    const tracker = createIssueTracker(buildOptions({
      issueTracker: 'jira',
      jiraHost: 'test.atlassian.net',
      jiraProject: 'TEST',
      jiraApiToken: 'jira-token',
      jiraEmail: 'test@test.com',
    }))
    expect(tracker.kind).toBe('jira')
  })

  it('throws when GitHub tracker is missing token', () => {
    expect(() => createIssueTracker(buildOptions({
      issueTracker: 'github',
      githubToken: undefined,
    }))).toThrow('GITHUB_TOKEN is required')
  })

  it('throws when GitHub tracker is missing repo', () => {
    expect(() => createIssueTracker(buildOptions({
      issueTracker: 'github',
      repo: undefined,
    }))).toThrow('repo is required')
  })

  it('throws when Jira tracker is missing host', () => {
    expect(() => createIssueTracker(buildOptions({
      issueTracker: 'jira',
    }))).toThrow('jiraHost is required')
  })

  it('throws when Jira tracker is missing project', () => {
    expect(() => createIssueTracker(buildOptions({
      issueTracker: 'jira',
      jiraHost: 'test.atlassian.net',
    }))).toThrow('jiraProject is required')
  })

  it('throws when Jira tracker is missing API token', () => {
    expect(() => createIssueTracker(buildOptions({
      issueTracker: 'jira',
      jiraHost: 'test.atlassian.net',
      jiraProject: 'TEST',
    }))).toThrow('jiraApiToken is required')
  })

  it('throws when Jira tracker is missing email', () => {
    expect(() => createIssueTracker(buildOptions({
      issueTracker: 'jira',
      jiraHost: 'test.atlassian.net',
      jiraProject: 'TEST',
      jiraApiToken: 'token',
    }))).toThrow('jiraEmail is required')
  })
})
