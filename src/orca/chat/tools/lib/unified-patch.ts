// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/tools/native-chat-unified-patch.ts; adapted for TermWeave.
// Cut: summarizeUnifiedPatch and unifiedPatchSections (used only by Orca's journal Diff tool, which TermWeave has no data for).

import { FILE_SECTION_START, isFileHeaderPair } from './diff.ts'
import { splitEditContent, type NativeChatEditLine } from './edit-model.ts'

const HUNK_RANGES = /^@@+ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

export type UnifiedPatchLines = {
  lines: NativeChatEditLine[]
  /** True only when every hunk carried real `@@` ranges. */
  lineNumbersKnown: boolean
  /** The patch text was clipped before it became rows. */
  truncated: boolean
}

/** Use real @@ ranges for file line numbers. Bare context anchors leave rows unnumbered rather than falsely starting at one.
 * implicitFirstHunk admits headerless initial chunks with unknown positions. */
export function editLinesFromUnifiedPatch(
  text: string,
  options?: { implicitFirstHunk?: boolean }
): UnifiedPatchLines | null {
  const lines: NativeChatEditLine[] = []
  const metadata = visitUnifiedPatch(
    text,
    (kind, raw, oldLineNumber, newLineNumber) => {
      lines.push({ kind, text: raw, oldLineNumber, newLineNumber })
    },
    options
  )
  return metadata ? { lines, ...metadata } : null
}

function visitUnifiedPatch(
  text: string,
  visit: (
    kind: NativeChatEditLine['kind'],
    text: string,
    oldLineNumber: number | null,
    newLineNumber: number | null
  ) => void,
  options?: { implicitFirstHunk?: boolean }
): Omit<UnifiedPatchLines, 'lines'> | null {
  const source = splitEditContent(text)
  const rows = source.lines
  let rowCount = 0
  let lastWasGap = false
  let oldNo: number | null = null
  let newNo: number | null = null
  let sawHunk = options?.implicitFirstHunk === true
  let ranged = true
  let inHunk = sawHunk

  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index] ?? ''
    if (raw.startsWith('@@')) {
      const match = HUNK_RANGES.exec(raw)
      oldNo = match ? Number(match[1]) : null
      newNo = match ? Number(match[3]) : null
      if (rowCount > 0 && !lastWasGap) {
        visit('gap', '', null, null)
        rowCount += 1
        lastWasGap = true
      }
      sawHunk = true
      inHunk = true
      continue
    }
    if (raw.startsWith('\\')) {
      continue
    }
    if (!inHunk && isFileHeaderPair(rows, index)) {
      index += 1
      continue
    }
    if (FILE_SECTION_START.test(raw)) {
      inHunk = false
      continue
    }
    if (!inHunk) {
      continue
    }
    ranged &&= oldNo !== null || newNo !== null
    rowCount += 1
    lastWasGap = false
    if (raw.startsWith('+')) {
      visit('add', raw.slice(1), null, newNo)
      newNo = newNo === null ? null : newNo + 1
    } else if (raw.startsWith('-')) {
      visit('del', raw.slice(1), oldNo, null)
      oldNo = oldNo === null ? null : oldNo + 1
    } else {
      visit('context', raw.startsWith(' ') ? raw.slice(1) : raw, oldNo, newNo)
      oldNo = oldNo === null ? null : oldNo + 1
      newNo = newNo === null ? null : newNo + 1
    }
  }
  return sawHunk && rowCount > 0 ? { lineNumbersKnown: ranged, truncated: source.truncated } : null
}

/** Rows for a whole-file add or delete, which legitimately number from 1. */
export function editLinesFromWholeFile(
  content: string,
  kind: 'add' | 'del'
): { lines: NativeChatEditLine[]; truncated: boolean } {
  const body = splitEditContent(content)
  return {
    lines: body.lines.map((text, index) => ({
      kind,
      text,
      oldLineNumber: kind === 'del' ? index + 1 : null,
      newLineNumber: kind === 'add' ? index + 1 : null
    })),
    truncated: body.truncated
  }
}
