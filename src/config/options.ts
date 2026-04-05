// Copyright © 2026 self-repair contributors

import type { ResolvedOptions, SelfRepairOptions } from '../types'

import {
  DEFAULT_ENGINE,
  DEFAULT_ISSUE_TRACKER,
  DEFAULT_MAX_LOG_COUNT,
  DEFAULT_MAX_PARALLEL_REPAIRS,
  DEFAULT_RUN_IN_PRODUCTION,
} from '../constants'
import { logWarning } from '../logger'
import { initRedaction } from '../redact'
import { resolveTokens } from './resolve-tokens'

// ─── Module-Level State ─────────────────────────────────────────────────────

let globalOptions: ResolvedOptions | null = null

/**
 * Configures self-repair with the given options. Merges with defaults,
 * resolves API tokens, and stores the result in module-level state.
 *
 * Returns the resolved options record, which can also be passed directly
 * to `registerCrashHandler` or `startSelfRepair`.
 */
export function setSelfRepairOptions(options: SelfRepairOptions): ResolvedOptions {
  const tokens = resolveTokens(options)

  const resolved: ResolvedOptions = {
    runInProduction: options.runInProduction ?? DEFAULT_RUN_IN_PRODUCTION,
    engine: options.engine ?? DEFAULT_ENGINE,
    issueTracker: options.issueTracker ?? DEFAULT_ISSUE_TRACKER,
    maxParallelRepairs: options.maxParallelRepairs ?? DEFAULT_MAX_PARALLEL_REPAIRS,
    maxLogCount: options.maxLogCount ?? DEFAULT_MAX_LOG_COUNT,
    verbose: options.verbose ?? false,
    pullRequestNumber: options.pullRequestNumber,
    claudeToken: tokens.claudeToken,
    openaiToken: tokens.openaiToken,
    githubToken: tokens.githubToken,
    repo: options.repo,
    customPrePrompt: options.customPrePrompt,
    additionalPrePromptContext: options.additionalPrePromptContext,
    jiraHost: options.jiraHost,
    jiraProject: options.jiraProject,
    jiraApiToken: options.jiraApiToken,
    jiraEmail: options.jiraEmail,
  }

  globalOptions = resolved
  initRedaction(resolved)
  return resolved
}

/**
 * Returns the current resolved options, or throws if `setSelfRepairOptions`
 * has not been called yet.
 */
export function getResolvedOptions(): ResolvedOptions {
  if (!globalOptions) {
    throw new Error(
      'self-repair: Options have not been configured. '
      + 'Call setSelfRepairOptions() before using self-repair.',
    )
  }
  return globalOptions
}

/**
 * Returns true if the current environment is production and the user
 * has not explicitly opted in to production mode.
 */
export function isProductionGuarded(): boolean {
  const options = globalOptions
  if (!options) {
    return false
  }

  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction && !options.runInProduction) {
    logWarning(
      'Production environment detected and runInProduction is false. '
      + 'Self-repair will not activate. Set runInProduction: true to override.',
    )
    return true
  }

  return false
}

/**
 * Clears stored options. Intended for testing only.
 */
export function resetOptions(): void {
  globalOptions = null
}
