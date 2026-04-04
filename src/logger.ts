// Copyright © 2026 self-repair contributors

import chalk from 'chalk'

import { LOG_PREFIX } from './constants'
import { redact } from './redact'

const prefix = chalk.bold.magenta(LOG_PREFIX)
const verbosePrefix = chalk.bold.magenta(LOG_PREFIX) + chalk.dim(' [verbose]')

export function logInfo(message: string): void {
  console.log(`${prefix} ${chalk.blue(message)}`)
}

export function logSuccess(message: string): void {
  console.log(`${prefix} ${chalk.green(message)}`)
}

export function logWarning(message: string): void {
  console.warn(`${prefix} ${chalk.yellow(message)}`)
}

export function logError(message: string): void {
  console.error(`${prefix} ${chalk.red(message)}`)
}

/**
 * Logs a numbered pipeline step, e.g. "[self-repair] [3/7] Cloning repository..."
 */
export function logStep(
  step: number,
  total: number,
  message: string,
): void {
  const stepTag = chalk.cyan(`[${step}/${total}]`)
  console.log(`${prefix} ${stepTag} ${message}`)
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
