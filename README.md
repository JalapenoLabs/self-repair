<p align="center">
  <a href="https://www.npmjs.com/package/self-repair"><img src="https://img.shields.io/npm/v/self-repair?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/JalapenoLabs/self-repair/actions/workflows/validate.yml"><img src="https://github.com/JalapenoLabs/self-repair/actions/workflows/validate.yml/badge.svg?branch=main" alt="Validate" /></a>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square" alt="node >= 20" />
</p>

# self-repair

**Automatic bug diagnosis and repair for Node.js applications, powered by LLM agents.**

When your app crashes, `self-repair` spawns a fully detached background process that clones your repo, analyzes the failure with Claude or Codex, files a detailed bug report on GitHub or Jira, and -- if the fix is straightforward -- opens a pull request. Your app keeps running (or restarts) without ever blocking on the repair.

<!-- Mermaid source (edit this, then re-encode to base64 for the img tag below):
flowchart LR
    A["App crashes"] --> B["Detached child\nprocess spawns"]
    A -. "app restarts\nimmediately" .-> R["App running"]
    B --> C["Clone repo"]
    C --> D["LLM diagnosis"]
    D --> E["Issue filed"]
    E --> F{"Simple\nfix?"}
    F -- Yes --> G["PR opened"]
    F -- No --> H["Manual review"]

    style A fill:#e74c3c,color:#fff,stroke:none
    style G fill:#27ae60,color:#fff,stroke:none
    style H fill:#f39c12,color:#fff,stroke:none
    style R fill:#3498db,color:#fff,stroke:none
-->
<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IExSCiAgICBBWyJBcHAgY3Jhc2hlcyJdIC0tPiBCWyJEZXRhY2hlZCBjaGlsZFxucHJvY2VzcyBzcGF3bnMiXQogICAgQSAtLiAiYXBwIHJlc3RhcnRzXG5pbW1lZGlhdGVseSIgLi0+IFJbIkFwcCBydW5uaW5nIl0KICAgIEIgLS0+IENbIkNsb25lIHJlcG8iXQogICAgQyAtLT4gRFsiTExNIGRpYWdub3NpcyJdCiAgICBEIC0tPiBFWyJJc3N1ZSBmaWxlZCJdCiAgICBFIC0tPiBGeyJTaW1wbGVcbmZpeD8ifQogICAgRiAtLSBZZXMgLS0+IEdbIlBSIG9wZW5lZCJdCiAgICBGIC0tIE5vIC0tPiBIWyJNYW51YWwgcmV2aWV3Il0KCiAgICBzdHlsZSBBIGZpbGw6I2U3NGMzYyxjb2xvcjojZmZmLHN0cm9rZTpub25lCiAgICBzdHlsZSBHIGZpbGw6IzI3YWU2MCxjb2xvcjojZmZmLHN0cm9rZTpub25lCiAgICBzdHlsZSBIIGZpbGw6I2YzOWMxMixjb2xvcjojZmZmLHN0cm9rZTpub25lCiAgICBzdHlsZSBSIGZpbGw6IzM0OThkYixjb2xvcjojZmZmLHN0cm9rZTpub25lCg==" alt="self-repair pipeline flow" />
</p>

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

<!-- Mermaid source (edit this, then re-encode to base64 for the img tag below):
flowchart TD
    A["Error detected"] --> B{"Duplicate?\n(10-min window)"}
    B -- Yes --> Z1["Skip"]
    B -- No --> C{"At max\nconcurrency?"}
    C -- Yes --> Z2["Drop"]
    C -- No --> D["Spawn detached\nchild process"]
    A -. "parent continues\nor restarts" .-> P["App running"]

    subgraph child ["Child process (fully detached)"]
        direction TB
        D --> E["Create temp dir"]
        E --> F["git clone --depth=1"]
        F --> G["Inject LLM skills"]
        G --> H["Engine: /bug-report\n→ structured JSON"]
        H --> I{"Existing\nissue?"}
        I -- No --> J["Create issue"]
        I -- Yes --> K["Link to existing"]
        J --> L{"Complexity?"}
        K --> L
        L -- simple --> M["Engine: /repair\n→ code changes"]
        M --> N["Engine: /make-pr\n→ branch + push"]
        N --> O["Create PR via\nGitHub API"]
        L -- complex --> Q["Skip repair\n(issue only)"]
        O --> W["Write run log"]
        Q --> W
        W --> X["Clean up temp dir"]
    end

    style A fill:#e74c3c,color:#fff,stroke:none
    style P fill:#3498db,color:#fff,stroke:none
    style Z1 fill:#95a5a6,color:#fff,stroke:none
    style Z2 fill:#95a5a6,color:#fff,stroke:none
    style O fill:#27ae60,color:#fff,stroke:none
    style Q fill:#f39c12,color:#fff,stroke:none
    style child fill:#f8f9fa,stroke:#dee2e6,color:#333
-->
<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IFRECiAgICBBWyJFcnJvciBkZXRlY3RlZCJdIC0tPiBCeyJEdXBsaWNhdGU/XG4oMTAtbWluIHdpbmRvdykifQogICAgQiAtLSBZZXMgLS0+IFoxWyJTa2lwIl0KICAgIEIgLS0gTm8gLS0+IEN7IkF0IG1heFxuY29uY3VycmVuY3k/In0KICAgIEMgLS0gWWVzIC0tPiBaMlsiRHJvcCJdCiAgICBDIC0tIE5vIC0tPiBEWyJTcGF3biBkZXRhY2hlZFxuY2hpbGQgcHJvY2VzcyJdCiAgICBBIC0uICJwYXJlbnQgY29udGludWVzXG5vciByZXN0YXJ0cyIgLi0+IFBbIkFwcCBydW5uaW5nIl0KCiAgICBzdWJncmFwaCBjaGlsZCBbIkNoaWxkIHByb2Nlc3MgKGZ1bGx5IGRldGFjaGVkKSJdCiAgICAgICAgZGlyZWN0aW9uIFRCCiAgICAgICAgRCAtLT4gRVsiQ3JlYXRlIHRlbXAgZGlyIl0KICAgICAgICBFIC0tPiBGWyJnaXQgY2xvbmUgLS1kZXB0aD0xIl0KICAgICAgICBGIC0tPiBHWyJJbmplY3QgTExNIHNraWxscyJdCiAgICAgICAgRyAtLT4gSFsiRW5naW5lOiAvYnVnLXJlcG9ydFxu4oaSIHN0cnVjdHVyZWQgSlNPTiJdCiAgICAgICAgSCAtLT4gSXsiRXhpc3Rpbmdcbmlzc3VlPyJ9CiAgICAgICAgSSAtLSBObyAtLT4gSlsiQ3JlYXRlIGlzc3VlIl0KICAgICAgICBJIC0tIFllcyAtLT4gS1siTGluayB0byBleGlzdGluZyJdCiAgICAgICAgSiAtLT4gTHsiQ29tcGxleGl0eT8ifQogICAgICAgIEsgLS0+IEwKICAgICAgICBMIC0tIHNpbXBsZSAtLT4gTVsiRW5naW5lOiAvcmVwYWlyXG7ihpIgY29kZSBjaGFuZ2VzIl0KICAgICAgICBNIC0tPiBOWyJFbmdpbmU6IC9tYWtlLXByXG7ihpIgYnJhbmNoICsgcHVzaCJdCiAgICAgICAgTiAtLT4gT1siQ3JlYXRlIFBSIHZpYVxuR2l0SHViIEFQSSJdCiAgICAgICAgTCAtLSBjb21wbGV4IC0tPiBRWyJTa2lwIHJlcGFpclxuKGlzc3VlIG9ubHkpIl0KICAgICAgICBPIC0tPiBXWyJXcml0ZSBydW4gbG9nIl0KICAgICAgICBRIC0tPiBXCiAgICAgICAgVyAtLT4gWFsiQ2xlYW4gdXAgdGVtcCBkaXIiXQogICAgZW5kCgogICAgc3R5bGUgQSBmaWxsOiNlNzRjM2MsY29sb3I6I2ZmZixzdHJva2U6bm9uZQogICAgc3R5bGUgUCBmaWxsOiMzNDk4ZGIsY29sb3I6I2ZmZixzdHJva2U6bm9uZQogICAgc3R5bGUgWjEgZmlsbDojOTVhNWE2LGNvbG9yOiNmZmYsc3Ryb2tlOm5vbmUKICAgIHN0eWxlIFoyIGZpbGw6Izk1YTVhNixjb2xvcjojZmZmLHN0cm9rZTpub25lCiAgICBzdHlsZSBPIGZpbGw6IzI3YWU2MCxjb2xvcjojZmZmLHN0cm9rZTpub25lCiAgICBzdHlsZSBRIGZpbGw6I2YzOWMxMixjb2xvcjojZmZmLHN0cm9rZTpub25lCiAgICBzdHlsZSBjaGlsZCBmaWxsOiNmOGY5ZmEsc3Ryb2tlOiNkZWUyZTYsY29sb3I6IzMzMwo=" alt="self-repair detailed pipeline" />
</p>

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

## GitHub Actions

Drop self-repair into any workflow to automatically diagnose and fix CI failures:

```yaml
- name: Self-repair on failure
  if: failure()
  uses: JalapenoLabs/self-repair@v1
  with:
    error: "CI failed: ${{ steps.build.outcome }}"
    claude-api-token: ${{ secrets.ANTHROPIC_API_KEY }}
```

On PRs, self-repair auto-detects the PR number and commits fixes directly to the source branch. On pushes, it creates a new issue and opens a PR.

| Input | Required | Default | Description |
|---|---|---|---|
| `error` | Yes | | Error message to diagnose |
| `engine` | No | `claude` | LLM engine (`claude` or `codex`) |
| `repo` | No | Current repo | GitHub repository (`owner/repo`) |
| `claude-api-token` | No | | Anthropic API key |
| `openai-api-token` | No | | OpenAI API key |
| `github-token` | No | `github.token` | GitHub token for issues/PRs |
| `verbose` | No | `false` | Log prompts and engine output |
| `version` | No | `latest` | self-repair npm version to use |

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

## We Drink Our Own Kool-Aid

This repo's CI pipeline uses `self-repair` on itself. If any validation step (lint, typecheck, tests, build) fails on `main` or `develop`, the workflow invokes `self-repair` against this repo to diagnose the failure, file an issue, and attempt a fix -- fully automated, no human in the loop.

Check it out in [`.github/workflows/validate.yml`](.github/workflows/validate.yml).

---

## License

[MIT](LICENSE)
