// Copyright © 2026 self-repair contributors

//
// Standalone utility that fetches the logs of failed CI steps from the
// GitHub Actions API. Designed to run BEFORE the LLM agent so the agent
// receives actual error output instead of just "step X failed."
//
// Uses only the GitHub REST API (native fetch) -- no `gh` CLI dependency.
// Works on any runner (GitHub-hosted, self-hosted, custom).
//
// Usage (from a workflow step):
//   yarn tsx src/ci/fetch-failed-logs.ts --steps "Install:failure,Lint:success,..." > /tmp/logs.txt
//
// Required environment variables:
//   GITHUB_TOKEN       - Token with actions:read scope
//   GITHUB_REPOSITORY  - owner/repo (set automatically by GitHub Actions)
//   GITHUB_RUN_ID      - Current workflow run ID (set automatically)
//
// The --steps flag receives the actual step outcomes from the workflow
// context (steps.<id>.outcome), which reflect the raw result BEFORE
// continue-on-error is applied. This is necessary because the REST API
// only exposes `conclusion` (post-continue-on-error), which is always
// 'success' for steps with continue-on-error: true.

import { logError, logInfo } from '../logger'

type JobResult = {
  id: number
  name: string
  conclusion: string
  steps: Array<{
    name: string
    conclusion: string
    number: number
  }>
}

const GITHUB_API = 'https://api.github.com'

/**
 * Makes an authenticated request to the GitHub REST API.
 */
async function githubFetch(
  path: string,
  token: string,
  accept = 'application/json',
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': accept,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
}

/**
 * Parses the --steps flag value into a map of step name -> outcome.
 * Format: "Install:failure,Lint:success,Typecheck:failure,Tests:skipped"
 */
function parseStepOutcomes(stepsArg: string): Map<string, string> {
  const outcomes = new Map<string, string>()
  for (const entry of stepsArg.split(',')) {
    const colonIndex = entry.lastIndexOf(':')
    if (colonIndex > 0) {
      const name = entry.slice(0, colonIndex).trim()
      const outcome = entry.slice(colonIndex + 1).trim()
      outcomes.set(name, outcome)
    }
  }
  return outcomes
}

/**
 * Identifies which steps actually failed. Uses the --steps workflow
 * outcomes as the source of truth (raw outcome before continue-on-error).
 * Falls back to the REST API conclusion field when --steps is not provided.
 */
async function getFailedStepNames(
  token: string,
  repo: string,
  runId: string,
  workflowOutcomes?: Map<string, string>,
): Promise<Array<{ jobId: number, jobName: string, stepName: string, stepNumber: number }>> {
  const response = await githubFetch(
    `/repos/${repo}/actions/runs/${runId}/jobs`,
    token,
  )

  if (!response.ok) {
    logError(`Failed to fetch jobs: HTTP ${response.status}`)
    return []
  }

  const data = await response.json() as { jobs: JobResult[] }
  const failedSteps: Array<{
    jobId: number
    jobName: string
    stepName: string
    stepNumber: number
  }> = []

  for (const job of data.jobs) {
    for (const step of job.steps) {
      // If we have workflow-provided outcomes, use those (they bypass
      // continue-on-error masking). Otherwise fall back to API conclusion.
      const isFailed = workflowOutcomes
        ? workflowOutcomes.get(step.name) === 'failure'
        : step.conclusion === 'failure'

      if (isFailed) {
        failedSteps.push({
          jobId: job.id,
          jobName: job.name,
          stepName: step.name,
          stepNumber: step.number,
        })
      }
    }
  }

  return failedSteps
}

/**
 * Fetches the full log text for a specific job.
 */
async function getJobLogs(
  token: string,
  repo: string,
  jobId: number,
): Promise<string | null> {
  const response = await githubFetch(
    `/repos/${repo}/actions/jobs/${jobId}/logs`,
    token,
    'application/vnd.github.v3.raw',
  )

  if (!response.ok) {
    logError(`Failed to fetch job logs for job ${jobId}: HTTP ${response.status}`)
    return null
  }

  return response.text()
}

/**
 * Parses GitHub Actions log text and extracts lines belonging to a
 * specific step. Step sections are delimited by lines matching the
 * pattern: "<timestamp> ##[group]<step name>"
 */
function extractStepLogs(
  fullLog: string,
  stepName: string,
  maxLines = 50,
): string {
  const lines = fullLog.split('\n')
  const stepLines: string[] = []
  let capturing = false

  for (const line of lines) {
    // Step headers look like: "2026-04-04T20:00:00.000Z ##[group]Run yarn install --immutable"
    // or just: "##[group]<step name>"
    if (line.includes('##[group]')) {
      if (capturing) {
        break
      }
      if (line.toLowerCase().includes(stepName.toLowerCase())) {
        capturing = true
        continue
      }
    }

    if (capturing) {
      // Strip the timestamp prefix if present
      const cleaned = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '')
      if (cleaned === '##[endgroup]') {
        continue
      }
      stepLines.push(cleaned)
    }
  }

  return stepLines.slice(-maxLines).join('\n')
}

/**
 * Main entry point. Fetches failed step logs and writes them to stdout.
 */
async function main(): Promise<void> {
  // Prefer GITHUB_ACTIONS_TOKEN (the built-in actions token that always has
  // Actions: Read) for downloading logs. Fall back to GITHUB_TOKEN when
  // GITHUB_ACTIONS_TOKEN is not available (e.g. running locally).
  const token = process.env.GITHUB_ACTIONS_TOKEN || process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const runId = process.env.GITHUB_RUN_ID

  if (!token || !repo || !runId) {
    logError(
      'Missing required environment variables: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID. '
      + 'This script is designed to run inside a GitHub Actions workflow.',
    )
    process.exit(1)
  }

  // Parse --steps flag if provided
  const stepsArgIndex = process.argv.indexOf('--steps')
  const stepsArgValue = stepsArgIndex >= 0
    ? process.argv[stepsArgIndex + 1]
    : undefined
  const workflowOutcomes = stepsArgValue
    ? parseStepOutcomes(stepsArgValue)
    : undefined

  if (workflowOutcomes) {
    logInfo(`Using workflow-provided step outcomes (${workflowOutcomes.size} steps)`)
  }
  else {
    logInfo('No --steps flag provided, falling back to REST API conclusion field')
  }

  logInfo(`Fetching failed step logs for run ${runId} in ${repo}...`)

  const failedSteps = await getFailedStepNames(token, repo, runId, workflowOutcomes)
  if (failedSteps.length === 0) {
    logInfo('No failed steps found.')
    return
  }

  logInfo(
    `Found ${failedSteps.length} failed step(s): `
    + failedSteps.map((s) => s.stepName).join(', '),
  )

  // Fetch logs for each unique job that has failures
  const jobIds = [ ...new Set(failedSteps.map((s) => s.jobId)) ]
  const logsByJob = new Map<number, string>()

  for (const jobId of jobIds) {
    const logs = await getJobLogs(token, repo, jobId)
    if (logs) {
      logsByJob.set(jobId, logs)
    }
  }

  // Extract and output the relevant log sections
  const outputSections: string[] = []

  for (const step of failedSteps) {
    const jobLog = logsByJob.get(step.jobId)
    if (!jobLog) {
      outputSections.push(
        `--- ${step.stepName} (${step.jobName}) ---\n[Could not fetch logs]\n`,
      )
      continue
    }

    const stepLog = extractStepLogs(jobLog, step.stepName)
    if (stepLog.trim()) {
      outputSections.push(
        `--- ${step.stepName} (${step.jobName}) output (last 50 lines) ---\n${stepLog}\n`,
      )
    }
    else {
      outputSections.push(
        `--- ${step.stepName} (${step.jobName}) ---\n[No log output captured for this step]\n`,
      )
    }
  }

  const output = outputSections.join('\n')
  process.stdout.write(output)
}

main().catch((error) => {
  logError(`Failed to fetch CI logs: ${error}`)
  process.exit(1)
})
