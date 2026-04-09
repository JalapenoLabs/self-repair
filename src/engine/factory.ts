// Copyright © 2026 self-repair contributors

import type { EngineContract, SelfRepairEngine } from './types'

import type { ResolvedOptions } from '../types'

import { createClaudeEngine } from './claude'
import { createCodexEngine } from './codex'

type EngineFactory = (options: ResolvedOptions) => EngineContract

const engineFactoryByName = {
  claude: (options: ResolvedOptions): EngineContract => {
    return createClaudeEngine(options.claudeToken, options.model)
  },
  codex: (options: ResolvedOptions): EngineContract => {
    return createCodexEngine(options.openaiToken, options.model)
  },
} as const satisfies Record<SelfRepairEngine, EngineFactory>

/**
 * Creates an engine instance based on the configured engine name.
 */
export function createEngine(options: ResolvedOptions): EngineContract {
  const factory = engineFactoryByName[options.engine]
  return factory(options)
}
