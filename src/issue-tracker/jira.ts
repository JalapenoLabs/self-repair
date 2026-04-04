// Copyright © 2026 self-repair contributors

import type { BugReport, IssueReference, IssueTrackerContract } from './types.js'

import { ISSUE_HASH_PREFIX } from '../constants.js'
import { logError, logInfo } from '../logger.js'

type JiraConfig = {
  host: string
  project: string
  apiToken: string
  email: string
}

/**
 * Builds the Authorization header for Jira basic auth.
 */
function buildAuthHeader(email: string, apiToken: string): string {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64')
  return `Basic ${encoded}`
}

/**
 * Makes an authenticated request to the Jira REST API v3.
 */
async function jiraFetch(
  config: JiraConfig,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `https://${config.host}/rest/api/3${path}`
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': buildAuthHeader(config.email, config.apiToken),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Creates a Jira-backed issue tracker. Uses the Jira REST API v3 directly
 * via native fetch -- no SDK dependency needed.
 */
export function createJiraTracker(config: JiraConfig): IssueTrackerContract {
  async function validatePermissions(): Promise<void> {
    const response = await jiraFetch(
      config,
      `/mypermissions?projectKey=${config.project}`
      + '&permissions=CREATE_ISSUES,BROWSE_PROJECTS',
    )

    if (!response.ok) {
      throw new Error(
        `self-repair: Jira authentication failed (HTTP ${response.status}). `
        + 'Verify jiraHost, jiraEmail, and jiraApiToken are correct.',
      )
    }

    const data = await response.json() as {
      permissions: Record<string, { havePermission: boolean }>
    }

    const createIssues = data.permissions.CREATE_ISSUES
    if (!createIssues?.havePermission) {
      throw new Error(
        `self-repair: Jira token lacks CREATE_ISSUES permission `
        + `on project ${config.project}.`,
      )
    }

    const browseProjects = data.permissions.BROWSE_PROJECTS
    if (!browseProjects?.havePermission) {
      throw new Error(
        `self-repair: Jira token lacks BROWSE_PROJECTS permission `
        + `on project ${config.project}.`,
      )
    }

    logInfo(`Jira permissions verified for project ${config.project}`)
  }

  async function findExistingIssue(errorHash: string): Promise<IssueReference | null> {
    const hashMarker = `${ISSUE_HASH_PREFIX}:${errorHash}`

    // JQL text search for the hash marker in issue descriptions
    const jql = encodeURIComponent(
      `project = "${config.project}" AND text ~ "${hashMarker}" ORDER BY created DESC`,
    )

    const response = await jiraFetch(config, `/search?jql=${jql}&maxResults=1`)
    if (!response.ok) {
      logError(`Jira issue search failed (HTTP ${response.status})`)
      return null
    }

    const data = await response.json() as {
      total: number
      issues: Array<{ key: string }>
    }

    if (data.total > 0 && data.issues[0]) {
      const issue = data.issues[0]
      const issueUrl = `https://${config.host}/browse/${issue.key}`
      return {
        tracker: 'jira',
        id: issue.key,
        url: issueUrl,
      }
    }

    return null
  }

  async function createIssue(
    bugReport: BugReport,
    errorHash: string,
  ): Promise<IssueReference> {
    const hashMarker = `{noformat}${ISSUE_HASH_PREFIX}:${errorHash}{noformat}`

    const descriptionLines = [
      `h2. Bug Report`,
      '',
      bugReport.description,
      '',
      `*Severity:* ${bugReport.severity}`,
      `*Complexity:* ${bugReport.complexity}`,
      '',
      `h3. Affected Files`,
      bugReport.affectedFiles.map((file) => `* {{${file}}}`).join('\n'),
      '',
      `h3. Reproduction Steps`,
      bugReport.reproductionSteps,
      '',
      bugReport.suggestedFix
        ? `h3. Suggested Fix\n${bugReport.suggestedFix}\n`
        : '',
      '----',
      '_Filed automatically by [self-repair|https://www.npmjs.com/package/self-repair]_',
      '',
      hashMarker,
    ].join('\n')

    const response = await jiraFetch(config, '/issue', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key: config.project },
          summary: bugReport.title,
          description: descriptionLines,
          issuetype: { name: 'Bug' },
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `self-repair: Failed to create Jira issue (HTTP ${response.status}): ${errorBody}`,
      )
    }

    const data = await response.json() as { key: string }
    const issueUrl = `https://${config.host}/browse/${data.key}`

    logInfo(`Created Jira issue ${data.key}: ${issueUrl}`)

    return {
      tracker: 'jira',
      id: data.key,
      url: issueUrl,
    }
  }

  return {
    kind: 'jira',
    validatePermissions,
    findExistingIssue,
    createIssue,
  }
}
