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
} from './types'

// Core
export { setSelfRepairOptions } from './config/index'
export { registerCrashHandler } from './crash-handler/index'
export { startSelfRepair } from './repair/index'
