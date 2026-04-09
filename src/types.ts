// Copyright © 2026 self-repair contributors

import type { ChildProcess } from 'node:child_process'

// ─── Engine & Tracker Enums ─────────────────────────────────────────────────

export type SelfRepairEngine = 'claude' | 'codex'
export type IssueTrackerKind = 'github' | 'jira'

// ─── User-Facing Options ────────────────────────────────────────────────────

export type SelfRepairOptions = {
  /** Allow self-repair to run when NODE_ENV=production. Defaults to false. */
  runInProduction?: boolean

  /** Which LLM engine to use for diagnosis and repair. Defaults to 'claude'. */
  engine?: SelfRepairEngine

  /** OpenAI API token. Falls back to OPENAI_API_KEY env, then ~/.codex config. */
  OPENAI_API_TOKEN?: string

  /** Anthropic API token. Falls back to ANTHROPIC_API_KEY env, then ~/.claude config. */
  CLAUDE_API_TOKEN?: string

  /** GitHub personal access token. Required for issue/PR creation. */
  GITHUB_TOKEN?: string

  /** GitHub repository in owner/repo format. */
  repo?: string

  /** Optional text prepended to the LLM prompt on every repair invocation. */
  customPrePrompt?: string

  /** Arbitrary context object appended after the pre-prompt. */
  additionalPrePromptContext?: Record<string, unknown>

  /** Which issue tracker to file bugs against. Defaults to 'github'. */
  issueTracker?: IssueTrackerKind

  /** Maximum number of concurrent repair child processes. Defaults to 3. */
  maxParallelRepairs?: number

  /** Maximum number of run logs kept in ~/.self-repair/logs/. Defaults to 50. */
  maxLogCount?: number

  // ─── Jira-specific options ──────────────────────────────────────────────

  /** Jira instance hostname (e.g. 'mycompany.atlassian.net'). */
  jiraHost?: string

  /** Jira project key (e.g. 'ENG'). */
  jiraProject?: string

  /** Jira API token for authentication. */
  jiraApiToken?: string

  /** Jira account email for basic auth. */
  jiraEmail?: string

  /** Maximum conversation turns per engine invocation. Defaults to 50. */
  maxTurns?: number

  /** Enable verbose logging of prompts and engine output. */
  verbose?: boolean

  /**
   * When set, repair commits directly to the source branch of this PR number
   * instead of creating a new issue and PR. Useful for CI self-repair where
   * the fix should land on the branch that triggered the failure.
   */
  pullRequestNumber?: number
}

// ─── Resolved Options (defaults applied, tokens resolved) ───────────────────

export type ResolvedOptions = {
  runInProduction: boolean
  engine: SelfRepairEngine
  issueTracker: IssueTrackerKind
  maxParallelRepairs: number
  maxLogCount: number
  maxTurns: number
  claudeToken?: string
  openaiToken?: string
  githubToken?: string
  repo?: string
  customPrePrompt?: string
  additionalPrePromptContext?: Record<string, unknown>
  verbose: boolean
  pullRequestNumber?: number
  jiraHost?: string
  jiraProject?: string
  jiraApiToken?: string
  jiraEmail?: string
}

// ─── Repair Trigger ─────────────────────────────────────────────────────────

export type RepairTrigger = {
  /** The error message or description of the problem. */
  error: string
  /** Optional stack trace from the caught error. */
  stack?: string
  /** Timestamp when the error occurred. Auto-populated if omitted. */
  timestamp?: number
}

// ─── Bug Report (output from the bug-report skill) ─────────────────────────

export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical'
export type BugReportComplexity = 'simple' | 'complex'

export type BugReport = {
  title: string
  description: string
  severity: BugReportSeverity
  complexity: BugReportComplexity
  affectedFiles: string[]
  reproductionSteps: string
  suggestedFix?: string
}

// ─── Engine Contract ────────────────────────────────────────────────────────

export type EngineUsageStats = {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalCostUsd?: number
  numTurns?: number
}

export type EngineResult = {
  success: boolean
  output: string
  exitCode: number
  usage?: EngineUsageStats
}

export type EngineInvokeOptions = {
  workingDirectory: string
  prompt: string
  maxTurns: number
  verbose?: boolean
}

export type EngineContract = {
  readonly name: SelfRepairEngine
  invoke(options: EngineInvokeOptions): Promise<EngineResult>
}

// ─── Issue Tracker Contract ─────────────────────────────────────────────────

export type IssueReference = {
  tracker: IssueTrackerKind
  id: string
  url: string
}

export type IssueTrackerContract = {
  readonly kind: IssueTrackerKind
  validatePermissions(): Promise<void>
  findExistingIssue(errorHash: string): Promise<IssueReference | null>
  createIssue(bugReport: BugReport, errorHash: string): Promise<IssueReference>
}

// ─── Pull Request ───────────────────────────────────────────────────────────

export type PullRequestOptions = {
  title: string
  body: string
  head: string
  base: string
}

export type PullRequestResult = {
  url: string
  number: number
}

// ─── Child Worker Payload ───────────────────────────────────────────────────

export type ChildWorkerPayload = {
  options: ResolvedOptions
  trigger: RepairTrigger
  skillsSourcePath: string

  /**
   * When set, the pipeline works in this directory instead of cloning
   * into a temp folder. Used in CI mode (process.env.CI) to avoid
   * corepack issues, permission errors, and git safe directory problems
   * that arise from cloning into /tmp on hosted runners.
   *
   * In this mode, the pipeline resets the branch to its original state
   * after repair so subsequent CI steps aren't affected.
   */
  workingDirectory?: string
}

// ─── Make-PR Skill Output ───────────────────────────────────────────────────

export type MakePrSkillOutput = {
  branch: string
  commitMessage: string
  prTitle: string
  prBody: string
}

// ─── Run Log ────────────────────────────────────────────────────────────────

export type RunLogStep = {
  name: string
  status: 'success' | 'failure' | 'skipped'
  output?: string
  durationMs?: number
}

export type RunLog = {
  id: string
  startedAt: string
  completedAt?: string
  trigger: RepairTrigger
  errorHash: string
  engine: SelfRepairEngine
  steps: RunLogStep[]
  issueUrl?: string
  pullRequestUrl?: string
  outcome: 'success' | 'partial' | 'failure'
}

// ─── Concurrency Tracker ────────────────────────────────────────────────────

export type ConcurrencyTracker = {
  canSpawn(): boolean
  track(child: ChildProcess): void
  activeCount(): number
}
