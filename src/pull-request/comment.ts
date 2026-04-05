// Copyright © 2026 self-repair contributors

import { Octokit } from '@octokit/rest'

import { logInfo } from '../logger'

/**
 * Posts a comment on a pull request summarizing what self-repair did.
 */
export async function commentOnPullRequest(
  token: string,
  repo: string,
  pullRequestNumber: number,
  body: string,
): Promise<void> {
  const [ owner, repoName ] = repo.split('/')
  if (!owner || !repoName) {
    throw new Error(
      `self-repair: Invalid repo format "${repo}". Expected "owner/repo".`,
    )
  }

  const octokit = new Octokit({ auth: token })

  await octokit.rest.issues.createComment({
    owner,
    repo: repoName,
    issue_number: pullRequestNumber,
    body,
  })

  logInfo(`Posted comment on PR #${pullRequestNumber}`)
}
