# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-04

### Added

- **Core pipeline** -- 7-step repair orchestration: clone, skill injection, LLM diagnosis, issue search, issue creation, repair attempt, and PR creation.
- **Crash handler** -- `registerCrashHandler()` registers `uncaughtException` and `unhandledRejection` handlers that automatically trigger repair. Returns a Promise for async permission validation (awaiting is optional).
- **Manual trigger** -- `startSelfRepair()` for programmatic invocation from API error handlers, frontend reporters, or any custom integration.
- **CLI** -- `self-repair --error "message"` entry point for CI pipelines, scripts, and manual triage. Supports `--verbose` for full prompt and engine output logging. Reads `.env` via dotenv (CLI mode only, never in library mode).
- **Claude Code engine** -- Invokes Claude via `@anthropic-ai/claude-agent-sdk` `query()` with full tool access, streaming output capture, and verbose mode support.
- **OpenAI Codex engine** -- Invokes Codex via `@openai/codex-sdk` with `run()` (default) or `runStreamed()` (verbose mode).
- **GitHub issue tracker** -- Creates and searches issues via `@octokit/rest`. Embeds error hashes in issue bodies for cross-process deduplication. Auto-creates the `self-repair` label.
- **Jira issue tracker** -- Creates and searches issues via native `fetch` against Jira REST API v3. No SDK dependency.
- **GitHub PR creation** -- Opens pull requests via Octokit. Always uses GitHub regardless of issue tracker. PR titles prefixed with `Self repair:`.
- **Error deduplication** -- SHA-256 hashing with normalization (strips absolute paths, line numbers, timestamps). 10-minute sliding window prevents duplicate repair processes.
- **Concurrency limiting** -- Configurable `maxParallelRepairs` (default 3). Tracks active child processes and drops excess requests.
- **Detached child process spawning** -- Repair runs in a fully detached subprocess (`unref()`). Parent process can exit or restart immediately without affecting repair.
- **3-tier token resolution** -- Explicit option > environment variable > dotfile (`~/.claude`, `~/.codex`).
- **Production safety** -- Completely inert when `NODE_ENV=production` unless `runInProduction: true` is set.
- **LLM skills** -- Three `.claude/skills/<name>/SKILL.md` files shipped with the package: `bug-report` (structured diagnosis), `repair` (minimal fix), `make-pr` (branch + commit + push). Skills check for repo-specific issue/PR templates before falling back to defaults.
- **Run logging** -- Structured JSON logs written to `~/.self-repair/logs/` with automatic pruning to `maxLogCount` (default 50).
- **Provider polymorphism** -- Engines and issue trackers use factory lookup tables (`as const satisfies Record<Kind, Factory>`), making it straightforward to add new providers.
- **Test suite** -- 129 unit tests across 18 suites covering factories, deduplication, concurrency, options, token resolution, logger, pipeline orchestration, child spawning, engine invocation, issue tracking, and PR creation. Separate E2E test (`yarn test:e2e`) runs the full pipeline with a real Claude invocation against a synthetic buggy repo.
- **CI** -- GitHub Actions `validate.yml` with lint, typecheck, unit tests, build, smoke tests, E2E test, junit dashboard, and self-repair dogfooding on failure. Manual `publish.yml` for npm releases.

[0.1.0]: https://github.com/JalapenoLabs/self-repair/releases/tag/v0.1.0
