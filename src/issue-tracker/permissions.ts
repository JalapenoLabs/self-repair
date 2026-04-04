// Copyright © 2026 self-repair contributors

import type { ResolvedOptions } from '../types.js'

import { logError } from '../logger.js'
import { createIssueTracker } from './factory.js'

/**
 * Validates that the configured issue tracker has sufficient permissions.
 * Also validates GitHub access if the issue tracker is Jira (since PRs
 * always go through GitHub).
 *
 * Throws on insufficient permissions with a descriptive error message.
 */
export async function validateAllPermissions(options: ResolvedOptions): Promise<void> {
  // Validate issue tracker permissions
  const issueTracker = createIssueTracker(options)
  await issueTracker.validatePermissions()

  // If using Jira for issues, we still need GitHub for PR creation
  if (options.issueTracker === 'jira') {
    if (!options.githubToken) {
      throw new Error(
        'self-repair: GITHUB_TOKEN is required for pull request creation, '
        + 'even when using Jira for issue tracking.',
      )
    }
    if (!options.repo) {
      throw new Error(
        'self-repair: repo (owner/repo) is required for pull request creation, '
        + 'even when using Jira for issue tracking.',
      )
    }

    // Validate GitHub access for PR creation (use the issue tracker factory
    // to get a GitHub tracker instance, then validate just the permissions)
    const { Octokit } = await import('@octokit/rest')
    const octokit = new Octokit({ auth: options.githubToken })

    const [ owner, repoName ] = options.repo.split('/')
    if (!owner || !repoName) {
      throw new Error(
        `self-repair: Invalid repo format "${options.repo}". Expected "owner/repo".`,
      )
    }

    try {
      const { data } = await octokit.rest.repos.get({ owner, repo: repoName })
      if (!data.permissions?.push) {
        throw new Error(
          `self-repair: GitHub token lacks push access to ${options.repo}.`,
        )
      }
    }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('self-repair:')) {
        throw error
      }
      logError(`GitHub permission check failed: ${error}`)
      throw new Error(
        `self-repair: Could not verify GitHub access to ${options.repo}. `
        + 'Ensure GITHUB_TOKEN is valid.',
      )
    }
  }
}
