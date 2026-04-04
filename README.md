<p align="center">
  <img src="https://img.shields.io/npm/v/self-repair?style=flat-square&color=cb3837" alt="npm version" />
  <img src="https://img.shields.io/github/actions/workflow/status/JalapenoLabs/self-repair/validate.yml?branch=main&style=flat-square&label=validate" alt="CI" />
  <img src="https://img.shields.io/github/actions/workflow/status/JalapenoLabs/self-repair/smoke.yml?branch=main&style=flat-square&label=smoke" alt="Smoke" />
  <img src="https://img.shields.io/npm/l/self-repair?style=flat-square" alt="license" />
  <img src="https://img.shields.io/node/v/self-repair?style=flat-square" alt="node" />
</p>

# self-repair

**Automatic bug diagnosis and repair for Node.js applications, powered by LLM agents.**

When your app crashes, `self-repair` spawns a fully detached background process that clones your repo, analyzes the failure with Claude or Codex, files a detailed bug report on GitHub or Jira, and -- if the fix is straightforward -- opens a pull request. Your app keeps running (or restarts) without ever blocking on the repair.

```
npm crash  -->  clone repo  -->  LLM diagnosis  -->  issue filed  -->  PR opened
   |                                                                       |
   '--- app restarts immediately                          fix ready for review
```

---

## Features

- **Crash handler** -- Register once at startup. Fatal `uncaughtException` and `unhandledRejection` errors automatically trigger repair.
- **Manual trigger** -- Call `startSelfRepair()` from anywhere: API error handlers, frontend error reporters, health checks, CI scripts.
- **CLI** -- `self-repair --error "message"` for use in pipelines, cron jobs, or manual triage.
- **Dual engine support** -- [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) and [OpenAI Codex](https://www.npmjs.com/package/@openai/codex-sdk), invoked via their official SDKs.
- **Dual issue tracker** -- GitHub Issues or Jira, with provider polymorphism so adding more is trivial.
- **Error deduplication** -- SHA-256 hashing with path/timestamp normalization and a 10-minute sliding window. No duplicate issues, no runaway child processes.
- **Concurrency limiting** -- Configurable max parallel repairs (default 3). Excess requests are dropped gracefully.
- **Production safe** -- Completely inert in production unless you explicitly opt in.
- **Run logs** -- Structured JSON logs at `~/.self-repair/logs/` with automatic pruning.
- **Zero side effects** -- `dotenv` is only loaded in CLI mode. The library import never touches your environment.

---

## Install

```bash
# yarn
yarn add self-repair

# npm
npm install self-repair

# pnpm
pnpm add self-repair
```

Requires **Node.js 20+**.

---

## Quick Start

### 1. Crash handler (recommended)

```typescript
import { setSelfRepairOptions, registerCrashHandler } from 'self-repair'

setSelfRepairOptions({
  engine: 'claude',
  repo: 'your-org/your-repo',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
})

// Registers process.on('uncaughtException') and process.on('unhandledRejection').
// Returns a Promise that validates permissions in the background -- await is optional.
registerCrashHandler()
```

That's it. If your app crashes, a detached child process spins up in the background, clones your repo, diagnoses the bug, files an issue, and opens a PR if the fix is simple.

### 2. Manual trigger

```typescript
import { setSelfRepairOptions, startSelfRepair } from 'self-repair'

setSelfRepairOptions({
  engine: 'claude',
  repo: 'your-org/your-repo',
})

// From an API error handler, frontend error reporter, etc.
app.post('/api/report-error', (req, res) => {
  startSelfRepair({ error: req.body.message })
  res.status(202).send({ status: 'repair-initiated' })
})
```

### 3. CLI

```bash
# Basic usage
self-repair --error "TypeError: Cannot read property 'id' of undefined"

# With options
self-repair \
  --error "Connection refused on port 5432" \
  --stack "at Database.connect (src/db.ts:42:5)" \
  --engine codex \
  --repo your-org/your-repo \
  --issue-tracker jira

# Reads tokens from .env in CLI mode
echo "GITHUB_TOKEN=ghp_..." > .env
self-repair --error "some error"
```

---

## Configuration

```typescript
setSelfRepairOptions({
  // ─── Core ──────────────────────────────────────────────
  engine: 'claude',           // 'claude' | 'codex'
  repo: 'owner/repo',        // GitHub repository
  runInProduction: false,     // Set true to allow in NODE_ENV=production

  // ─── Tokens ────────────────────────────────────────────
  // Each falls back to env vars, then dotfiles (~/.claude, ~/.codex)
  CLAUDE_API_TOKEN: '...',    // Falls back to ANTHROPIC_API_KEY env
  OPENAI_API_TOKEN: '...',    // Falls back to OPENAI_API_KEY env
  GITHUB_TOKEN: '...',        // Falls back to GITHUB_TOKEN env

  // ─── Issue tracking ────────────────────────────────────
  issueTracker: 'github',     // 'github' | 'jira'
  jiraHost: 'company.atlassian.net',
  jiraProject: 'ENG',
  jiraApiToken: '...',
  jiraEmail: 'bot@company.com',

  // ─── Limits ────────────────────────────────────────────
  maxParallelRepairs: 3,      // Max concurrent repair processes
  maxLogCount: 50,            // Max run logs in ~/.self-repair/logs/

  // ─── Prompt customization ──────────────────────────────
  customPrePrompt: 'This is a Next.js 14 app using the App Router.',
  additionalPrePromptContext: {
    framework: 'next',
    database: 'postgres',
    deployment: 'vercel',
  },
})
```

All options are optional except `repo` (required for cloning and issue/PR creation).

### Token resolution order

| Token | 1st (explicit) | 2nd (env var) | 3rd (dotfile) |
|---|---|---|---|
| Claude | `CLAUDE_API_TOKEN` | `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` | `~/.claude/credentials.json` |
| OpenAI | `OPENAI_API_TOKEN` | `OPENAI_API_KEY` | `~/.codex/credentials.json` |
| GitHub | `GITHUB_TOKEN` | `GITHUB_TOKEN` | -- |

---

## How It Works

```
1. Error detected (crash handler or manual trigger)
2. Deduplication check (skip if same error hash seen in last 10 min)
3. Concurrency check (skip if at max parallel repairs)
4. Spawn detached child process (parent can exit/restart immediately)
   │
   └─ Child process:
      5. Create temp directory
      6. git clone --depth=1 (authenticated, shallow)
      7. Inject LLM skills into .claude/skills/
      8. Invoke engine with /bug-report skill → structured JSON
      9. Search issue tracker for existing issue (by error hash)
     10. Create issue if none exists
     11. If complexity is "simple":
         a. Invoke engine with /repair skill → code changes
         b. Invoke engine with /make-pr skill → branch + commit + push
         c. Create PR via GitHub API
     12. Write run log to ~/.self-repair/logs/
     13. Clean up temp directory
```

### Skills

`self-repair` ships three LLM skills as `.claude/skills/<name>/SKILL.md` files:

| Skill | Purpose |
|---|---|
| **bug-report** | Analyze the repo and error to produce a structured diagnosis (severity, complexity, affected files, root cause, suggested fix) |
| **repair** | Implement the minimal correct fix based on the bug report |
| **make-pr** | Create a branch, commit, push, and output PR metadata |

Skills are automatically injected into each cloned repo so the LLM agent can discover and use them.

### Error deduplication

Errors are normalized before hashing to ensure semantically identical errors produce the same hash regardless of:
- Absolute file paths (collapsed to basenames)
- Line/column numbers (stripped)
- Timestamps (stripped)

The hash (first 16 chars of SHA-256) is also embedded in created issues as an HTML comment (`<!-- self-repair-hash:abc123 -->`), enabling cross-process deduplication via issue search.

---

## Jira Support

When using Jira for issue tracking, PR creation still goes through GitHub (Jira can't create PRs). You'll need both sets of credentials:

```typescript
setSelfRepairOptions({
  issueTracker: 'jira',
  jiraHost: 'company.atlassian.net',
  jiraProject: 'ENG',
  jiraApiToken: process.env.JIRA_API_TOKEN,
  jiraEmail: 'bot@company.com',

  // Still needed for cloning and PR creation
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  repo: 'your-org/your-repo',
})
```

---

## Run Logs

Every repair run writes a structured JSON log to `~/.self-repair/logs/`:

```
~/.self-repair/
  logs/
    2026-04-03T21-30-00-000Z-a1b2c3d4e5f6g7h8.json
    2026-04-03T22-15-00-000Z-i9j0k1l2m3n4o5p6.json
```

Each log contains the trigger, error hash, engine used, step-by-step results (with durations), and the final outcome (issue URL, PR URL, or failure reason).

Logs are automatically pruned to `maxLogCount` (default 50) on each run.

---

## API Reference

### `setSelfRepairOptions(options: SelfRepairOptions): ResolvedOptions`

Configures self-repair globally. Merges with defaults, resolves tokens. Returns the resolved options record which can be passed to other functions.

### `registerCrashHandler(): Promise<void>`

Registers `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers. Returns a Promise that validates issue tracker permissions in the background. The Promise does **not** need to be awaited -- handlers are registered synchronously.

### `startSelfRepair(trigger: RepairTrigger): void`

Triggers a repair in a detached child process. Returns immediately (fire-and-forget).

```typescript
type RepairTrigger = {
  error: string        // Error message or description
  stack?: string       // Optional stack trace
  timestamp?: number   // Auto-populated if omitted
}
```

---

## Production Safety

By default, `self-repair` is completely inert when `NODE_ENV=production`:

- `registerCrashHandler()` logs a warning and returns without registering handlers.
- `startSelfRepair()` returns immediately without spawning.
- No network calls, no child processes, no filesystem writes.

To enable in production, explicitly opt in:

```typescript
setSelfRepairOptions({
  runInProduction: true,
  // ...
})
```

---

## Contributing

```bash
git clone git@github.com:JalapenoLabs/self-repair.git
cd self-repair
corepack enable
yarn install

# Development
yarn dev          # Watch mode build
yarn test:watch   # Watch mode tests

# Validation
yarn lint         # ESLint check
yarn lint:fix     # ESLint auto-fix
yarn typecheck    # TypeScript type check
yarn test         # Run tests
yarn build        # Production build
```

---

## License

[MIT](LICENSE)
