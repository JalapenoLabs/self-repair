// Copyright © 2026 self-repair contributors

// Re-export the contract type from the central types file.
// This module exists so issue-tracker internals can import from a local path.
export type {
  BugReport,
  IssueReference,
  IssueTrackerContract,
  IssueTrackerKind,
} from '../types'
