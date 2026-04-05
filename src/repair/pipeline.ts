// Copyright © 2026 self-repair contributors

import type {
  BugReport,
  ChildWorkerPayload,
  MakePrSkillOutput,
  RunLog,
  RunLogStep,
} from '../types'

import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

import { dir as createTmpDir } from 'tmp-promise'

import { createEngine } from '../engine/factory'
import { checkoutPrBranch } from '../git/checkout-pr'
import { cloneRepository } from '../git/clone'
import { createIssueTracker } from '../issue-tracker/factory'
import { logError, logStep, logSuccess, logUsage, logWarning } from '../logger'
import { commentOnPullRequest } from '../pull-request/comment'
import { createGitHubPullRequest } from '../pull-request/github'
import { pruneRunLogs } from '../run-log/pruner'
import { writeRunLog } from '../run-log/writer'
import { injectSkills } from '../skills/inject'
import { computeErrorHash } from './deduplication'

const execFileAsync = promisify(execFile)

const TOTAL_STEPS_STANDARD = 7
const TOTAL_STEPS_PR_MODE = 6

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
 */
function parseJsonFromOutput<Shape>(output: string): Shape | null {
  const fenceMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]) as Shape
    }
    catch {
      // Fall through to raw parse
    }
  }

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
    output: output?.slice(0, 5000),
  })
}

/**
 * Commits and pushes all changes in the working directory.
 * Returns null on success, or an error description string on failure
 * so the caller can hand it to the agent for diagnosis.
 */
async function commitAndPush(
  repoDir: string,
  commitMessage: string,
): Promise<string | null> {
  try {
    const { stdout: status } = await execFileAsync(
      'git', [ 'status', '--porcelain' ],
      { cwd: repoDir },
    )
    if (!status.trim()) {
      return 'No changes detected in the working directory after repair.'
    }

    // Write commit message to a file to avoid shell interpretation
    // issues with special characters (e.g. --flags in the message).
    const { writeFileSync, unlinkSync } = await import('node:fs')
    const msgFile = join(repoDir, '.self-repair-commit-msg')
    writeFileSync(msgFile, commitMessage, 'utf-8')

    await execFileAsync('git', [ 'add', '-A' ], { cwd: repoDir })
    await execFileAsync(
      'git',
      [ 'commit', '--file', msgFile ],
      { cwd: repoDir },
    )

    try {
 unlinkSync(msgFile)
}
    catch {/* best-effort cleanup */}

    await execFileAsync('git', [ 'push' ], { cwd: repoDir })
    logSuccess('Changes committed and pushed.')
    return null
  }
  catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? ''
    const message = error instanceof Error ? error.message : String(error)
    return `${message}${stderr ? `\nstderr: ${stderr}` : ''}`
  }
}

/**
 * Saves the current HEAD sha so we can reset to it after in-place repair.
 */
async function saveHeadRef(repoDir: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git', [ 'rev-parse', 'HEAD' ],
    { cwd: repoDir },
  )
  return stdout.trim()
}

/**
 * Resets the working directory to the given ref, cleaning up any
 * changes made during in-place repair. Used in CI mode so subsequent
 * steps see the original state.
 */
async function resetToRef(repoDir: string, ref: string): Promise<void> {
  await execFileAsync('git', [ 'reset', '--hard', ref ], { cwd: repoDir })
  await execFileAsync('git', [ 'clean', '-fd' ], { cwd: repoDir })
}

// ─── Standard Pipeline (new issue + new PR) ─────────────────────────────────

async function executeStandardPipeline(
  payload: ChildWorkerPayload,
  engine: ReturnType<typeof createEngine>,
  cloneTarget: string,
  skillsDir: string,
  bugReport: BugReport,
  errorHash: string,
  steps: RunLogStep[],
  runLog: RunLog,
): Promise<void> {
  logStep(5, TOTAL_STEPS_STANDARD, 'Checking for existing issues...')
  let stepStart = Date.now()
  const issueTracker = createIssueTracker(payload.options)
  const existingIssue = await issueTracker.findExistingIssue(errorHash)

  if (existingIssue) {
    logSuccess(`Found existing issue: ${existingIssue.url}`)
    runLog.issueUrl = existingIssue.url
    recordStep(steps, 'check-existing-issue', stepStart, true, `Existing: ${existingIssue.url}`)
  }
  else {
    const newIssue = await issueTracker.createIssue(bugReport, errorHash)
    runLog.issueUrl = newIssue.url
    recordStep(steps, 'create-issue', stepStart, true, `Created: ${newIssue.url}`)
  }

  logStep(6, TOTAL_STEPS_STANDARD, 'Assessing complexity...')
  stepStart = Date.now()

  if (bugReport.complexity === 'complex') {
    logSuccess(
      'Bug is assessed as complex -- skipping automated repair. '
      + 'A detailed issue has been filed for manual review.',
    )
    recordStep(steps, 'complexity-check', stepStart, true, 'complex -- skipping repair')
    runLog.outcome = 'partial'
    return
  }

  recordStep(steps, 'complexity-check', stepStart, true, 'simple -- attempting repair')

  logStep(7, TOTAL_STEPS_STANDARD, 'Attempting automated repair...')
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
    return
  }

  recordStep(steps, 'repair', stepStart, true, repairResult.output)

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
    return
  }

  const prInfo = parseJsonFromOutput<MakePrSkillOutput>(makePrResult.output)
  if (prInfo && payload.options.githubToken && payload.options.repo) {
    try {
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

// ─── PR Repair Pipeline (commit to existing PR) ─────────────────────────────

async function executePrRepairPipeline(
  payload: ChildWorkerPayload,
  engine: ReturnType<typeof createEngine>,
  workDir: string,
  skillsDir: string,
  bugReport: BugReport,
  steps: RunLogStep[],
  runLog: RunLog,
  isInPlace: boolean,
): Promise<void> {
  const prNumber = payload.options.pullRequestNumber!

  // In clone mode, we need to checkout the PR branch.
  // In in-place mode, we're already on the PR branch.
  let branchName: string
  if (isInPlace) {
    const { stdout } = await execFileAsync(
      'git', [ 'rev-parse', '--abbrev-ref', 'HEAD' ],
      { cwd: workDir },
    )
    branchName = stdout.trim()
    logStep(5, TOTAL_STEPS_PR_MODE, `Working in-place on branch: ${branchName}`)
    recordStep(steps, 'in-place-branch', Date.now(), true, branchName)
  }
  else {
    logStep(5, TOTAL_STEPS_PR_MODE, `Checking out PR #${prNumber} branch...`)
    const stepStart = Date.now()

    if (!payload.options.githubToken || !payload.options.repo) {
      throw new Error('self-repair: githubToken and repo are required for PR repair mode.')
    }

    branchName = await checkoutPrBranch(
      workDir,
      prNumber,
      payload.options.githubToken,
      payload.options.repo,
    )
    recordStep(steps, 'checkout-pr-branch', stepStart, true, branchName)
  }

  // Attempt repair
  logStep(6, TOTAL_STEPS_PR_MODE, 'Attempting automated repair...')
  const stepStart = Date.now()
  const repairSkill = readSkillContent(skillsDir, 'repair')
  const repairContext = `## Bug Report\n\`\`\`json\n${JSON.stringify(bugReport, null, 2)}\n\`\`\``
  const repairPrompt = buildPrompt(payload, repairSkill, repairContext)
  const repairResult = await engine.invoke({
    workingDirectory: workDir,
    prompt: repairPrompt,
    verbose: payload.options.verbose,
  })

  if (!repairResult.success) {
    recordStep(steps, 'repair', stepStart, false, repairResult.output)
    logError(`Automated repair failed for PR #${prNumber}.`)
    runLog.outcome = 'partial'
    return
  }

  recordStep(steps, 'repair', stepStart, true, repairResult.output)

  // Try deterministic commit+push first (fast, handles most cases).
  // If it fails, hand the error to the agent so it can diagnose and retry.
  const pushStart = Date.now()
  const commitMessage = `Self repair: ${bugReport.title}`
  const commitError = await commitAndPush(workDir, commitMessage)

  if (commitError === null) {
    recordStep(steps, 'commit-to-pr', pushStart, true, `Pushed to ${branchName}`)
  }
  else {
    logWarning(`Deterministic commit failed: ${commitError}. Handing off to agent...`)

    const commitFixPrompt = [
      '# Commit and Push',
      '',
      'Your code changes are applied but the automated commit+push failed.',
      `The error was: ${commitError}`,
      '',
      'Please diagnose the issue, fix it, then stage, commit, and push your changes.',
      `Use this commit message: ${commitMessage}`,
      `You are on branch: ${branchName}`,
      '',
      '## Constraints',
      '- Do NOT use the `gh` CLI.',
      '- Do NOT fetch CI logs or browse URLs.',
      '- Just diagnose the git issue, fix it, commit, and push.',
    ].join('\n')

    const commitFixResult = await engine.invoke({
      workingDirectory: workDir,
      prompt: commitFixPrompt,
      verbose: payload.options.verbose,
    })

    if (!commitFixResult.success) {
      recordStep(steps, 'commit-to-pr', pushStart, false, commitFixResult.output)
      logError(`Agent could not commit+push for PR #${prNumber}.`)
      runLog.outcome = 'partial'
      return
    }

    recordStep(steps, 'commit-to-pr', pushStart, true, `Agent pushed to ${branchName}`)
  }

  // Post a comment on the PR
  if (payload.options.githubToken && payload.options.repo) {
    try {
      const commentBody = [
        `## Self-Repair Fix`,
        '',
        `**Bug:** ${bugReport.title}`,
        `**Severity:** \`${bugReport.severity}\``,
        '',
        `### Changes`,
        repairResult.output.slice(0, 2000),
        '',
        '---',
        '*Automated fix by [self-repair](https://www.npmjs.com/package/self-repair)*',
      ].join('\n')

      await commentOnPullRequest(
        payload.options.githubToken,
        payload.options.repo,
        prNumber,
        commentBody,
      )
    }
    catch (commentError) {
      logError(`Failed to post PR comment: ${commentError}`)
    }
  }

  runLog.pullRequestUrl = `https://github.com/${payload.options.repo}/pull/${prNumber}`
  logSuccess(`Fix committed to PR #${prNumber} on branch ${branchName}`)
  runLog.outcome = 'success'
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * The core repair pipeline. Clones the repo (or works in-place in CI),
 * invokes the LLM to diagnose the bug, and either files an issue + opens
 * a PR (standard mode) or commits directly to an existing PR (PR mode).
 */
export async function executeRepairPipeline(payload: ChildWorkerPayload): Promise<RunLog['outcome']> {
  const isPrMode = typeof payload.options.pullRequestNumber === 'number'
  const isInPlace = !!payload.workingDirectory
  const totalSteps = isPrMode
    ? TOTAL_STEPS_PR_MODE
    : TOTAL_STEPS_STANDARD

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

  if (isPrMode) {
    logStep(0, totalSteps, `PR repair mode: fixing PR #${payload.options.pullRequestNumber}`)
  }
  if (isInPlace) {
    logStep(0, totalSteps, `In-place mode: working in ${payload.workingDirectory}`)
  }

  let tmpDirPath: string | null = null
  let cleanupTmpDir: (() => Promise<void>) | null = null
  let originalHeadRef: string | null = null

  try {
    let workDir: string

    if (isInPlace) {
      // CI mode: work directly in the provided directory.
      // Save HEAD so we can reset after repair.
      workDir = payload.workingDirectory!
      originalHeadRef = await saveHeadRef(workDir)
      logStep(1, totalSteps, 'Using current checkout (CI mode)...')
      recordStep(steps, 'use-checkout', Date.now(), true, workDir)
    }
    else {
      // Standard mode: clone into a temp directory.
      logStep(1, totalSteps, 'Creating temporary workspace...')
      let stepStart = Date.now()
      const tmpResult = await createTmpDir({
        prefix: 'self-repair-',
        tmpdir: tmpdir(),
        unsafeCleanup: true,
      })
      tmpDirPath = tmpResult.path
      cleanupTmpDir = tmpResult.cleanup
      workDir = join(tmpDirPath, 'repo')
      recordStep(steps, 'create-temp-dir', stepStart, true)

      logStep(2, totalSteps, `Cloning ${payload.options.repo ?? 'repository'}...`)
      stepStart = Date.now()
      if (!payload.options.repo) {
        throw new Error('self-repair: repo is required to clone the repository.')
      }
      await cloneRepository(payload.options.repo, workDir, payload.options.githubToken)
      recordStep(steps, 'clone-repo', stepStart, true)
    }

    // Inject skills (skip in in-place mode -- skills are already in the repo)
    const skillStep = isInPlace ? 2 : 3
    let stepStart = Date.now()
    let skillsDir: string
    if (isInPlace) {
      skillsDir = join(workDir, '.claude', 'skills')
      logStep(skillStep, totalSteps, 'Using existing skills (in-place mode)...')
      recordStep(steps, 'use-existing-skills', stepStart, true, skillsDir)
    }
    else {
      logStep(skillStep, totalSteps, 'Injecting LLM skills...')
      skillsDir = injectSkills(workDir, payload.skillsSourcePath)
      recordStep(steps, 'inject-skills', stepStart, true)
    }

    // Bug report via LLM
    const diagStep = isInPlace ? 3 : 4
    logStep(diagStep, totalSteps, `Running bug analysis with ${payload.options.engine}...`)
    stepStart = Date.now()
    const engine = createEngine(payload.options)
    const bugReportSkill = readSkillContent(skillsDir, 'bug-report')
    const bugReportPrompt = buildPrompt(payload, bugReportSkill)
    const bugReportResult = await engine.invoke({
      workingDirectory: workDir,
      prompt: bugReportPrompt,
      verbose: payload.options.verbose,
    })

    if (bugReportResult.usage) {
      logUsage('bug-report', bugReportResult.usage)
    }

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

    // Branch into standard or PR repair mode
    if (isPrMode) {
      await executePrRepairPipeline(
        payload, engine, workDir, skillsDir, bugReport, steps, runLog, isInPlace,
      )
    }
    else {
      await executeStandardPipeline(
        payload, engine, workDir, skillsDir, bugReport, errorHash, steps, runLog,
      )
    }

    logSuccess('Repair pipeline complete.')
  }
  catch (error) {
    logError(`Pipeline failed: ${error}`)
    runLog.outcome = 'failure'
  }
  finally {
    runLog.completedAt = new Date().toISOString()
    writeRunLog(runLog)
    pruneRunLogs(payload.options.maxLogCount)

    // In-place mode: reset the working directory to its original state
    // so subsequent CI steps see the original checkout.
    if (isInPlace && originalHeadRef && payload.workingDirectory) {
      try {
        await resetToRef(payload.workingDirectory, originalHeadRef)
        logSuccess('Reset working directory to original state.')
      }
      catch (resetError) {
        logError(`Failed to reset working directory: ${resetError}`)
      }
    }

    // Clone mode: clean up temp directory
    if (cleanupTmpDir) {
      try {
        await cleanupTmpDir()
      }
      catch {
        // Best-effort cleanup
      }
    }
  }

  return runLog.outcome
}
