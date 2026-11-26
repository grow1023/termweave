/**
 * Hand-written synthetic SDK frames for the translator tests, shaped after a measured run of the
 * Agent SDK (spec section 10). Tool names, paths and ids are invented; nothing comes from a real log.
 */

type Frame = Record<string, unknown>;

export const SESSION = "00000000-0000-4000-8000-000000000001";
export const CWD = "/home/u/project"; // leakscan:allow: test fixture

export const hook = (subtype: "hook_started" | "hook_response"): Frame => ({ type: "system", subtype, session_id: SESSION, hook_name: "SessionStart:fake" });
export const uiInvalidate = (): Frame => ({ type: "system", subtype: "ui_invalidate", session_id: SESSION });
export const statusFrame = (): Frame => ({ type: "system", subtype: "status", status: null, session_id: SESSION });
export const state = (value: "running" | "requires_action" | "idle"): Frame => ({ type: "system", subtype: "session_state_changed", state: value, session_id: SESSION });

export const init = (sessionId = SESSION, model = "claude-test-1"): Frame => ({
  type: "system", subtype: "init", session_id: sessionId, model, cwd: CWD, permissionMode: "default",
  tools: ["FakeRead", "FakeShell"], mcp_servers: [], slash_commands: [],
});

/** Claude's replay of a sent message (`--replay-user-messages`): same uuid as the send. */
export const replay = (uuid: string, text: string): Frame => ({
  type: "user", uuid, session_id: SESSION, parent_tool_use_id: null, isReplay: true,
  message: { role: "user", content: [{ type: "text", text }] },
});

export const messageStart = (id: string): Frame => ({ type: "stream_event", session_id: SESSION, parent_tool_use_id: null, event: { type: "message_start", message: { id, model: "claude-test-1" } } });
export const blockStart = (index: number, kind: "text" | "thinking" | "tool_use"): Frame => ({
  type: "stream_event", session_id: SESSION, parent_tool_use_id: null,
  event: { type: "content_block_start", index, content_block: kind === "text" ? { type: "text", text: "" } : kind === "thinking" ? { type: "thinking", thinking: "" } : { type: "tool_use", id: "x", name: "FakeShell", input: {} } },
});
export const textDelta = (index: number, text: string): Frame => ({ type: "stream_event", session_id: SESSION, parent_tool_use_id: null, event: { type: "content_block_delta", index, delta: { type: "text_delta", text } } });
export const thinkingDelta = (index: number, thinking: string): Frame => ({ type: "stream_event", session_id: SESSION, parent_tool_use_id: null, event: { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking } } });
export const blockStop = (index: number): Frame => ({ type: "stream_event", session_id: SESSION, parent_tool_use_id: null, event: { type: "content_block_stop", index } });
export const messageStop = (): Frame => ({ type: "stream_event", session_id: SESSION, parent_tool_use_id: null, event: { type: "message_stop" } });

/** Claude Code sends one `assistant` frame per finished content block, sharing the message id. */
export const assistant = (messageId: string, uuid: string, content: Frame[], extra: Frame = {}): Frame => ({
  type: "assistant", uuid, session_id: SESSION, parent_tool_use_id: null,
  message: { id: messageId, role: "assistant", model: "claude-test-1", content, usage: { input_tokens: 3, output_tokens: 2 } },
  ...extra,
});
export const text = (value: string): Frame => ({ type: "text", text: value });
export const thinking = (value: string): Frame => ({ type: "thinking", thinking: value, signature: "sig" });
export const toolUseBlock = (id: string, name: string, input: Frame): Frame => ({ type: "tool_use", id, name, input });

export const toolResult = (toolUseId: string, content: unknown, isError = false): Frame => ({
  type: "user", uuid: `result-${toolUseId}`, session_id: SESSION, parent_tool_use_id: null,
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError }] },
});

export const rateLimit = (status: "allowed" | "allowed_warning" | "rejected"): Frame => ({
  type: "rate_limit_event", session_id: SESSION, rate_limit_info: { status, resetsAt: 1_900_000_000, rateLimitType: "five_hour" },
});

export const result = (subtype: string, extra: Frame = {}): Frame => ({
  type: "result", subtype, is_error: subtype !== "success", session_id: SESSION, uuid: `res-${subtype}`,
  duration_ms: 1234, duration_api_ms: 1000, num_turns: 1, result: subtype === "success" ? "done" : "",
  total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 1 },
  ...extra,
});

/** The frames of one plain turn, in the order the spike measured. */
export function plainTurn(uuid: string, sent: string, messageId: string, reply: string[]): Frame[] {
  return [
    hook("hook_started"), hook("hook_response"), uiInvalidate(), state("running"), init(), statusFrame(),
    replay(uuid, sent), messageStart(messageId), blockStart(0, "text"),
    ...reply.map((piece) => textDelta(0, piece)),
    assistant(messageId, `a-${messageId}`, [text(reply.join(""))]),
    blockStop(0), messageStop(), rateLimit("allowed"), result("success"), state("idle"),
  ];
}
