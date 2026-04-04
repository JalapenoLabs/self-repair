// Copyright © 2026 self-repair contributors

import { Octokit } from '@octokit/rest'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGitHubPullRequest } from './github.js'

vi.mock('../logger.js', () => ({
  logInfo: vi.fn(),
}))

const mockPullsCreate = vi.fn()

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(),
}))

describe('createGitHubPullRequest', () => {
  beforeEach(() => {
    vi.mocked(Octokit).mockImplementation(
      () => ({ rest: { pulls: { create: mockPullsCreate } } }) as any,
    )
    mockPullsCreate.mockResolvedValue({
      data: { number: 5, html_url: 'https://github.com/owner/repo/pull/5' },
    })
  })

  it('throws immediately when the repo format is invalid', async () => {
    await expect(
      createGitHubPullRequest('tok', 'no-slash', {
        title: 'fix',
        body: '',
        head: 'branch',
        base: 'main',
      }),
    ).rejects.toThrow('Expected "owner/repo"')
  })

  it('calls Octokit pulls.create with the correct owner and repo', async () => {
    await createGitHubPullRequest('ghp_token', 'owner/repo', {
      title: 'Fix: null check',
      body: 'Adds null check',
      head: 'fix/null-check',
      base: 'main',
    })
    expect(mockPullsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'owner', repo: 'repo' }),
    )
  })

  it('forwards title, body, head, and base to the API', async () => {
    await createGitHubPullRequest('tok', 'o/r', {
      title: 'My PR',
      body: 'Description',
      head: 'feature-branch',
      base: 'main',
    })
    expect(mockPullsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My PR',
        body: 'Description',
        head: 'feature-branch',
        base: 'main',
      }),
    )
  })

  it('returns the PR url and number from the API response', async () => {
    mockPullsCreate.mockResolvedValue({
      data: { number: 99, html_url: 'https://github.com/owner/repo/pull/99' },
    })
    const result = await createGitHubPullRequest('tok', 'owner/repo', {
      title: 'fix',
      body: '',
      head: 'branch',
      base: 'main',
    })
    expect(result).toEqual({ url: 'https://github.com/owner/repo/pull/99', number: 99 })
  })
})
