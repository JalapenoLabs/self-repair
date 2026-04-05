// Copyright © 2026 self-repair contributors

//
// CLI entry point. This is the only place where dotenv is imported,
// keeping it isolated from library consumers.

import 'dotenv/config'

import { Command } from 'commander'

import { getResolvedOptions, setSelfRepairOptions } from './config/index'
import { logError, logInfo } from './logger'
import { executeRepairPipeline } from './repair/pipeline'
import { resolveSkillsSourcePath } from './skills/inject'

const program = new Command()

program
  .name('self-repair')
  .description('Automatically diagnose and repair bugs using LLM agents')
  .version('0.1.0')
  .requiredOption('--error <message>', 'Error message or description to diagnose')
  .option('--stack <trace>', 'Stack trace from the error')
  .option('--engine <engine>', 'LLM engine to use (claude or codex)', 'claude')
  .option('--repo <owner/repo>', 'GitHub repository (owner/repo format)')
  .option(
    '--issue-tracker <tracker>',
    'Issue tracker to use (github or jira)',
    'github',
  )
  .option('--run-in-production', 'Allow running in production environments')
  .option('--max-log-count <count>', 'Maximum number of run logs to keep', '50')
  .option('--verbose', 'Log prompts and engine output for debugging')
  .option(
    '--pr <number>',
    'Repair an existing PR by committing fixes to its branch (skips issue/PR creation)',
  )
  .action(async (flags: {
    error: string
    stack?: string
    engine: string
    repo?: string
    issueTracker: string
    runInProduction?: boolean
    maxLogCount: string
    verbose?: boolean
    pr?: string
  }) => {
    try {
      logInfo('Starting self-repair in CLI mode...')

      setSelfRepairOptions({
        engine: flags.engine as 'claude' | 'codex',
        repo: flags.repo ?? process.env.SELF_REPAIR_REPO,
        runInProduction: flags.runInProduction ?? false,
        issueTracker: flags.issueTracker as 'github' | 'jira',
        maxLogCount: parseInt(flags.maxLogCount, 10),
        verbose: flags.verbose ?? false,
        pullRequestNumber: flags.pr ? parseInt(flags.pr, 10) : undefined,
        // Tokens are resolved from process.env (populated by dotenv)
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        CLAUDE_API_TOKEN: process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY,
        OPENAI_API_TOKEN: process.env.OPENAI_API_KEY,
        // Jira options from env
        jiraHost: process.env.JIRA_HOST,
        jiraProject: process.env.JIRA_PROJECT,
        jiraApiToken: process.env.JIRA_API_TOKEN,
        jiraEmail: process.env.JIRA_EMAIL,
      })

      const options = getResolvedOptions()

      // In CI mode, work in the current checkout directory instead of
      // cloning into /tmp. This avoids corepack, permission, and git
      // safe directory issues on hosted/custom runners.
      const workingDirectory = process.env.CI
        ? process.cwd()
        : undefined

      const outcome = await executeRepairPipeline({
        options,
        trigger: {
          error: flags.error,
          stack: flags.stack,
          timestamp: Date.now(),
        },
        skillsSourcePath: resolveSkillsSourcePath(),
        workingDirectory,
      })

      if (outcome === 'failure') {
        process.exit(1)
      }
    }
    catch (error) {
      logError(`CLI error: ${error instanceof Error ? error.message : error}`)
      process.exit(1)
    }
  })

program.parse()
