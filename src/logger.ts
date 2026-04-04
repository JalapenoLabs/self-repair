// Copyright © 2026 self-repair contributors

import chalk from 'chalk'

import { LOG_PREFIX } from './constants.js'

const prefix = chalk.bold.magenta(LOG_PREFIX)

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
