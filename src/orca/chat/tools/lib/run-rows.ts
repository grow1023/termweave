// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/runs/native-chat-tool-run-rows.ts; adapted for TermWeave.
// Cut: asides (Orca draws thoughts between calls; TermWeave's adapter keeps them in their own rows)
// and the ask split (TermWeave draws AskUserQuestion as a plain tool line).

import type { NativeChatBlock, NativeChatToolCallBlock, NativeChatToolResultBlock } from '../../shared/index.ts'
import { buildEditCards } from './edit-cards.ts'
import type { NativeChatEditFile } from './edit-model.ts'
import { nativeChatToolLineIdentity } from './line-identity.ts'
import { buildNativeChatTaskListRows, taskListPredecessors, type NativeChatTaskListRow } from './task-list-history.ts'
import { pairNativeChatToolResults } from './tool-pairs.ts'

/** One drawn row of an opened run. */
export type NativeChatToolRunRow =
  | { kind: 'tasks'; key: string; taskList: NativeChatTaskListRow }
  | { kind: 'edit'; key: string; editKey: string; files: NativeChatEditFile[] }
  | {
      kind: 'line'
      key: string
      block: NativeChatToolCallBlock | NativeChatToolResultBlock
      result: NativeChatToolResultBlock | undefined
      lineIdentity: string
    }

/** The run's rows in drawing order, with today's keys; pairing and grouping run once over the whole run. */
export function buildNativeChatToolRunRows(
  blocks: NativeChatBlock[],
  previousTodoWrite?: NativeChatToolCallBlock
): NativeChatToolRunRow[] {
  const taskLists = buildNativeChatTaskListRows(blocks, taskListPredecessors(previousTodoWrite))
  const { editCards, consumedResults } = buildEditCards(blocks)
  const { resultByCall, pairedResults } = pairNativeChatToolResults(blocks)
  const seen = new Map<string, number>()
  return blocks.flatMap((block, blockIndex): NativeChatToolRunRow[] => {
    const taskList = taskLists.rows.get(block)
    if (taskList) {
      return [{ kind: 'tasks', key: `tasks:${blockIndex}`, taskList }]
    }
    if (taskLists.consumedResults.has(block)) {
      return []
    }
    const edit = editCards.get(block)
    if (edit) {
      return [{ kind: 'edit', key: `edit:${edit.key}`, editKey: edit.key, files: edit.files }]
    }
    // A result its call now owns is drawn by that call's line, not as a row of its own.
    if (consumedResults.has(block) || pairedResults.has(block)) {
      return []
    }
    if (block.type !== 'tool-call' && block.type !== 'tool-result') {
      return []
    }
    const lineIdentity = nativeChatToolLineIdentity(block, seen)
    return [{
      kind: 'line',
      key: lineIdentity,
      block,
      result: block.type === 'tool-call' ? resultByCall.get(block) : undefined,
      lineIdentity
    }]
  })
}
