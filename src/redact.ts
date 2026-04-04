// Copyright © 2026 self-repair contributors

import type { ResolvedOptions } from './types'

const REDACTED = '[REDACTED]'

/**
 * Patterns that match common API key formats. Each matched substring is
 * replaced so that tokens never appear in log output — even if the caller
 * accidentally includes them.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  // Anthropic keys: sk-ant-api03-...
  /sk-ant-[\w-]{10,}/g,
  // OpenAI keys: sk-proj-..., sk-svcacct-..., or sk-<org>-...
  /sk-(?!ant)[A-Za-z0-9-]{20,}/g,
  // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  // Generic "Bearer <token>" in log strings
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  // Jira / Atlassian API tokens (base64-ish, 24+ chars after common prefix)
  /ATATT[A-Za-z0-9+/=_-]{20,}/g,
]

// ─── Exact-Value Redaction ──────────────────────────────────────────────────

/**
 * Token values extracted from the user's resolved options.
 * Set once via `initRedaction` and used for exact-match replacement
 * before pattern-based fallback.
 */
let exactTokens: string[] = []

/**
 * Extracts non-empty token values from resolved options so they can be
 * matched verbatim in log output. Call this once after options are resolved.
 */
export function initRedaction(options: ResolvedOptions): void {
  const candidates = [
    options.claudeToken,
    options.openaiToken,
    options.githubToken,
    options.jiraApiToken,
  ]

  // Only keep values long enough to be real tokens (avoids matching
  // empty strings or trivially short values).
  exactTokens = candidates.filter(
    (value): value is string => typeof value === 'string' && value.length >= 8,
  )
}

/**
 * Resets the exact-token list. Intended for testing only.
 */
export function resetRedaction(): void {
  exactTokens = []
}

// ─── Redaction ───────────────────────────────────��──────────────────────────

/**
 * Replaces any recognised token in the given string with `[REDACTED]`.
 *
 * Two layers of defence:
 * 1. **Exact-value matching** — checks for the user's actual configured
 *    token strings (set via `initRedaction`). This catches tokens regardless
 *    of format, including ones that don't match any known pattern.
 * 2. **Pattern-based matching** — catches well-known key formats as a
 *    safety net for tokens that weren't passed through options (e.g. tokens
 *    embedded in engine output or third-party responses).
 */
export function redact(text: string): string {
  let result = text

  // Layer 1: exact matches against the user's own tokens
  for (const token of exactTokens) {
    if (result.includes(token)) {
      result = result.replaceAll(token, REDACTED)
    }
  }

  // Layer 2: pattern-based fallback
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED)
  }

  return result
}
