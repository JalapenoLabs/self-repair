# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-04-06

### Added

- **GitHub Actions composite action** -- Drop `uses: JalapenoLabs/self-repair@v1` into any workflow with `if: failure()`. Auto-detects PR vs push mode, auto-fetches failed step logs from the GitHub API. Zero-config error collection.
- **`--pr <number>` CLI flag** -- Commits fixes directly to a PR's source branch instead of creating a new issue + PR. Used automatically by the GitHub Action on pull_request events.
- **CI in-place mode** -- When `CI=true`, the pipeline works in the current checkout instead of cloning to `/tmp`. Avoids corepack, permission, and git safe directory issues on hosted/custom runners. Resets branch to original state after repair.
- **Agent fallback on commit failure** -- If the deterministic `commitAndPush` fails, the error is handed to a new LLM agent session that can diagnose and retry the git operations.
- **Deterministic CI log fetching** -- `src/ci/fetch-failed-logs.ts` retrieves failed step logs via the GitHub REST API before invoking the agent. Supports `--steps` flag with raw workflow outcomes to bypass `continue-on-error` masking.
- **Engine usage stats** -- Token counts, cost, and turn count always logged after each engine invocation (not gated by `--verbose`).
- **Token redaction** -- `src/redact.ts` sanitizes all verbose output, redacting Anthropic keys, OpenAI keys, GitHub tokens, and Bearer tokens before they reach stdout.
- **File-based skill output** -- Skills write `.self-repair/bug-report.md` and `.self-repair/pr-metadata.md` with YAML frontmatter instead of outputting JSON. Eliminates nested markdown fence parsing issues.

### Changed

- **`@openai/codex-sdk`** pinned to stable `0.118.0` (was `^0.119.0-alpha.10`).
- **Verbose logging** now shows tool inputs and `tool_use_summary` results, not just tool names. Prompt contents replaced with a size summary (`42 lines, 3847 chars`).
- **PR titles** always prefixed with `Self repair:` (case-insensitive enforcement).
- **PR comments** trimmed to a short summary (title, severity, affected files) instead of dumping the agent's full output.
- **Chalk styling** improved with `✓`/`⚠`/`✗` prefixes on success/warning/error messages.
- **Max engine turns** increased from 20 to 50.
- **Commit messages** written via `--file` to avoid shell interpretation issues with special characters.
- **Skills** updated with "Constraints" section forbidding `gh` CLI usage, URL browsing, and CI log fetching.

### Fixed

- **CI self-repair condition** now works for both push and PR events (`github.ref_name` for pushes, `github.base_ref` for PRs).
- **`continue-on-error` log masking** -- `fetch-failed-logs.ts` accepts `--steps` flag with raw workflow outcomes since the REST API always reports `conclusion: 'success'` for steps with `continue-on-error: true`.
- **PR branch checkout** uses explicit refspec fetch for shallow clones and branch names with special characters (e.g. `#`).
- **Skill injection** skipped in CI in-place mode (source and destination are the same directory).
- **Max turns detection** -- `error_max_turns` and `max_turns` terminal reasons are now caught, logged, and returned as `success: false`.
- **CLI exit code** -- pipeline returns outcome; CLI exits non-zero on failure.
- **`.js` import extensions** removed from all TypeScript imports.

### Security

- **Payload no longer passed via environment variable** -- Written to a temp file (`0600` permissions) instead. Child reads and immediately deletes it, preventing exposure via `/proc/<pid>/environ` on shared systems.
- **Verbose output redacted** -- All log output sanitized to strip API keys and tokens before reaching stdout/CI logs.

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

[0.2.1]: https://github.com/JalapenoLabs/self-repair/releases/tag/v0.2.1
[0.1.0]: https://github.com/JalapenoLabs/self-repair/releases/tag/v0.1.0
