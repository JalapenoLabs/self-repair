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
