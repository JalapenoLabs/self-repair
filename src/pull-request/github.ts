// Copyright © 2026 self-repair contributors

import type { PullRequestOptions, PullRequestResult } from '../types'

import { Octokit } from '@octokit/rest'

import { logInfo } from '../logger'

/**
 * Creates a pull request on GitHub. PR creation always goes through GitHub,
 * even when the issue tracker is Jira.
 */
export async function createGitHubPullRequest(
  token: string,
  repo: string,
  options: PullRequestOptions,
): Promise<PullRequestResult> {
  const [ owner, repoName ] = repo.split('/')
  if (!owner || !repoName) {
    throw new Error(
      `self-repair: Invalid repo format "${repo}". Expected "owner/repo".`,
    )
  }

  const octokit = new Octokit({ auth: token })

  const { data: pullRequest } = await octokit.rest.pulls.create({
    owner,
    repo: repoName,
    title: options.title,
    body: options.body,
    head: options.head,
    base: options.base,
  })

  logInfo(`Created pull request #${pullRequest.number}: ${pullRequest.html_url}`)

  return {
    url: pullRequest.html_url,
    number: pullRequest.number,
  }
}
