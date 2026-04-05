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
//   npx tsx src/ci/fetch-failed-logs.ts > /tmp/sr-error-context.log
//
// Required environment variables:
//   GITHUB_TOKEN       - Token with actions:read scope
//   GITHUB_REPOSITORY  - owner/repo (set automatically by GitHub Actions)
//   GITHUB_RUN_ID      - Current workflow run ID (set automatically)

import { logError, logInfo } from '../logger'

type StepResult = {
  name: string
  conclusion: string
  number: number
}

type JobResult = {
  id: number
  name: string
  conclusion: string
  steps: StepResult[]
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
 * Fetches all jobs for the current workflow run and identifies which
 * steps failed.
 */
async function getFailedSteps(
  token: string,
  repo: string,
  runId: string,
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
      if (step.conclusion === 'failure') {
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
 * Fetches the full log text for a specific job and extracts the lines
 * belonging to the given step numbers.
 *
 * GitHub Actions job logs are returned as plain text with step headers
 * in the format: "##[group]Run <step command>" or timestamps followed
 * by the step name.
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
        // We were capturing this step and hit the next one -- stop
        break
      }
      if (line.toLowerCase().includes(stepName.toLowerCase())) {
        capturing = true
        continue
      }
    }

    if (capturing) {
      // Strip the timestamp prefix if present (e.g. "2026-04-04T20:00:00.000Z ")
      const cleaned = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '')
      // Skip empty group markers
      if (cleaned === '##[endgroup]') {
        continue
      }
      stepLines.push(cleaned)
    }
  }

  // Return the last N lines (most relevant for errors)
  return stepLines.slice(-maxLines).join('\n')
}

/**
 * Main entry point. Fetches failed step logs and writes them to stdout.
 */
async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const runId = process.env.GITHUB_RUN_ID

  if (!token || !repo || !runId) {
    logError(
      'Missing required environment variables: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID. '
      + 'This script is designed to run inside a GitHub Actions workflow.',
    )
    process.exit(1)
  }

  logInfo(`Fetching failed step logs for run ${runId} in ${repo}...`)

  const failedSteps = await getFailedSteps(token, repo, runId)
  if (failedSteps.length === 0) {
    logInfo('No failed steps found.')
    return
  }

  logInfo(`Found ${failedSteps.length} failed step(s): ${failedSteps.map((s) => s.stepName).join(', ')}`)

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

  // Write to stdout so the caller can capture it
  const output = outputSections.join('\n')
  process.stdout.write(output)
}

main().catch((error) => {
  logError(`Failed to fetch CI logs: ${error}`)
  process.exit(1)
})
