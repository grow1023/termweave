// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/tools/native-chat-tool-identity.ts and native-chat-tool-activity.ts; adapted for TermWeave.
// Cut: web search result links (TermWeave's transcripts carry none), toolExecutionMetadata (server side),
// and the live-call selector (TermWeave has no call lifecycle; tool-run-header.ts decides liveness).
// `formatNativeChatDuration` is copied from src/shared/native-chat/transcript/turns/native-chat-turn-status.ts.

import type { NativeChatMcpIdentity, NativeChatToolCallBlock } from '../../shared/index.ts'
import { createToolInputDisplay } from './tool-summary.ts'

export function formatNativeChatDuration(seconds: number): string {
  const totalSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m ${remainingSeconds}s`
}

export function formatToolDuration(
  durationMs: unknown,
  formatMilliseconds: (value: number) => string = (value) => `${value}ms`
): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return null
  }
  return durationMs < 1000
    ? formatMilliseconds(Math.round(durationMs))
    : formatNativeChatDuration(durationMs / 1000)
}

/** Only explicit provider identity or the reserved MCP prefix proves a tool is MCP. */
export function mcpToolIdentity(
  name: string,
  identity?: NativeChatMcpIdentity
): NativeChatMcpIdentity | null {
  const match = /^mcp__([^\s]+?)__(\S+)$/.exec(name.trim())
  const server = identity?.server ?? match?.[1]
  const tool = identity?.tool ?? match?.[2]
  if (!server || !tool) {
    return null
  }
  const label = server.replace(/[_-]+/g, ' ')
  return {
    server: label.charAt(0).toUpperCase() + label.slice(1),
    tool: tool.replace(/[_-]+/g, ' ')
  }
}

/** Shell-command rows use terminal activity wording/glyphs rather than named-tool presentation. */
export const COMMAND_TOOL_NAMES: ReadonlySet<string> = new Set([
  'bash',
  'shell',
  'powershell',
  'terminal',
  'execute',
  'run_command',
  'run_commands',
  'run_shell_command',
  'shell_command',
  'exec_command',
  'run_terminal_cmd',
  'run_terminal_command'
])

export function isCommandToolName(name: string): boolean {
  return COMMAND_TOOL_NAMES.has(name.trim().toLowerCase())
}

/** Tense-free command/tool arguments; surrounding activity text carries state so this never claims a just-finished call still runs. */
export function describeLatestToolCall(call: NativeChatToolCallBlock): string {
  const preview = createToolInputDisplay(call.input).label
  if (isCommandToolName(call.name)) {
    return preview || call.name
  }
  return preview ? `${call.name} ${preview}` : call.name
}
