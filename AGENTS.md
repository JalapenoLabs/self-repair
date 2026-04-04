# Agents Guide

Instructions for AI agents working on this codebase.

## Project overview

`self-repair` is a standalone npm package that automatically diagnoses and repairs bugs in Node.js applications using LLM agents (Claude Code or Codex). It ships three entry points: a library (`src/index.ts`), a CLI (`src/cli.ts`), and a detached child worker (`src/repair/child-worker.ts`).

## Architecture

```
src/
  index.ts                  Public API (3 named exports)
  cli.ts                    CLI entry point (only place dotenv is imported)
  types.ts                  All shared type definitions
  constants.ts              Defaults, durations, labels, env var keys
  logger.ts                 Chalk-based [self-repair] prefixed logging

  config/                   Options management and token resolution
  crash-handler/            process.on('uncaughtException'/'unhandledRejection')
  repair/                   Pipeline, spawning, deduplication, concurrency
  engine/                   LLM engine polymorphism (Claude + Codex)
  issue-tracker/            Issue tracker polymorphism (GitHub + Jira)
  pull-request/             PR creation (always GitHub, even with Jira issues)
  run-log/                  Structured JSON logs at ~/.self-repair/logs/
  skills/                   Skill injection into cloned repos
  git/                      Repository cloning

.claude/skills/             LLM skill definitions shipped with the package
  bug-report/SKILL.md       Diagnose a bug from an error report
  repair/SKILL.md           Implement the minimal correct fix
  make-pr/SKILL.md          Create branch, commit, push, output PR metadata
```

## Key patterns

- **Provider polymorphism**: Both `engine/` and `issue-tracker/` use the same pattern: a contract type, one implementation per provider, and a factory with a `as const satisfies Record<Kind, Factory>` lookup table. Follow this pattern when adding new providers.
- **Named exports only**: No default exports anywhere except config files (`tsup.config.ts`, `vitest.config.ts`, `eslint.config.ts`).
- **No semicolons**: The entire codebase uses no semicolons (ESLint enforced).
- **Stroustrup brace style**: Opening brace on the same line, `catch`/`else`/`finally` on a new line after the closing brace.
- **Copyright headers**: Every `.ts` file must start with `// Copyright © 2026 self-repair contributors`. ESLint enforces this.
- **Import grouping**: Type imports first (with `import type`), then Core, then Lib/Misc. Separate groups with blank lines.
- **No dotenv in library mode**: `dotenv` is only imported in `src/cli.ts`. Never import it elsewhere -- it can conflict with consumer applications.

## Validation

Always run the full precommit check before finishing work:

```bash
yarn precommit
```

This runs `lint:fix`, `typecheck`, `test`, and `build` in sequence. All four must pass.

Individual commands:

```bash
yarn lint         # ESLint check (no auto-fix)
yarn lint:fix     # ESLint with auto-fix
yarn typecheck    # tsc --noEmit
yarn test         # vitest run
yarn build        # tsup (3 entry points: index, cli, child-worker)
```

## Testing

- Tests live alongside their source files as `<module>.test.ts`.
- Test runner: Vitest with `pool: 'forks'` and `restoreMocks: true`.
- Mock `../logger.js` in every test file to suppress chalk output.
- Use `vi.stubEnv()` for environment variable testing (cleaned up in `afterEach`).
- Tests must be self-contained -- no network calls, no reliance on external state.

## Adding a new engine

1. Create `src/engine/<name>.ts` implementing the `EngineContract` type from `src/types.ts`.
2. Add the engine name to the `SelfRepairEngine` union in `src/types.ts`.
3. Add a factory entry in `src/engine/factory.ts` (the lookup table).
4. Add any new token fields to `SelfRepairOptions` and `ResolvedOptions` in `src/types.ts`.
5. Wire up token resolution in `src/config/resolve-tokens.ts`.
6. Write tests in `src/engine/<name>.test.ts`.

## Adding a new issue tracker

1. Create `src/issue-tracker/<name>.ts` implementing `IssueTrackerContract` from `src/types.ts`.
2. Add the tracker kind to the `IssueTrackerKind` union in `src/types.ts`.
3. Add a factory entry in `src/issue-tracker/factory.ts`.
4. Add any required config fields to `SelfRepairOptions` and `ResolvedOptions`.
5. Update permission validation in `src/issue-tracker/permissions.ts` if the new tracker needs cross-provider checks.
6. Write tests in `src/issue-tracker/<name>.test.ts`.

## README maintenance

**If your changes affect any of the following, update `README.md` to match:**

- Public API (new exports, changed signatures, removed functions)
- Configuration options (new fields in `SelfRepairOptions`)
- CLI flags or behavior
- Supported engines or issue trackers
- Skill definitions (new skills, changed skill behavior)
- Run log format or location
- Default values (concurrency limit, dedup window, log count)
- Build/dev commands or contributing instructions
- The pipeline flow (new steps, changed ordering, new decision branches)

The README contains Mermaid diagrams for the pipeline flow. If you change the pipeline in `src/repair/pipeline.ts`, update both diagrams (the hero flowchart at the top and the detailed "How It Works" flowchart).

## CI

Two GitHub Actions workflows in `.github/workflows/`:

- **`validate.yml`**: Lint, typecheck, tests, build. All steps run independently with `continue-on-error`, then a summary step aggregates pass/fail.
- **`smoke.yml`**: Builds, then runs smoke tests (CLI `--help`, library import check, skill file existence).

If you add new build artifacts or public exports, update `smoke.yml` to verify them.
