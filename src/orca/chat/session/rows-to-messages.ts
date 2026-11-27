// TermWeave's own adapter (no Orca file to copy): a session bot's journal rows (shared/bots/chat.ts) →
// the chat contract shaped after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
// src/shared/native-chat/native-chat-types.ts. Pure: no React, no fetch. Unlike the pane adapter it
// keeps what the journal knows: stable ids, the state of each tool call, and how each turn ended.
import type { JournalApproval, JournalQuestion, JournalRow, JournalToolCall, JournalTurn } from "../../../../shared/bots/chat.ts";
import type { Translate } from "../../../lib/i18n.ts";
import { mcpIdentity, parseToolInput } from "../adapter/turns-to-messages.ts";
import type { NativeChatBlock, NativeChatMessage, NativeChatRole, NativeChatTextPresentation } from "../shared/index.ts";
import type { LabelledNoticeBlock } from "../transcript/notice-label.ts";

/** A message being built; `blocks` is replaced, never pushed to. */
interface Draft {
  id: string;
  role: NativeChatRole;
  blocks: NativeChatBlock[];
  timestamp: number;
  turnKey: string;
}

type PromptBody = JournalApproval | JournalQuestion;

const byOrdinal = (a: JournalRow, b: JournalRow): number => a.ordinal - b.ordinal;

/** Rows in drawing order: a tool call revised by its result stays where the call was made. */
export function orderedRows(rows: Iterable<JournalRow>): JournalRow[] {
  return [...rows].sort(byOrdinal);
}

/** A row's turn: its turnId, or the row alone (host status rows and prompts outside a turn). */
const turnKeyOf = (row: JournalRow): string => row.turnId ?? `row:${row.itemId}`;

function textDraft(row: JournalRow, role: NativeChatRole, text: string, presentation?: NativeChatTextPresentation): Draft {
  return { id: row.itemId, role, blocks: [{ type: "text", text, ...(presentation ? { presentation } : {}) }], timestamp: row.observedAt, turnKey: turnKeyOf(row) };
}

function mailDraft(row: JournalRow, label: string | null, text: string): Draft {
  const block: LabelledNoticeBlock = { type: "text", text, presentation: "notice", noticeLabel: label };
  return { id: row.itemId, role: "system", blocks: [block], timestamp: row.observedAt, turnKey: turnKeyOf(row) };
}

/** How many calls a sub-agent made under each parent call, by the parent's callId. */
export function childCallCounts(rows: readonly JournalRow[]): ReadonlyMap<string, number> {
  return rows.reduce((counts, row) => {
    const parent = row.body.kind === "tool-call" ? row.body.parentCallId : undefined;
    return parent === undefined ? counts : new Map(counts).set(parent, (counts.get(parent) ?? 0) + 1);
  }, new Map<string, number>());
}

/** The faint suffix of a call with sub-agent calls under it; "" for none. */
function stepsSuffix(count: number, t: Translate): string {
  if (count <= 0) return "";
  return count === 1 ? ` · ${t("1 step")}` : ` · ${t("{count} steps", { count })}`;
}

/** Why a call has no answer, in the owner's words; null while it still runs. */
function endedText(body: JournalToolCall, t: Translate): string {
  if (body.endedAs === "interrupted") return t("Stopped before it answered.");
  if (body.endedAs === "unverifiable") return t("The process ended before it answered.");
  return "";
}

/**
 * A call and, once it settled, its result. Decision: a running call has no result block, which is how
 * the tool run draws "running"; a call stopped or orphaned before it answered reads as failed.
 */
export function toolBlocks(body: JournalToolCall, t: Translate, steps = 0): NativeChatBlock[] {
  const identity = mcpIdentity(body.name);
  const call: NativeChatBlock = {
    // a Task call counts the calls its sub-agent made under it (they are not rows of their own)
    type: "tool-call", name: body.name, callId: body.callId, summary: `${body.summary}${stepsSuffix(steps, t)}`,
    // a cut input is no longer JSON: parseToolInput gives {} and the summary still names the call
    input: parseToolInput(body.input.text),
    ...(identity ? { mcpIdentity: identity } : {}),
  };
  if (body.state === "running") return [call];
  const failed = body.state === "failed" || body.isError === true || body.endedAs !== undefined;
  return [call, {
    type: "tool-result", callId: body.callId,
    output: body.output?.text ?? endedText(body, t),
    ...(failed ? { isError: true } : {}),
    ...(body.output !== undefined && body.output.cut > 0 ? { outputSize: body.output.bytes } : {}),
  }];
}

function optionLabel(body: JournalApproval, optionId: string): string {
  return body.options.find((option) => option.id === optionId)?.label ?? optionId;
}

/** A settled approval as one quiet line: what was asked and how it was answered. */
function approvalLine(body: JournalApproval, t: Translate): string {
  const tool = body.displayName ?? body.toolName;
  const plan = body.plan !== undefined;
  const { state, answer } = body.resolution;
  if (state === "cancelled") return plan ? t("Plan review withdrawn") : t("Request withdrawn: {tool}", { tool });
  if (answer === null || answer.kind === "dismiss") return plan ? t("Plan dismissed") : t("Dismissed: {tool}", { tool });
  if (answer.kind !== "option") return t("Answered: {tool}", { tool });
  switch (answer.optionId) {
    case "allow": return plan ? t("Plan approved") : t("Allowed: {tool}", { tool });
    case "allowForSession": return t("Allowed for this session: {tool}", { tool });
    case "deny": return plan ? t("Kept planning") : t("Denied: {tool}", { tool });
    default: return `${tool}: ${optionLabel(body, answer.optionId)}`;
  }
}

/** A settled question as one quiet line: each question with the answer it got. */
function questionLine(body: JournalQuestion, t: Translate): string {
  const { state, answer } = body.resolution;
  if (state === "cancelled") return t("Question withdrawn: {question}", { question: body.question });
  if (answer === null || answer.kind !== "answers") return t("Question dismissed: {question}", { question: body.question });
  const lines = body.questions.map((question) => {
    const given = answer.answers.find((each) => each.questionId === question.id);
    const labels = (given?.optionIds ?? []).map((id) => question.options.find((option) => option.id === id)?.label ?? id);
    const chosen = [...labels, ...(given?.other?.trim() ? [given.other.trim()] : [])];
    return `${question.question} → ${chosen.length > 0 ? chosen.join(", ") : t("no answer")}`;
  });
  return lines.join("\n");
}

/** A settled prompt's line; a pending one is a card above the composer, not a row. */
export function settledPromptLine(body: PromptBody, t: Translate): string | null {
  if (body.resolution.state === "pending") return null;
  return body.kind === "approval" ? approvalLine(body, t) : questionLine(body, t);
}

/** The last open assistant draft of the same turn that may take this block, if any. */
function openAssistant(drafts: readonly Draft[], turnKey: string, kind: "text" | "tool"): number {
  const index = drafts.length - 1;
  const last = drafts[index];
  if (last === undefined || last.role !== "assistant" || last.turnKey !== turnKey) return -1;
  // words after a tool start a new message: a row draws its prose above its tool run
  if (kind === "text" && last.blocks.some((block) => block.type === "tool-call")) return -1;
  return index;
}

function appendAssistant(drafts: Draft[], row: JournalRow, kind: "text" | "tool", blocks: NativeChatBlock[]): Draft[] {
  const index = openAssistant(drafts, turnKeyOf(row), kind);
  if (index < 0) return [...drafts, { id: row.itemId, role: "assistant", blocks, timestamp: row.observedAt, turnKey: turnKeyOf(row) }];
  const open = drafts[index]!;
  return [...drafts.slice(0, index), { ...open, blocks: [...open.blocks, ...blocks] }];
}

/** The drafts one row adds. Turn rows add none here: `closeTurns` places what they say. */
function addRow(drafts: Draft[], row: JournalRow, t: Translate, children: ReadonlyMap<string, number>): Draft[] {
  const body = row.body;
  switch (body.kind) {
    case "message": {
      if (body.text.trim() === "") return drafts;
      if (body.role === "user") {
        // mail from TermWeave (a worker's report, a schedule) is not the owner's words: a notice row
        // labelled with the mail's own label, its text kept apart
        if (body.from?.kind === "termweave") return [...drafts, mailDraft(row, body.from.label, body.text)];
        return [...drafts, textDraft(row, "user", body.text)];
      }
      if (body.role === "reasoning") return [...drafts, textDraft(row, "reasoning", body.text)];
      return appendAssistant(drafts, row, "text", [{ type: "text", text: body.text }]);
    }
    case "tool-call":
      // a subagent's calls stay inside its Task call, counted there; the tool run has no nesting to show them in
      return body.parentCallId !== undefined ? drafts : appendAssistant(drafts, row, "tool", toolBlocks(body, t, children.get(body.callId) ?? 0));
    case "approval":
    case "question": {
      const line = settledPromptLine(body, t);
      return line === null ? drafts : [...drafts, textDraft(row, "system", line)];
    }
    case "status": {
      const text = body.tone === "error" ? t("Error: {text}", { text: body.text }) : body.text;
      return [...drafts, textDraft(row, "system", text)];
    }
    case "turn":
      return drafts;
  }
}

/** The line a finished turn leaves when it did not complete; null for a completed or running turn. */
function turnEndLine(turn: JournalTurn, row: JournalRow, hasError: boolean, t: Translate): Draft | null {
  const id = `${row.itemId}:end`;
  const at = turn.completedAt ?? row.observedAt;
  const base = { id, timestamp: at, turnKey: turnKeyOf(row) };
  if (turn.state === "interrupted") return { ...base, role: "system", blocks: [{ type: "text", text: t("Stopped"), presentation: "interrupted" }] };
  // a failed turn that already has its error row says nothing more
  if (turn.state === "failed" && !hasError) return { ...base, role: "system", blocks: [{ type: "text", text: t("This turn failed.") }] };
  if (turn.state === "unverifiable") return { ...base, role: "system", blocks: [{ type: "text", text: t("The bot's process ended during this turn; its outcome is unknown.") }] };
  return null;
}

/** After each finished turn's last draft: the line saying how it ended. */
function closeTurns(drafts: Draft[], rows: readonly JournalRow[], t: Translate): Draft[] {
  const turns = rows.filter((row): row is JournalRow & { body: JournalTurn } => row.body.kind === "turn");
  const errorTurns = new Set(rows.filter((row) => row.body.kind === "status" && row.body.tone === "error").map(turnKeyOf));
  return turns.reduce((all, row) => {
    const line = turnEndLine(row.body, row, errorTurns.has(turnKeyOf(row)), t);
    if (line === null) return all;
    const last = all.map((draft) => draft.turnKey).lastIndexOf(turnKeyOf(row));
    return last < 0 ? [...all, line] : [...all.slice(0, last + 1), line, ...all.slice(last + 1)];
  }, drafts);
}

/** The time each turn's answer ends at: its completion when the journal has it. */
function turnEnds(rows: readonly JournalRow[]): Map<string, number> {
  return new Map(rows.flatMap((row): [string, number][] =>
    row.body.kind === "turn" && row.body.completedAt !== undefined ? [[turnKeyOf(row), row.body.completedAt]] : []));
}

/** Drafts as messages: turn indexes in order of first appearance, `endsTurn` on each turn's last assistant message. */
function finish(drafts: readonly Draft[], ends: ReadonlyMap<string, number>): NativeChatMessage[] {
  const indexes = new Map<string, number>();
  for (const draft of drafts) if (!indexes.has(draft.turnKey)) indexes.set(draft.turnKey, indexes.size);
  const lastAssistant = new Map<string, number>();
  drafts.forEach((draft, at) => { if (draft.role === "assistant") lastAssistant.set(draft.turnKey, at); });
  return drafts.map((draft, at) => {
    const endsTurn = lastAssistant.get(draft.turnKey) === at;
    return {
      id: draft.id, role: draft.role, blocks: draft.blocks,
      timestamp: endsTurn ? (ends.get(draft.turnKey) ?? draft.timestamp) : draft.timestamp,
      source: "transcript", turnIndex: indexes.get(draft.turnKey) ?? 0, endsTurn,
    };
  });
}

/** Every loaded row as chat messages, in drawing order. Ids are the journal's item ids, so they never move. */
export function rowsToMessages(rows: Iterable<JournalRow>, t: Translate): NativeChatMessage[] {
  const ordered = orderedRows(rows);
  const children = childCallCounts(ordered);
  const drafts = ordered.reduce<Draft[]>((all, row) => addRow(all, row, t, children), []);
  return finish(closeTurns(drafts, ordered, t), turnEnds(ordered));
}

/** The approval and question rows still waiting for the owner, oldest first. */
export function pendingPromptRows(rows: Iterable<JournalRow>): (JournalRow & { body: PromptBody })[] {
  return orderedRows(rows).filter((row): row is JournalRow & { body: PromptBody } =>
    (row.body.kind === "approval" || row.body.kind === "question") && row.body.resolution.state === "pending");
}

/** Why the bot is not answering, from the host's status rows. */
export type ChatHold =
  | { kind: "slot"; text: string }
  | { kind: "stopped"; text: string }
  | { kind: "start-failed"; text: string }
  | { kind: "pane"; text: string };

/** The status codes of the host's own rows (server/bots/session/session.ts statusRow) that hold the chat. */
function holdOf(row: JournalRow): ChatHold | null {
  if (row.body.kind !== "status") return null;
  const { code, text } = row.body;
  if (code === "no_slot") return { kind: "slot", text };
  if (code === "pane_live") return { kind: "pane", text };
  if (code === "start_failed") return row.itemId.startsWith("status:host:stopped:") ? { kind: "stopped", text } : { kind: "start-failed", text };
  return null;
}

/**
 * The newest hold that still stands: a waiting slot, a refused start, or a stop after failed starts.
 * Decision: a turn or the owner's message drawn after it means the bot moved on, so it no longer stands.
 */
export function currentHold(rows: Iterable<JournalRow>): ChatHold | null {
  const ordered = orderedRows(rows);
  for (let at = ordered.length - 1; at >= 0; at -= 1) {
    const row = ordered[at]!;
    const hold = holdOf(row);
    if (hold !== null) return hold;
    if (row.body.kind === "turn" || (row.body.kind === "message" && row.body.role === "user")) return null;
  }
  return null;
}
