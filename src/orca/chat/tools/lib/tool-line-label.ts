// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/tools/native-chat-tool-line-label.ts; adapted for TermWeave.
// Changes: TermWeave's calls have no lifecycle `state`, so the caller says whether the call is still
// running (live run, no result yet); a settled call without a result reads as done. No syntax colours,
// so no command language. No Codex `Diff` count paths.

import { nativeChatToolCategory } from './tool-icon.ts'
import {
  nativeChatFullCommand,
  nativeChatPlainCommandInput,
  nativeChatToolInputText
} from './tool-input-text.ts'
import { createToolInputDisplay, summarizeToolInput } from './tool-summary.ts'
import type { NativeChatToolCallBlock, NativeChatToolResultBlock } from '../../shared/index.ts'

/** Shared desktop/mobile tool verbs; desktop translates the English record. */
export const NATIVE_CHAT_TOOL_ROW_VERB_COPY = {
  running: 'Running',
  ran: 'Ran',
  reading: 'Reading',
  read: 'Read',
  triedRead: 'Tried to read',
  editing: 'Editing',
  edited: 'Edited',
  triedEdit: 'Tried to edit',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  subagent: 'Subagent',
  searching: 'Searching',
  searched: 'Searched',
  triedSearch: 'Tried to search',
  listing: 'Listing',
  listed: 'Listed',
  triedList: 'Tried to list',
  fetching: 'Fetching',
  fetched: 'Fetched',
  triedFetch: 'Tried to fetch',
  searchingWeb: 'Searching the web',
  searchedWeb: 'Searched the web',
  triedSearchWeb: 'Tried to search the web'
} as const

export type NativeChatToolRowVerb = keyof typeof NATIVE_CHAT_TOOL_ROW_VERB_COPY

export type NativeChatToolLineLabel = {
  verb: NativeChatToolRowVerb | null
  target: string
  title: string
  command: boolean
  filePath: string | null
  /** The whole command a command row ran; null when its input names none. */
  fullCommand: string | null
  /** The whole command, when the row had to shorten it. */
  commandDetail: string | null
}

function phaseVerb<T extends NativeChatToolRowVerb>(
  phase: { running: boolean; completed: boolean; failed: boolean },
  verbs: { running: T; completed: T; failed: T }
): T | null {
  if (phase.running) {
    return verbs.running
  }
  if (phase.completed) {
    return verbs.completed
  }
  return phase.failed ? verbs.failed : null
}

/** What a tool row says: the verb for its category and state, and the target it names. */
export function nativeChatToolLineLabel(
  call: NativeChatToolCallBlock,
  result?: NativeChatToolResultBlock,
  /** The run is live and this call has no result yet. */
  running = false
): NativeChatToolLineLabel {
  const display = createToolInputDisplay(call.input)
  const category = nativeChatToolCategory(call.name, call.mcpIdentity)
  const command = category === 'unknown'
  // Decision: a settled call without a result (cut transcript, stopped turn) still reads as done.
  const failed = result?.isError === true
  const completed = !running && !failed
  const phase = { running, completed, failed }
  let fullCommand: string | null = null
  let commandDetail: string | null = null
  let verb: NativeChatToolRowVerb | null = null
  let target = display.label
  let title = display.filePath ?? target
  // Only reads/edits target files.
  const filePath =
    (category === 'read' || category === 'fileChange') && display.filePath !== null
      ? display.filePath
      : null

  if (command) {
    fullCommand = nativeChatFullCommand(call.input)
    target = fullCommand === null ? target : summarizeToolInput(fullCommand)
    title = fullCommand ?? target
    if (fullCommand !== null) {
      const plainCommand = nativeChatPlainCommandInput(call.input)
      if (plainCommand?.trim() === fullCommand) {
        commandDetail = plainCommand === target ? null : plainCommand
      }
    }
    if (running) {
      verb = 'running'
    } else {
      verb = 'ran'
    }
  } else if (category === 'read' || category === 'fileChange') {
    const read = category === 'read'
    if (running) {
      verb = read ? 'reading' : 'editing'
    } else if (failed) {
      verb = read ? 'triedRead' : 'triedEdit'
    } else if (completed) {
      verb = read ? 'read' : 'edited'
    }
    target = filePath?.split(/[\\/]/).filter((part) => part.length > 0).at(-1) ?? target
  } else if (category === 'subAgentActivity') {
    verb = 'subagent'
    target = nativeChatToolInputText(call.input, 'description') ?? target
    // TermWeave: a session bot's journal counts the calls a sub-agent made into the summary (" · 4 steps")
    const steps = call.summary?.startsWith(`${target} · `) ? call.summary.slice(target.length) : ''
    target = `${target}${steps}`
    title = target
  } else if (category === 'search') {
    verb = phaseVerb(phase, { running: 'searching', completed: 'searched', failed: 'triedSearch' })
  } else if (category === 'listFiles') {
    verb = phaseVerb(phase, { running: 'listing', completed: 'listed', failed: 'triedList' })
  } else if (category === 'webSearch') {
    if (call.name.trim().toLowerCase() === 'webfetch') {
      const url = nativeChatToolInputText(call.input, 'url') ?? target
      target = url.replace(/^[a-z][a-z\d+.-]*:\/\//i, '')
      title = url
      verb = phaseVerb(phase, { running: 'fetching', completed: 'fetched', failed: 'triedFetch' })
    } else {
      verb = phaseVerb(phase, {
        running: 'searchingWeb',
        completed: 'searchedWeb',
        failed: 'triedSearchWeb'
      })
    }
  }
  return { verb, target, title, command, filePath, fullCommand, commandDetail }
}
