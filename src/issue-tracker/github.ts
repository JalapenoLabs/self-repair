// Copyright © 2026 self-repair contributors

import type { BugReport, IssueReference, IssueTrackerContract } from './types.js'

import { Octokit } from '@octokit/rest'

import { GITHUB_LABEL, ISSUE_HASH_PREFIX } from '../constants.js'
import { logError, logInfo } from '../logger.js'

/**
 * Parses "owner/repo" into its two parts.
 */
function parseRepo(repo: string): { owner: string, repoName: string } {
  const [ owner, repoName ] = repo.split('/')
  if (!owner || !repoName) {
    throw new Error(
      `self-repair: Invalid repo format "${repo}". Expected "owner/repo".`,
    )
  }
  return { owner, repoName }
}

/**
 * Ensures the self-repair label exists on the repository.
 * Creates it if missing, silently continues if it already exists.
 */
async function ensureLabelExists(
  octokit: Octokit,
  owner: string,
  repoName: string,
): Promise<void> {
  try {
    await octokit.rest.issues.getLabel({
      owner,
      repo: repoName,
      name: GITHUB_LABEL,
    })
  }
  catch {
    try {
      await octokit.rest.issues.createLabel({
        owner,
        repo: repoName,
        name: GITHUB_LABEL,
        color: 'e74c3c',
        description: 'Automatically filed by self-repair',
      })
    }
    catch (createError) {
      // Label may have been created by a concurrent process -- not fatal
      logError(`Failed to create "${GITHUB_LABEL}" label: ${createError}`)
    }
  }
}

/**
 * Creates a GitHub-backed issue tracker that can validate permissions,
 * search for existing issues by error hash, and create new issues.
 */
export function createGitHubTracker(
  token: string,
  repo: string,
): IssueTrackerContract {
  const octokit = new Octokit({ auth: token })
  const { owner, repoName } = parseRepo(repo)

  async function validatePermissions(): Promise<void> {
    // Verify token is valid and has repo access
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo: repoName,
    })

    if (!repoData.permissions?.push) {
      throw new Error(
        `self-repair: GitHub token lacks push access to ${repo}. `
        + 'Push access is required for creating issues and pull requests.',
      )
    }

    if (!repoData.has_issues) {
      throw new Error(
        `self-repair: Issues are disabled on ${repo}. `
        + 'Enable issues in the repository settings to use self-repair.',
      )
    }

    logInfo(`GitHub permissions verified for ${repo}`)
  }

  async function findExistingIssue(errorHash: string): Promise<IssueReference | null> {
    const hashMarker = `${ISSUE_HASH_PREFIX}:${errorHash}`

    // Search open issues in this repo that contain the hash marker
    const { data } = await octokit.rest.search.issuesAndPullRequests({
      q: `repo:${owner}/${repoName} is:issue is:open "${hashMarker}"`,
      per_page: 1,
    })

    if (data.total_count > 0 && data.items[0]) {
      const issue = data.items[0]
      return {
        tracker: 'github',
        id: String(issue.number),
        url: issue.html_url,
      }
    }

    return null
  }

  async function createIssue(
    bugReport: BugReport,
    errorHash: string,
  ): Promise<IssueReference> {
    await ensureLabelExists(octokit, owner, repoName)

    const hashMarker = `<!-- ${ISSUE_HASH_PREFIX}:${errorHash} -->`

    const body = [
      `## Bug Report`,
      '',
      bugReport.description,
      '',
      `### Severity: \`${bugReport.severity}\``,
      `### Complexity: \`${bugReport.complexity}\``,
      '',
      `### Affected Files`,
      bugReport.affectedFiles.map((file) => `- \`${file}\``).join('\n'),
      '',
      `### Reproduction Steps`,
      bugReport.reproductionSteps,
      '',
      bugReport.suggestedFix
        ? `### Suggested Fix\n${bugReport.suggestedFix}\n`
        : '',
      '---',
      '*Filed automatically by [self-repair](https://www.npmjs.com/package/self-repair)*',
      '',
      hashMarker,
    ].join('\n')

    const { data: issue } = await octokit.rest.issues.create({
      owner,
      repo: repoName,
      title: bugReport.title,
      body,
      labels: [ GITHUB_LABEL ],
    })

    logInfo(`Created GitHub issue #${issue.number}: ${issue.html_url}`)

    return {
      tracker: 'github',
      id: String(issue.number),
      url: issue.html_url,
    }
  }

  return {
    kind: 'github',
    validatePermissions,
    findExistingIssue,
    createIssue,
  }
}
