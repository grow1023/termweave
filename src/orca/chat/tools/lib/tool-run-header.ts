// TermWeave's rewrite of stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
// src/shared/native-chat/tools/native-chat-tool-run-header.ts and native-chat-tool-run-outcome.ts (SPEC 5.4):
// Orca's version imports its ask rows and journal lifecycle; TermWeave has neither.

import { isToolCallBlock, isToolResultBlock, type NativeChatBlock, type NativeChatToolCallBlock } from '../../shared/index.ts'
import { describeLatestToolCall } from './tool-identity.ts'
import { nativeChatToolRunIconName, type NativeChatToolIconName } from './tool-icon.ts'
import { pairNativeChatToolResults } from './tool-pairs.ts'

/** Which fallback words a run with no per-tool sentence reads as. */
export type NativeChatToolRunFallbackLabel = 'result' | 'countOne' | 'countN'

export type NativeChatToolRunHeader = {
  live: boolean
  callCount: number
  failedCallCount: number
  /** Settled and no call failed: the header shows a check. */
  succeeded: boolean
  fallbackLabel: NativeChatToolRunFallbackLabel
  /** The call that is running now, while live. */
  runningCall: NativeChatToolCallBlock | null
  latestCallLabel: string | null
  iconName: NativeChatToolIconName | null
}

/**
 * Decision (SPEC 5.4): the run is live only while the turn works on it (`live`) and its last call
 * has no result yet. A failure is an error result. A settled call without a result (a stopped turn)
 * is not counted apart: TermWeave cannot tell a stop from a cut transcript.
 */
export function nativeChatToolRunHeader(blocks: readonly NativeChatBlock[], live: boolean): NativeChatToolRunHeader {
  const calls = blocks.filter(isToolCallBlock)
  const { resultByCall } = pairNativeChatToolResults(blocks)
  const lastCall = calls.at(-1)
  const isLive = live && lastCall !== undefined && !resultByCall.has(lastCall)
  const failedCallCount = blocks.filter((block) => isToolResultBlock(block) && block.isError === true).length
  const callCount = calls.length
  return {
    live: isLive,
    callCount,
    failedCallCount,
    succeeded: !isLive && failedCallCount === 0,
    fallbackLabel: callCount === 0 ? 'result' : callCount === 1 ? 'countOne' : 'countN',
    runningCall: isLive ? (lastCall ?? null) : null,
    latestCallLabel: isLive && lastCall ? describeLatestToolCall(lastCall) : null,
    iconName: nativeChatToolRunIconName(calls)
  }
}
