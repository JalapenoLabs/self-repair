// Copyright © 2026 self-repair contributors

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { logInfo } from '../logger'

/**
 * Resolves the absolute path to the skills directory shipped with this package.
 * The skills live at `<package-root>/.claude/skills/`.
 */
export function resolveSkillsSourcePath(): string {
  const currentFileDir = dirname(fileURLToPath(import.meta.url))
  // Navigate from dist/ or src/ up to the package root
  const packageRoot = resolve(currentFileDir, '..', '..')
  return join(packageRoot, '.claude', 'skills')
}

/**
 * Copies the self-repair skill definitions into a cloned repository so that
 * the LLM engine can discover and use them. Creates the `.claude/skills/`
 * directory structure in the target if it doesn't already exist.
 *
 * Returns the path to the injected skills directory.
 */
export function injectSkills(targetRepoPath: string, skillsSourcePath?: string): string {
  const source = skillsSourcePath ?? resolveSkillsSourcePath()
  const targetSkillsDir = join(targetRepoPath, '.claude', 'skills')

  if (!existsSync(source)) {
    throw new Error(
      `self-repair: Skills source directory not found at ${source}. `
      + 'This indicates a broken package installation.',
    )
  }

  mkdirSync(targetSkillsDir, { recursive: true })
  cpSync(source, targetSkillsDir, { recursive: true })

  logInfo(`Injected skills into ${targetSkillsDir}`)
  return targetSkillsDir
}
