// Copyright © 2026 self-repair contributors

import type { EngineUsageStats } from './types'

import chalk from 'chalk'

import { LOG_PREFIX } from './constants'
import { redact } from './redact'

const prefix = chalk.bold.magenta(LOG_PREFIX)
const verbosePrefix = chalk.bold.magenta(LOG_PREFIX) + chalk.dim(' [verbose]')

export function logInfo(message: string): void {
  console.log(`${prefix} ${chalk.blue(message)}`)
}

export function logSuccess(message: string): void {
  console.log(`${prefix} ${chalk.bold.green('✓')} ${chalk.green(message)}`)
}

export function logWarning(message: string): void {
  console.warn(`${prefix} ${chalk.bold.yellow('⚠')} ${chalk.yellow(message)}`)
}

export function logError(message: string): void {
  console.error(`${prefix} ${chalk.bold.red('✗')} ${chalk.red(message)}`)
}

/**
 * Logs a numbered pipeline step, e.g. "[self-repair] [3/7] Cloning repository..."
 */
export function logStep(
  step: number,
  total: number,
  message: string,
): void {
  const stepTag = chalk.cyan.bold(`[${step}/${total}]`)
  console.log(`${prefix} ${stepTag} ${message}`)
}

/**
 * Logs engine usage statistics. Always displayed (not gated by verbose).
 * Shows token counts and cost when available.
 */
export function logUsage(label: string, usage: EngineUsageStats): void {
  const parts: string[] = []

  if (usage.numTurns !== undefined) {
    parts.push(`${chalk.white.bold(String(usage.numTurns))} turns`)
  }
  if (usage.inputTokens !== undefined) {
    parts.push(`${chalk.white.bold(usage.inputTokens.toLocaleString())} input tokens`)
  }
  if (usage.outputTokens !== undefined) {
    parts.push(`${chalk.white.bold(usage.outputTokens.toLocaleString())} output tokens`)
  }
  if (usage.cacheReadTokens) {
    parts.push(`${chalk.dim(usage.cacheReadTokens.toLocaleString())} cache read`)
  }
  if (usage.cacheWriteTokens) {
    parts.push(`${chalk.dim(usage.cacheWriteTokens.toLocaleString())} cache write`)
  }
  if (usage.totalCostUsd !== undefined) {
    parts.push(chalk.yellow.bold(`$${usage.totalCostUsd.toFixed(4)}`))
  }

  const summary = parts.join(chalk.dim(' · '))
  console.log(`${prefix} ${chalk.dim(`[${label}]`)} ${summary}`)
}

/**
 * Logs verbose output. Used for prompt contents and engine streaming output.
 * Only called when verbose mode is enabled -- the caller is responsible for
 * gating on the verbose flag.
 */
export function logVerbose(label: string, content: string): void {
  const header = `${verbosePrefix} ${chalk.dim(label)}`
  console.log(header)
  console.log(chalk.dim(redact(content)))
  console.log('')
}

/**
 * Logs a single line of verbose streaming output without extra newlines.
 * Used for real-time engine output during invocation.
 */
export function logVerboseStream(content: string): void {
  process.stdout.write(chalk.dim(redact(content)))
}
