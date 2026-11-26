// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/tools/native-chat-edit-cards.ts; adapted for TermWeave.
// Cut: the edit summaries for Orca's turn diff rollup (not ported) and the journal Diff envelope.

import type {
  NativeChatBlock,
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../shared/index.ts'
import { editFilesFromToolPair, isEditToolName } from './edit-normalize.ts'
import type { NativeChatEditFile, NativeChatEditLine } from './edit-model.ts'
import { pairToolBlocks } from './tool-pairs.ts'

/** A card's rows as unified patch text, for its copy button. */
export function nativeChatEditFilePatchText(lines: readonly NativeChatEditLine[]): string {
  return lines
    .filter((line) => line.kind !== 'gap')
    .map((line) => `${line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}${line.text}`)
    .join('\n')
}

const normalizedEdits = new WeakMap<
  NativeChatBlock,
  {
    result: NativeChatBlock | undefined
    files: NativeChatEditFile[] | null
  }
>()

export function normalizedToolEditFiles(
  call: NativeChatToolCallBlock,
  result: NativeChatToolResultBlock | undefined
): NativeChatEditFile[] | null {
  const cached = normalizedEdits.get(call)
  if (cached && cached.result === result) {
    return cached.files
  }
  const files = editFilesFromToolPair({
    name: call.name,
    input: call.input,
    ...(result ? { result: { output: result.output, isError: result.isError } } : {})
  })
  normalizedEdits.set(call, { result, files })
  return files
}

export type EditCardModel = {
  editCards: Map<NativeChatBlock, { files: NativeChatEditFile[]; key: string }>
  /** Result blocks the card already speaks for, so they render no second row. */
  consumedResults: Set<NativeChatBlock>
}

/** Fold results into landed-edit cards only. Unconfirmed edits retain generic tool/error rows. */
export function buildEditCards(blocks: NativeChatBlock[]): EditCardModel {
  const editCards: EditCardModel['editCards'] = new Map()
  const consumedResults: EditCardModel['consumedResults'] = new Set()
  for (const [index, pair] of pairToolBlocks(blocks).entries()) {
    const call = pair.call
    if (!call || !isEditToolName(call.name)) {
      continue
    }
    const files = normalizedToolEditFiles(call, pair.result)
    if (!files || files.length === 0) {
      continue
    }
    editCards.set(call, { files, key: `${call.name}:${index}` })
    if (pair.result) {
      consumedResults.add(pair.result)
    }
  }
  return { editCards, consumedResults }
}
