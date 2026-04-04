// Copyright © 2026 self-repair contributors

import type { IssueTrackerContract, IssueTrackerKind } from './types'

import type { ResolvedOptions } from '../types'

import { createGitHubTracker } from './github'
import { createJiraTracker } from './jira'

type TrackerFactory = (options: ResolvedOptions) => IssueTrackerContract

const trackerFactoryByKind = {
  github: (options: ResolvedOptions): IssueTrackerContract => {
    if (!options.githubToken) {
      throw new Error('self-repair: GITHUB_TOKEN is required for GitHub issue tracking.')
    }
    if (!options.repo) {
      throw new Error('self-repair: repo is required for GitHub issue tracking.')
    }
    return createGitHubTracker(options.githubToken, options.repo)
  },

  jira: (options: ResolvedOptions): IssueTrackerContract => {
    if (!options.jiraHost) {
      throw new Error('self-repair: jiraHost is required for Jira issue tracking.')
    }
    if (!options.jiraProject) {
      throw new Error('self-repair: jiraProject is required for Jira issue tracking.')
    }
    if (!options.jiraApiToken) {
      throw new Error('self-repair: jiraApiToken is required for Jira issue tracking.')
    }
    if (!options.jiraEmail) {
      throw new Error('self-repair: jiraEmail is required for Jira issue tracking.')
    }
    return createJiraTracker({
      host: options.jiraHost,
      project: options.jiraProject,
      apiToken: options.jiraApiToken,
      email: options.jiraEmail,
    })
  },
} as const satisfies Record<IssueTrackerKind, TrackerFactory>

/**
 * Creates an issue tracker instance based on the configured provider kind.
 * Validates that all required options are present for the chosen provider.
 */
export function createIssueTracker(options: ResolvedOptions): IssueTrackerContract {
  const factory = trackerFactoryByKind[options.issueTracker]
  return factory(options)
}
