// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/input/task-lists/native-chat-task-list-history.ts; adapted for TermWeave.
// Cut: nativeChatTaskListPredecessors (the integrator finds the previous TodoWrite call) and the
// `failed` call state, which TermWeave does not have.

import {
  nativeChatTaskListTool,
  normalizeNativeChatTaskList,
  type NativeChatTaskList,
  type NativeChatTaskListTool
} from './task-list.ts'
import type { NativeChatBlock, NativeChatToolCallBlock } from '../../shared/index.ts'
import { pairToolBlocks } from './tool-pairs.ts'

export type NativeChatTaskListPredecessors = Partial<
  Record<NativeChatTaskListTool, NativeChatToolCallBlock>
>
export type NativeChatTaskListRow = { list: NativeChatTaskList; previous?: NativeChatTaskList }

function taskListFromCall(call: NativeChatToolCallBlock): NativeChatTaskList | null {
  return normalizeNativeChatTaskList(call.name, call.input)
}

/** The predecessor record for one earlier call, keyed by its own tool (TodoWrite or update_plan). */
export function taskListPredecessors(
  previous: NativeChatToolCallBlock | undefined
): NativeChatTaskListPredecessors {
  const tool = previous ? nativeChatTaskListTool(previous.name) : null
  return previous && tool ? { [tool]: previous } : {}
}

export function buildNativeChatTaskListRows(
  blocks: readonly NativeChatBlock[],
  predecessors: NativeChatTaskListPredecessors = {}
): {
  rows: Map<NativeChatBlock, NativeChatTaskListRow>
  consumedResults: Set<NativeChatBlock>
} {
  const rows = new Map<NativeChatBlock, NativeChatTaskListRow>()
  const consumedResults = new Set<NativeChatBlock>()
  const previous = new Map<NativeChatTaskListTool, NativeChatTaskList>()
  for (const call of Object.values(predecessors)) {
    if (!call) {
      continue
    }
    const tool = nativeChatTaskListTool(call.name)
    const list = taskListFromCall(call)
    if (tool && list) {
      previous.set(tool, list)
    }
  }
  for (const { call, result } of pairToolBlocks(blocks)) {
    if (!call || result?.isError) {
      continue
    }
    const tool = nativeChatTaskListTool(call.name)
    const list = taskListFromCall(call)
    if (!tool || !list) {
      continue
    }
    rows.set(call, { list, previous: previous.get(tool) })
    previous.set(tool, list)
    if (result) {
      consumedResults.add(result)
    }
  }
  return { rows, consumedResults }
}
