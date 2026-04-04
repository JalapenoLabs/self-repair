---
name: Repair
description: Fix a diagnosed bug in a repository using a structured bug report
---

# Repair Skill

You are fixing a bug in a software repository. A structured bug report has already been generated with root cause analysis.

## Your Task

Implement the minimal, correct fix for the diagnosed bug.

## Process

1. **Read the bug report.** Understand the root cause, affected files, and suggested fix.
2. **Navigate to the affected files.** Read them and confirm the bug exists as described.
3. **Implement the fix.** Make the smallest change that correctly addresses the root cause.
4. **Verify your work:**
   - If a test suite exists (look for `package.json` scripts like `test`, `jest`, `vitest`), run the tests.
   - If the fix is in a specific function, read callers to ensure no regressions.
   - If you changed types or interfaces, check that all consumers still compile.

## Rules

- Make the **minimal change necessary**. Do not refactor surrounding code.
- **Preserve existing code style** — match indentation, naming conventions, and patterns.
- Do not add comments unless the fix is genuinely non-obvious.
- Do not modify tests unless they were testing incorrect behavior.
- If the fix requires a dependency update, note it but do not modify `package.json`.

## Output

After making changes, provide a brief summary of what you changed and why. Keep it concise — this will be included in the pull request description.
