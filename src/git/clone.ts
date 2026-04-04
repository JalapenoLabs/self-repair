// Copyright © 2026 self-repair contributors

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { logInfo } from '../logger.js'

const execFileAsync = promisify(execFile)

/**
 * Clones a GitHub repository into the target directory using a shallow clone
 * for speed. Authenticates via the provided token if available.
 */
export async function cloneRepository(
  repo: string,
  targetDirectory: string,
  token?: string,
): Promise<void> {
  const repoUrl = token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`

  logInfo(`Cloning ${repo} into ${targetDirectory}`)

  await execFileAsync('git', [
    'clone',
    '--depth=1',
    repoUrl,
    targetDirectory,
  ])
}
