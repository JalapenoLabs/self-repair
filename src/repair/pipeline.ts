// Copyright © 2026 self-repair contributors

import type {
  BugReport,
  ChildWorkerPayload,
  MakePrSkillOutput,
  RunLog,
  RunLogStep,
} from '../types.js'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { dir as createTmpDir } from 'tmp-promise'

import { createEngine } from '../engine/factory.js'
import { cloneRepository } from '../git/clone.js'
import { createIssueTracker } from '../issue-tracker/factory.js'
import { logError, logStep, logSuccess } from '../logger.js'
import { createGitHubPullRequest } from '../pull-request/github.js'
import { pruneRunLogs } from '../run-log/pruner.js'
import { writeRunLog } from '../run-log/writer.js'
import { injectSkills } from '../skills/inject.js'
import { computeErrorHash } from './deduplication.js'

const TOTAL_STEPS = 7

/**
 * Reads a skill SKILL.md file from the injected skills directory
 * and returns its content as a string.
 */
function readSkillContent(skillsDir: string, skillName: string): string {
  const skillPath = join(skillsDir, skillName, 'SKILL.md')
  try {
    return readFileSync(skillPath, 'utf-8')
  }
  catch {
    throw new Error(
      `self-repair: Could not read skill "${skillName}" at ${skillPath}`,
    )
  }
}

/**
 * Builds the prompt sent to the LLM engine for a given skill invocation.
 * Combines the skill instructions with the error context and any
 * user-provided pre-prompt content.
 */
function buildPrompt(
  payload: ChildWorkerPayload,
  skillContent: string,
  additionalContext?: string,
): string {
  const sections: string[] = []

  sections.push(skillContent)

  if (payload.options.customPrePrompt) {
    sections.push(`## Additional Instructions\n${payload.options.customPrePrompt}`)
  }

  if (payload.options.additionalPrePromptContext) {
    sections.push(
      `## Additional Context\n`
      + `\`\`\`json\n${JSON.stringify(payload.options.additionalPrePromptContext, null, 2)}\n\`\`\``,
    )
  }

  sections.push(`## Error Report\n\`\`\`\n${payload.trigger.error}\n\`\`\``)

  if (payload.trigger.stack) {
    sections.push(`## Stack Trace\n\`\`\`\n${payload.trigger.stack}\n\`\`\``)
  }

  if (additionalContext) {
    sections.push(additionalContext)
  }

  return sections.join('\n\n')
}

/**
 * Attempts to parse structured JSON from the engine output.
 * The engine may include markdown fences or other wrapping text;
 * this extracts the first valid JSON block.
 */
function parseJsonFromOutput<Shape>(output: string): Shape | null {
  // Try to extract JSON from markdown code fences first
  const fenceMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]) as Shape
    }
    catch {
      // Fall through to raw parse
    }
  }

  // Try parsing the entire output as JSON
  try {
    return JSON.parse(output) as Shape
  }
  catch {
    return null
  }
}

/**
 * Records the duration and outcome of a pipeline step into the run log.
 */
function recordStep(
  steps: RunLogStep[],
  name: string,
  startTime: number,
  success: boolean,
  output?: string,
): void {
  steps.push({
    name,
    status: success ? 'success' : 'failure',
    durationMs: Date.now() - startTime,
    output: output?.slice(0, 5000), // Truncate large outputs
  })
}

/**
 * The core repair pipeline. This is the heart of self-repair: it clones the
 * repo, invokes the LLM to diagnose the bug, files an issue, and optionally
 * creates a PR with a fix.
 *
 * Shared between the child-worker process (library mode) and the CLI (direct mode).
 */
export async function executeRepairPipeline(payload: ChildWorkerPayload): Promise<void> {
  const errorHash = computeErrorHash(payload.trigger)
  const steps: RunLogStep[] = []
  const runLog: RunLog = {
    id: `${Date.now()}-${errorHash}`,
    startedAt: new Date().toISOString(),
    trigger: payload.trigger,
    errorHash,
    engine: payload.options.engine,
    steps,
    outcome: 'failure',
  }

  let tmpDirPath: string | null = null
  let cleanupTmpDir: (() => Promise<void>) | null = null

  try {
    // Step 1: Create temp directory
    logStep(1, TOTAL_STEPS, 'Creating temporary workspace...')
    let stepStart = Date.now()
    const tmpResult = await createTmpDir({
      prefix: 'self-repair-',
      tmpdir: tmpdir(),
      unsafeCleanup: true,
    })
    tmpDirPath = tmpResult.path
    cleanupTmpDir = tmpResult.cleanup
    const cloneTarget = join(tmpDirPath, 'repo')
    recordStep(steps, 'create-temp-dir', stepStart, true)

    // Step 2: Clone repo
    logStep(2, TOTAL_STEPS, `Cloning ${payload.options.repo ?? 'repository'}...`)
    stepStart = Date.now()
    if (!payload.options.repo) {
      throw new Error('self-repair: repo is required to clone the repository.')
    }
    await cloneRepository(payload.options.repo, cloneTarget, payload.options.githubToken)
    recordStep(steps, 'clone-repo', stepStart, true)

    // Step 3: Inject skills
    logStep(3, TOTAL_STEPS, 'Injecting LLM skills...')
    stepStart = Date.now()
    const skillsDir = injectSkills(cloneTarget, payload.skillsSourcePath)
    recordStep(steps, 'inject-skills', stepStart, true)

    // Step 4: Bug report via LLM
    logStep(4, TOTAL_STEPS, `Running bug analysis with ${payload.options.engine}...`)
    stepStart = Date.now()
    const engine = createEngine(payload.options)
    const bugReportSkill = readSkillContent(skillsDir, 'bug-report')
    const bugReportPrompt = buildPrompt(payload, bugReportSkill)
    const bugReportResult = await engine.invoke({
      workingDirectory: cloneTarget,
      prompt: bugReportPrompt,
      verbose: payload.options.verbose,
    })

    if (!bugReportResult.success) {
      recordStep(steps, 'bug-report', stepStart, false, bugReportResult.output)
      throw new Error(`Bug report generation failed: ${bugReportResult.output}`)
    }

    const bugReport = parseJsonFromOutput<BugReport>(bugReportResult.output)
    if (!bugReport) {
      recordStep(steps, 'bug-report', stepStart, false, bugReportResult.output)
      throw new Error(
        'Failed to parse structured bug report from engine output. '
        + `Raw output:\n${bugReportResult.output.slice(0, 2000)}`,
      )
    }
    recordStep(steps, 'bug-report', stepStart, true, bugReportResult.output)

    // Step 5: Check for existing issue
    logStep(5, TOTAL_STEPS, 'Checking for existing issues...')
    stepStart = Date.now()
    const issueTracker = createIssueTracker(payload.options)
    const existingIssue = await issueTracker.findExistingIssue(errorHash)

    if (existingIssue) {
      logSuccess(`Found existing issue: ${existingIssue.url}`)
      runLog.issueUrl = existingIssue.url
      recordStep(steps, 'check-existing-issue', stepStart, true, `Existing: ${existingIssue.url}`)
    }
    else {
      // Create new issue
      const newIssue = await issueTracker.createIssue(bugReport, errorHash)
      runLog.issueUrl = newIssue.url
      recordStep(steps, 'create-issue', stepStart, true, `Created: ${newIssue.url}`)
    }

    // Step 6: Assess complexity and attempt repair if simple
    logStep(6, TOTAL_STEPS, 'Assessing complexity...')
    stepStart = Date.now()

    if (bugReport.complexity === 'complex') {
      logSuccess(
        'Bug is assessed as complex -- skipping automated repair. '
        + 'A detailed issue has been filed for manual review.',
      )
      recordStep(steps, 'complexity-check', stepStart, true, 'complex -- skipping repair')
      runLog.outcome = 'partial'
    }
    else {
      recordStep(steps, 'complexity-check', stepStart, true, 'simple -- attempting repair')

      // Attempt repair
      logStep(7, TOTAL_STEPS, 'Attempting automated repair...')
      stepStart = Date.now()
      const repairSkill = readSkillContent(skillsDir, 'repair')
      const repairContext = `## Bug Report\n\`\`\`json\n${JSON.stringify(bugReport, null, 2)}\n\`\`\``
      const repairPrompt = buildPrompt(payload, repairSkill, repairContext)
      const repairResult = await engine.invoke({
        workingDirectory: cloneTarget,
        prompt: repairPrompt,
        verbose: payload.options.verbose,
      })

      if (!repairResult.success) {
        recordStep(steps, 'repair', stepStart, false, repairResult.output)
        logError('Automated repair failed. The issue has been filed for manual review.')
        runLog.outcome = 'partial'
      }
      else {
        recordStep(steps, 'repair', stepStart, true, repairResult.output)

        // Create PR
        stepStart = Date.now()
        const makePrSkill = readSkillContent(skillsDir, 'make-pr')
        const prContext = [
          `## Bug Report\n\`\`\`json\n${JSON.stringify(bugReport, null, 2)}\n\`\`\``,
          `## Issue Reference\n${runLog.issueUrl ?? 'No issue URL available'}`,
          `## Changes Made\n${repairResult.output}`,
        ].join('\n\n')
        const makePrPrompt = buildPrompt(payload, makePrSkill, prContext)
        const makePrResult = await engine.invoke({
          workingDirectory: cloneTarget,
          prompt: makePrPrompt,
          verbose: payload.options.verbose,
        })

        if (!makePrResult.success) {
          recordStep(steps, 'make-pr', stepStart, false, makePrResult.output)
          logError('PR creation via engine failed.')
          runLog.outcome = 'partial'
        }
        else {
          const prInfo = parseJsonFromOutput<MakePrSkillOutput>(makePrResult.output)
          if (prInfo && payload.options.githubToken && payload.options.repo) {
            try {
              // Ensure the PR title is prefixed, even if the skill forgot
              const prTitle = prInfo.prTitle.toLowerCase().startsWith('self repair:')
                ? prInfo.prTitle
                : `Self repair: ${prInfo.prTitle}`

              const pullRequest = await createGitHubPullRequest(
                payload.options.githubToken,
                payload.options.repo,
                {
                  title: prTitle,
                  body: prInfo.prBody,
                  head: prInfo.branch,
                  base: 'main',
                },
              )
              runLog.pullRequestUrl = pullRequest.url
              recordStep(steps, 'make-pr', stepStart, true, pullRequest.url)
              logSuccess(`Pull request created: ${pullRequest.url}`)
              runLog.outcome = 'success'
            }
            catch (prError) {
              recordStep(steps, 'make-pr', stepStart, false, String(prError))
              logError(`GitHub PR creation failed: ${prError}`)
              runLog.outcome = 'partial'
            }
          }
          else {
            recordStep(steps, 'make-pr', stepStart, false, 'Missing PR info or tokens')
            runLog.outcome = 'partial'
          }
        }
      }
    }

    logSuccess('Repair pipeline complete.')
  }
  catch (error) {
    logError(`Pipeline failed: ${error}`)
    runLog.outcome = 'failure'
  }
  finally {
    // Write run log
    runLog.completedAt = new Date().toISOString()
    writeRunLog(runLog)
    pruneRunLogs(payload.options.maxLogCount)

    // Clean up temp directory
    if (cleanupTmpDir) {
      try {
        await cleanupTmpDir()
      }
      catch {
        // Best-effort cleanup
      }
    }
  }
}
