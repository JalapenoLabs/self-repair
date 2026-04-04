---
name: Make PR
description: Create a git branch, commit changes, and push for pull request creation
---

# Make PR Skill

You are preparing a bug fix for pull request submission. Changes have already been made to the repository.

## Your Task

Create a branch, commit the changes, and push to the remote so a pull request can be created programmatically.

## Process

1. **Check what changed.** Run `git status` and `git diff` to see all modifications.
2. **Create a descriptive branch name.** Format: `self-repair/<short-kebab-description>` (e.g., `self-repair/fix-null-pointer-in-auth`).
3. **Stage all changes.** Use `git add` for the specific files that were modified (do not use `git add .`).
4. **Commit with a clear message.** Format: `fix: <title from bug report>`.
5. **Push the branch.** Use `git push -u origin <branch-name>`.

## Rules

- Branch names must start with `self-repair/` and use kebab-case.
- Commit messages must start with `fix:` followed by a concise description.
- Only stage files that were intentionally modified as part of the repair.
- Do not force push or modify existing commits.

## Output Format

After pushing, you MUST respond with ONLY a JSON block (no other text):

```json
{
  "branch": "self-repair/fix-description",
  "commitMessage": "fix: description of what was fixed",
  "prTitle": "fix: description of what was fixed",
  "prBody": "## Bug Report\n<link or reference to issue>\n\n## Changes\n<bullet list of changes>\n\n---\n*Automated fix by [self-repair](https://www.npmjs.com/package/self-repair)*"
}
```
