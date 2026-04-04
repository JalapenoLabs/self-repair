// Copyright © 2026 self-repair contributors

export type {
  BugReport,
  BugReportComplexity,
  BugReportSeverity,
  EngineContract,
  EngineResult,
  IssueReference,
  IssueTrackerContract,
  IssueTrackerKind,
  RepairTrigger,
  ResolvedOptions,
  RunLog,
  SelfRepairEngine,
  SelfRepairOptions,
} from './types.js'

// Core
export { setSelfRepairOptions } from './config/index.js'
export { registerCrashHandler } from './crash-handler/index.js'
export { startSelfRepair } from './repair/index.js'
