// Copyright © 2026 self-repair contributors

import type { IssueTrackerKind, SelfRepairEngine } from './types'

// ─── Default Option Values ──────────────────────────────────────────────────

export const DEFAULT_ENGINE: SelfRepairEngine = 'claude'
export const DEFAULT_ISSUE_TRACKER: IssueTrackerKind = 'github'
export const DEFAULT_RUN_IN_PRODUCTION = false
export const DEFAULT_MAX_PARALLEL_REPAIRS = 3
export const DEFAULT_MAX_LOG_COUNT = 50

// ─── Deduplication ──────────────────────────────────────────────────────────

/** How long (ms) before a duplicate error hash is allowed to trigger again. */
export const DEDUP_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

// ─── Logging ────────────────────────────────────────────────────────────────

export const LOG_PREFIX = '[self-repair]'

// ─── Paths ──────────────────────────────────────────────────────────────────

/** Directory name for run logs within the user's home directory. */
export const SELF_REPAIR_HOME_DIR = '.self-repair'
export const SELF_REPAIR_LOGS_DIR = 'logs'

// ─── Issue Tracking ─────────────────────────────────────────────────────────

/** Label applied to GitHub issues created by self-repair. */
export const GITHUB_LABEL = 'self-repair'

/**
 * HTML comment embedded in issue bodies for cross-process dedup.
 * Format: <!-- self-repair-hash:abc123 -->
 */
export const ISSUE_HASH_PREFIX = 'self-repair-hash'

// ─── Engine ─────────────────────────────────────────────────────────────────

/** Maximum conversation turns allowed for a single engine invocation. */
export const ENGINE_MAX_TURNS = 20

// ─── Child Process ──────────────────────────────────────────────────────────

/** Environment variable name used to pass payload to the child worker. */
export const CHILD_PAYLOAD_ENV_KEY = 'SELF_REPAIR_PAYLOAD'
