// Copyright © 2026 self-repair contributors

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { Octokit } from '@octokit/rest'

import { logInfo } from '../logger'

const execFileAsync = promisify(execFile)

/**
 * Fetches the head branch of a pull request and checks it out in
 * the given repository directory. This allows self-repair to commit
 * fixes directly to the PR's source branch.
 *
 * Handles shallow clones (--depth=1) by explicitly fetching the
 * PR branch ref before checkout. Also handles branch names containing
 * special characters (e.g. '#') since execFile passes args as an array,
 * bypassing shell interpretation.
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

  // Fetch the specific branch ref. The refspec maps the remote branch
  // to a local tracking branch so checkout can find it.
  await execFileAsync(
    'git',
    [ 'fetch', 'origin', `+refs/heads/${branchName}:refs/remotes/origin/${branchName}` ],
    { cwd: repoDir },
  )

  // Checkout the branch, creating a local tracking branch from the remote
  await execFileAsync(
    'git',
    [ 'checkout', '-b', branchName, `origin/${branchName}` ],
    { cwd: repoDir },
  )

  logInfo(`Checked out branch: ${branchName}`)
  return branchName
}
