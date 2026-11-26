import type { JournalToolCall } from "../../../../shared/bots/chat.ts";
import { bound, TOOL_OUTPUT_MAX_BYTES } from "../journal.ts";
import type { WriteContext } from "./context.ts";
import { list, obj, type Obj, pretty, resultText, str, toolSummary } from "./frames.ts";

/** Tool rows are keyed by the tool_use id, so the result revises the row its call wrote. */
export const toolItemId = (callId: string): string => `tool:${callId}`;

/** One `tool_use` block of an `assistant` frame: a running tool-call row. */
export function toolUse(ctx: WriteContext, block: Obj, parentCallId: string | undefined, at: number): void {
  const callId = str(block.id);
  const name = str(block.name);
  if (callId === undefined || name === undefined) return;
  const existing = ctx.journal.row(ctx.sessionId, toolItemId(callId));
  // a repeated assistant frame must not reopen a call that already answered
  if (existing?.body.kind === "tool-call" && existing.body.state !== "running") return;
  const input = obj(block.input);
  const body: JournalToolCall = {
    kind: "tool-call", name, callId, summary: toolSummary(name, input),
    input: bound(pretty(input), TOOL_OUTPUT_MAX_BYTES), state: "running",
    ...(parentCallId !== undefined ? { parentCallId } : {}),
  };
  ctx.write(toolItemId(callId), body, at, ctx.turnId());
}

/** The `tool_result` blocks of a `user` frame: each completes the call it answers. */
export function toolResults(ctx: WriteContext, content: unknown, at: number): void {
  for (const value of list(content)) {
    const block = obj(value);
    const callId = str(block.tool_use_id);
    if (block.type !== "tool_result" || callId === undefined) continue;
    const row = ctx.journal.row(ctx.sessionId, toolItemId(callId));
    // a result for a call this chat never saw (from before a resume) has nothing to complete
    if (row === null || row.body.kind !== "tool-call") continue;
    const isError = block.is_error === true;
    const body: JournalToolCall = {
      ...row.body, state: isError ? "failed" : "completed",
      output: bound(resultText(block.content), TOOL_OUTPUT_MAX_BYTES), isError,
    };
    ctx.write(row.itemId, body, at);
  }
}

/** Calls of a turn that never answered, settled as failed with why they stopped. */
export function settleRunningTools(ctx: WriteContext, endedAs: "interrupted" | "unverifiable", at: number, turnId?: string): void {
  for (const row of ctx.journal.running(ctx.sessionId)) {
    if (row.body.kind !== "tool-call") continue;
    if (turnId !== undefined && row.turnId !== turnId) continue;
    ctx.write(row.itemId, { ...row.body, state: "failed", endedAs }, at);
  }
}
