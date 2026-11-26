// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/tools/native-chat-tool-line-view.ts; adapted for TermWeave.
// Changes: no call lifecycle (a failure is an error result; `running` comes from the caller) and no web
// search result links, which TermWeave's transcripts do not carry.

import {
  isToolCallBlock,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../../shared/index.ts'
import { diffFromToolCall } from './diff.ts'
import { nativeChatToolLineLabel, type NativeChatToolLineLabel } from './tool-line-label.ts'

export type NativeChatToolLineView = {
  call: NativeChatToolCallBlock | undefined
  label: NativeChatToolLineLabel | null
  /** What the row opens to: a call's paired result, or a lone result itself. */
  body: NativeChatToolResultBlock | undefined
  /** A lone result's first line, its row's only words. */
  resultPreview: string
  failed: boolean
  hasDetail: boolean
}

export function nativeChatToolLineView(
  block: NativeChatToolCallBlock | NativeChatToolResultBlock,
  result?: NativeChatToolResultBlock,
  running = false
): NativeChatToolLineView {
  const call = isToolCallBlock(block) ? block : undefined
  const label = call ? nativeChatToolLineLabel(call, result, running) : null
  const body = call ? result : block.type === 'tool-result' ? block : undefined
  const failed = result?.isError === true
  // An edit that has not landed has no output yet, but the change it proposes is worth opening.
  const hasDetail =
    body !== undefined ||
    label?.commandDetail != null ||
    (call !== undefined && diffFromToolCall(call.name, call.input) !== null)
  const resultPreview = call ? '' : (body?.output.split('\n')[0]?.slice(0, 80) ?? '')
  return { call, label, body, resultPreview, failed, hasDetail }
}
