import type { BotChatStatus, JournalApproval, JournalQuestion, JournalRow } from "../../../shared/bots/chat.ts";
import type { ConversationPart, ConversationTurn } from "../../../shared/protocol.ts";
import type { LiveState } from "./translate.ts";

const iso = (at: number): string | null => Number.isFinite(at) ? new Date(at).toISOString() : null;

function promptText(body: JournalApproval | JournalQuestion): string {
  const state = body.resolution.state === "pending" ? "waiting for the owner" : body.resolution.state === "resolved" ? "answered" : "cancelled";
  const what = body.kind === "approval" ? body.title : `Question: ${body.question}`;
  return `${what} (${state})`;
}

/** The part a row adds to an assistant turn; null for rows the transcript chat has no place for. */
function assistantPart(row: JournalRow): ConversationPart | null {
  const body = row.body;
  switch (body.kind) {
    case "message":
      if (body.text.length === 0) return null;
      return body.role === "reasoning" ? { kind: "thinking", text: body.text } : { kind: "text", text: body.text };
    case "tool-call": {
      const output = body.output?.text ?? (body.endedAs === "interrupted" ? "Stopped before it answered." : body.endedAs === "unverifiable" ? "The process ended before it answered." : "");
      return {
        kind: "tool", name: body.name, summary: body.summary, input: body.input.text, output,
        ...(body.state === "failed" || body.isError === true ? { error: true } : {}),
        ...(body.output !== undefined && body.output.cut > 0 ? { output_size: body.output.bytes } : {}),
      };
    }
    case "approval": case "question": return { kind: "text", text: promptText(body) };
    case "status": return { kind: "text", text: body.tone === "error" ? `Error: ${body.text}` : body.text };
    default: return null;
  }
}

/**
 * A page of journal rows as today's chat screen reads them (`ConversationTurn[]`), so a session
 * bot shows before the new chat screen exists. Rows go in drawing order (`ordinal`), not revision
 * order: a tool call revised by its result stays where the call was made.
 */
export function projectConversation(rows: readonly JournalRow[]): ConversationTurn[] {
  const ordered = [...rows].sort((a, b) => a.ordinal - b.ordinal);
  const turns: ConversationTurn[] = [];
  for (const row of ordered) {
    const body = row.body;
    if (body.kind === "turn") continue;
    if (body.kind === "message" && body.role === "user") {
      // system mail starts a turn nobody typed: the screen's notice part draws it apart
      const part: ConversationPart = body.from?.kind === "termweave"
        ? { kind: "notice", text: body.from.label ? `${body.from.label}: ${body.text}` : body.text }
        : { kind: "text", text: body.text };
      turns.push({ role: "user", ts: iso(row.observedAt), parts: [part] });
      continue;
    }
    const part = assistantPart(row);
    if (part === null) continue;
    const last = turns[turns.length - 1];
    const stamp = iso(row.observedAt);
    if (last !== undefined && last.role === "assistant") {
      turns[turns.length - 1] = { ...last, parts: [...last.parts, part], ...(stamp !== null ? { end_ts: stamp } : {}) };
    } else {
      turns.push({ role: "assistant", ts: stamp, parts: [part], ...(stamp !== null ? { end_ts: stamp } : {}) });
    }
  }
  return turns;
}

/** Whether the process that could answer is alive, and Claude's last reported state. */
export interface ChatLive { connected: boolean; state: LiveState }

/**
 * The bot chat's status, by Orca's lead-state rules (spec section 4): an approval waiting is
 * `blocked`, only questions waiting is `waiting`, a running turn is `working`, otherwise `done`.
 * Without a live process nothing can answer a prompt or finish a turn: `offline`.
 */
export function chatStatusOf(rows: readonly JournalRow[], live: ChatLive | null): BotChatStatus {
  if (live === null || !live.connected) return "offline";
  const pending = rows.filter((row) => (row.body.kind === "approval" || row.body.kind === "question") && row.body.resolution.state === "pending");
  if (pending.some((row) => row.body.kind === "approval")) return "blocked";
  if (pending.length > 0) return "waiting";
  if (live.state === "running" || live.state === "requires_action") return "working";
  const newestTurn = [...rows].filter((row) => row.body.kind === "turn").sort((a, b) => b.ordinal - a.ordinal)[0];
  if (newestTurn?.body.kind === "turn" && newestTurn.body.state === "running") return "working";
  return "done";
}
