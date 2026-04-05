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
4. **Commit using the local git identity.** Do NOT configure git user.name or user.email. Do NOT sign commits with `--gpg-sign` or `-S`. Do NOT use `Co-Authored-By` trailers. Simply commit using whatever identity is already configured in the repository or system git config. The commit should look like it was made by the repository owner, not by an AI.
5. **Commit message format:** `fix: <concise description of what was fixed>`.
6. **Push the branch.** Use `git push -u origin <branch-name>`.

## PR Template Discovery

Before writing your PR metadata, check whether the repository has an existing pull request template:
1. Look for `PULL_REQUEST_TEMPLATE.md` in `.github/`, `docs/`, or the repo root.
2. Also check `.github/PULL_REQUEST_TEMPLATE/` for multiple templates.
3. If a template exists, read it and structure the PR body to follow that template's format.
4. If no template exists, use the default PR body format shown below.

## Rules

- Branch names must start with `self-repair/` and use kebab-case.
- Only stage files that were intentionally modified as part of the repair.
- Do not force push or modify existing commits.
- Do not configure or override git identity settings.
- PR titles must be prefixed with `Self repair:` (e.g., `Self repair: fix null pointer in auth middleware`).

## Output

After pushing, you MUST write a file at `.self-repair/pr-metadata.md` in the repository root with this exact format:

```markdown
---
branch: self-repair/fix-description
commitMessage: "fix: description of what was fixed"
prTitle: "Self repair: fix description of what was fixed"
---

## Summary
<1-3 sentence overview of the fix>

## Bug Report
<link or reference to the issue>

## Changes
<bullet list of what was changed and why>

## Testing
<how the fix was verified, or what tests cover it>

---
*Automated fix by [self-repair](https://www.npmjs.com/package/self-repair)*
```

The content below the frontmatter becomes the PR body. If you found a repo PR template, use that format for the body instead.

After writing the file, confirm you have done so. Do not output the PR metadata as text — only write it to the file.
