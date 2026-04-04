// Copyright © 2026 self-repair contributors

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { Octokit } from '@octokit/rest'

import { logInfo } from '../logger'

const execFileAsync = promisify(execFile)

/**
 * Fetches the head branch name of a pull request and checks it out
 * in the given repository directory. This allows self-repair to commit
 * fixes directly to the PR's source branch.
 */
export async function checkoutPrBranch(
  repoDir: string,
  pullRequestNumber: number,
  token: string,
  repo: string,
): Promise<string> {
  const [ owner, repoName ] = repo.split('/')
  if (!owner || !repoName) {
    throw new Error(
      `self-repair: Invalid repo format "${repo}". Expected "owner/repo".`,
    )
  }

  const octokit = new Octokit({ auth: token })
  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner,
    repo: repoName,
    pull_number: pullRequestNumber,
  })

  const branchName = pullRequest.head.ref
  logInfo(`PR #${pullRequestNumber} head branch: ${branchName}`)

  // Fetch all branches and checkout the PR's source branch
  await execFileAsync('git', [ 'fetch', 'origin', branchName ], { cwd: repoDir })
  await execFileAsync('git', [ 'checkout', branchName ], { cwd: repoDir })

  logInfo(`Checked out branch: ${branchName}`)
  return branchName
}
