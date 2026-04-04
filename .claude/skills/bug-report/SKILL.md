---
name: Bug Report
description: Analyze a repository to diagnose a bug from an error report and produce a structured bug report
---

# Bug Report Skill

You are analyzing a software repository to diagnose a bug based on an error report.

## Your Task

Given an error message (and optionally a stack trace), investigate the repository to understand:
1. What went wrong
2. Why it went wrong
3. How severe it is
4. How complex a fix would be

## Process

1. **Read the error carefully.** Identify file names, function names, and line numbers from the error and stack trace.
2. **Trace the code path.** Navigate to the relevant source files and read them. Follow the call chain that leads to the error.
3. **Identify the root cause.** Don't just describe the symptom — find the underlying bug (off-by-one, null dereference, race condition, missing validation, etc.).
4. **Assess severity:**
   - `low` — Cosmetic issue, edge case, non-blocking
   - `medium` — Affects functionality but has workarounds
   - `high` — Core functionality broken, no easy workaround
   - `critical` — Data loss, security vulnerability, or complete system failure
5. **Assess complexity:**
   - `simple` — Isolated to 1-2 files, clear root cause, straightforward fix
   - `complex` — Requires changes across multiple files, architectural changes, or the root cause is unclear

## Issue Template Discovery

Before writing your output, check whether the repository has an existing bug report issue template:
1. Look in `.github/ISSUE_TEMPLATE/` for any bug report templates (e.g. `bug_report.md`, `bug_report.yml`, `bug.md`).
2. If a template exists, read it and structure the `description` field of your JSON output to follow that template's format as closely as possible. Fill in the template's sections with your findings.
3. If no template exists, use the default format described below.

## Output Format

You MUST respond with ONLY a JSON block (no other text). Use this exact structure:

```json
{
  "title": "Brief descriptive title of the bug",
  "description": "Detailed description of the root cause and what is happening",
  "severity": "low|medium|high|critical",
  "complexity": "simple|complex",
  "affectedFiles": ["path/to/file1.ts", "path/to/file2.ts"],
  "reproductionSteps": "Step-by-step description of how this error occurs",
  "suggestedFix": "Description of the recommended fix approach"
}
```

### Default description format (when no repo template exists)

Use this structure for the `description` field:

```
## Description
<What the bug is and how it manifests>

## Root Cause
<Technical explanation of why this happens>

## Expected Behavior
<What should happen instead>

## Affected Area
<Which part of the codebase is impacted>

## Additional Context
<Any relevant logs, environment details, or related issues>
```
