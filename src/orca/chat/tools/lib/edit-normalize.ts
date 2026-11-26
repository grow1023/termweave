// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/tools/native-chat-edit-normalize.ts; adapted for TermWeave.
// Cut: resolved `editPatch` hunks, Codex app-server `changes[]` and the journal `Diff` tool. TermWeave's
// transcripts carry none of them (SPEC 2.3), so a card is built from the call's input only.

import { editFilesFromBeginPatch, unwrapBeginPatch } from './begin-patch.ts'
import { editLinesFromContents } from './edit-lcs.ts'
import {
  finalizeEditFile,
  pushEditGap,
  type NativeChatEditFile,
  type NativeChatEditLine
} from './edit-model.ts'
import { editLinesFromWholeFile } from './unified-patch.ts'

// NotebookEdit has only new cell text; diff cards would falsely mark unchanged cells added. Keep the generic view.
const CLAUDE_EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'str_replace'])
/** Command tools can quote patches without applying them. */
const COMMAND_PATCH_TOOLS = new Set(['exec', 'shell', 'local_shell'])
/** Dedicated patch tools apply their envelope; general command tools must explicitly apply it. */
const PATCH_ENVELOPE_TOOLS = new Set(['apply_patch', ...COMMAND_PATCH_TOOLS])

export function isEditToolName(name: string): boolean {
  return CLAUDE_EDIT_TOOLS.has(name) || PATCH_ENVELOPE_TOOLS.has(name)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Whole-file writes do not prove creation. Require positive evidence; falsely calling an overwrite new misrepresents every existing line. */
const CREATED_FILE_RESULT = /^\s*File created successfully/

function wholeContentChangeKind(
  input: Record<string, unknown>,
  output: string | undefined
): 'added' | 'edited' {
  if (text(input.command) === 'create') {
    return 'added'
  }
  return output !== undefined && CREATED_FILE_RESULT.test(output) ? 'added' : 'edited'
}

/** `MultiEdit` carries its snippet pairs in `edits[]`, not at the top level. */
function multiEditFiles(input: Record<string, unknown>, path: string): NativeChatEditFile[] | null {
  if (!Array.isArray(input.edits)) {
    return null
  }
  const lines: NativeChatEditLine[] = []
  let truncated = false
  for (const entry of input.edits) {
    const edit = record(entry)
    const oldString = text(edit?.old_string) ?? text(edit?.oldString)
    const newString = text(edit?.new_string) ?? text(edit?.newString)
    if (oldString === null && newString === null) {
      continue
    }
    // Each entry is its own snippet, so it starts a new region.
    pushEditGap(lines)
    const diffed = editLinesFromContents(oldString ?? '', newString ?? '')
    lines.push(...diffed.lines)
    truncated ||= diffed.truncated
  }
  if (lines.length === 0) {
    return null
  }
  return [
    finalizeEditFile({
      path,
      oldPath: null,
      changeKind: 'edited',
      lines,
      // A snippet pair cannot say where in the file it sits.
      lineNumbersKnown: false,
      truncated
    })
  ]
}

function claudeEditFiles(
  name: string,
  input: Record<string, unknown>,
  output: string | undefined
): NativeChatEditFile[] | null {
  const path = text(input.file_path) ?? text(input.path) ?? 'file'
  if (name === 'MultiEdit') {
    return multiEditFiles(input, path)
  }
  const oldString = text(input.old_string) ?? text(input.oldString)
  const newString = text(input.new_string) ?? text(input.newString)
  const content = text(input.content) ?? text(input.file_text)
  if (oldString === null && content !== null) {
    const whole = editLinesFromWholeFile(content, 'add')
    return [
      finalizeEditFile({
        path,
        oldPath: null,
        changeKind: wholeContentChangeKind(input, output),
        lines: whole.lines,
        lineNumbersKnown: true,
        truncated: whole.truncated
      })
    ]
  }
  if (oldString === null && newString === null) {
    return null
  }
  const diffed = editLinesFromContents(oldString ?? '', newString ?? content ?? '')
  return [
    finalizeEditFile({
      path,
      oldPath: null,
      changeKind: 'edited',
      lines: diffed.lines,
      // A snippet pair cannot say where in the file it sits.
      lineNumbersKnown: false,
      truncated: diffed.truncated
    })
  ]
}

/**
 * Decision: TermWeave has no call lifecycle, so a card needs a result that is not an error.
 * Orca also accepts `state === 'completed'` without a result; that state never exists here.
 */
export function editFilesFromToolPair(pair: {
  name: string
  input: unknown
  result?: { output?: string; isError?: boolean }
}): NativeChatEditFile[] | null {
  // Cards assert a landed edit; unanswered or failed calls retain generic tool/error views.
  if (pair.result === undefined || pair.result.isError === true) {
    return null
  }
  // Search envelopes only in eligible patch tools; Write payloads can quote unrelated patches and would hide the file actually written.
  if (PATCH_ENVELOPE_TOOLS.has(pair.name)) {
    const envelope = unwrapBeginPatch(pair.input, {
      requireApplyCommand: COMMAND_PATCH_TOOLS.has(pair.name)
    })
    const files = envelope ? editFilesFromBeginPatch(envelope) : []
    if (files.length > 0) {
      return files
    }
  }
  const input = record(pair.input)
  if (input && CLAUDE_EDIT_TOOLS.has(pair.name)) {
    return claudeEditFiles(pair.name, input, pair.result.output)
  }
  return null
}
