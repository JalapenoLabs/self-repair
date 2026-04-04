// Copyright © 2026 self-repair contributors

import type { EngineContract, SelfRepairEngine } from './types.js'

import type { ResolvedOptions } from '../types.js'

import { createClaudeEngine } from './claude.js'
import { createCodexEngine } from './codex.js'

type EngineFactory = (options: ResolvedOptions) => EngineContract

const engineFactoryByName = {
  claude: (options: ResolvedOptions): EngineContract => {
    return createClaudeEngine(options.claudeToken)
  },
  codex: (options: ResolvedOptions): EngineContract => {
    return createCodexEngine(options.openaiToken)
  },
} as const satisfies Record<SelfRepairEngine, EngineFactory>

/**
 * Creates an engine instance based on the configured engine name.
 */
export function createEngine(options: ResolvedOptions): EngineContract {
  const factory = engineFactoryByName[options.engine]
  return factory(options)
}
