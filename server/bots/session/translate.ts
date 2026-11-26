import type { JournalRow, JournalStatus, JournalTurn, PromptAnswer, PromptRequest, TurnUsage } from "../../../shared/bots/chat.ts";
import { bound, type BotJournal, FIELD_MAX_BYTES, MESSAGE_MAX_BYTES } from "./journal.ts";
import { createWriteContext, systemClock, type TranslatorClock, type WriteContext } from "./translate/context.ts";
import {
  apiErrorText, hasToolResults, isBookkeeping, list, num, obj, type Obj, resultErrorText, str, userContent,
} from "./translate/frames.ts";
import { answerFits, promptBody, promptItemId, storedAnswer } from "./translate/prompts.ts";
import { Streams } from "./translate/stream.ts";
import { settleRunningTools, toolResults, toolUse } from "./translate/tools.ts";

export type { TranslatorClock } from "./translate/context.ts";

/** Claude's own state, from `system/session_state_changed`; null before the first and after an end. */
export type LiveState = "running" | "requires_action" | "idle" | null;

export interface SessionFacts { claudeSessionId: string | null; model: string | null; leafUuid: string | null }

export interface TranslatorOptions {
  clock?: TranslatorClock;
  /** at most one revision of a streaming text row per this many ms */
  coalesceMs?: number;
  /** the Claude session id and model arrived (once), or the leaf uuid moved */
  onFacts?(facts: SessionFacts): void;
  /** a frame that could not be translated; the stream goes on */
  onError?(error: unknown, frame: Record<string, unknown>): void;
}

export interface Translator {
  frame(frame: Record<string, unknown>, observedAt: number): void;
  prompt(p: PromptRequest, observedAt?: number): void;
  promptCancelled(promptKey: string, observedAt?: number): void;
  /** Settles a pending prompt once: null when it is not pending or the answer does not fit it. */
  promptAnswered(promptKey: string, answer: PromptAnswer, by: string, observedAt?: number): JournalRow | null;
  /** The host is about to interrupt: the turn's error result that follows reads as interrupted. */
  interrupting(): void;
  /** The process ended: open turn interrupted, running calls failed, pending prompts cancelled. */
  ended(reason: "closed" | "crashed", observedAt?: number): void;
  readonly currentTurnId: string | null;
  readonly liveState: LiveState;
  readonly facts: SessionFacts;
}

export const COALESCE_MS = 250;

const turnItemId = (turnId: string): string => `turn:${turnId}`;

function usageOf(value: unknown): TurnUsage | undefined {
  const usage = obj(value);
  const input = num(usage.input_tokens);
  const output = num(usage.output_tokens);
  if (input === undefined && output === undefined) return undefined;
  return {
    inputTokens: input ?? 0, outputTokens: output ?? 0,
    cacheReadTokens: num(usage.cache_read_input_tokens) ?? 0, cacheCreationTokens: num(usage.cache_creation_input_tokens) ?? 0,
  };
}

function status(text: string, tone: JournalStatus["tone"], code: string, said?: string): JournalStatus {
  const detail = said !== undefined && said.trim().length > 0 ? { detail: bound(said, FIELD_MAX_BYTES) } : {};
  return { kind: "status", text, tone, code, ...detail };
}

class FrameTranslator implements Translator {
  private turn: JournalTurn | null = null;
  private live: LiveState = null;
  private interruptAsked = false;
  private model: string | null = null;
  private readonly sessionFacts: SessionFacts = { claudeSessionId: null, model: null, leafUuid: null };
  private readonly ctx: WriteContext;
  private readonly streams: Streams;

  constructor(sessionId: string, journal: BotJournal, emit: (rows: JournalRow[]) => void, private readonly options: TranslatorOptions) {
    this.ctx = createWriteContext(sessionId, journal, emit, () => this.turn?.turnId ?? null);
    this.streams = new Streams(this.ctx, options.clock ?? systemClock, options.coalesceMs ?? COALESCE_MS);
  }

  get currentTurnId(): string | null { return this.turn?.turnId ?? null; }
  get liveState(): LiveState { return this.live; }
  get facts(): SessionFacts { return { ...this.sessionFacts }; }

  frame(frame: Record<string, unknown>, observedAt: number): void {
    try {
      this.route(obj(frame), observedAt);
    } catch (error) {
      this.options.onError?.(error, frame);
    }
    this.ctx.flush();
  }

  private route(frame: Obj, at: number): void {
    switch (frame.type) {
      case "system": return this.system(frame, at);
      case "stream_event": if (frame.parent_tool_use_id == null) this.streams.event(obj(frame.event), at); return;
      case "assistant": return this.assistant(frame, at);
      case "user": return this.user(frame, at);
      case "result": return this.result(frame, at);
      case "rate_limit_event": return this.rateLimit(frame, at);
      // hooks, tool progress, auth status and frame types this version does not know: no row
      default: return;
    }
  }

  private system(frame: Obj, at: number): void {
    const subtype = str(frame.subtype);
    if (subtype === "init") {
      // init arrives on every turn; only the first one names the session
      if (this.sessionFacts.claudeSessionId !== null) return;
      this.sessionFacts.claudeSessionId = str(frame.session_id) ?? null;
      this.sessionFacts.model = str(frame.model) ?? null;
      this.model = this.sessionFacts.model;
      this.options.onFacts?.(this.facts);
    } else if (subtype === "session_state_changed") {
      const state = str(frame.state);
      if (state !== "running" && state !== "requires_action" && state !== "idle") return;
      this.live = state;
      if (state === "idle" && this.turn !== null) this.closeTurn({ state: "completed" }, at);
    } else if (subtype === "compact_boundary") {
      this.ctx.write(`status:compact:${str(frame.uuid) ?? at}`, status("The conversation was compacted to fit Claude's context.", "info", "compacted"), at, this.currentTurnId);
    } else if (subtype === "api_retry") {
      const attempt = num(frame.attempt);
      const most = num(frame.max_retries);
      const text = attempt !== undefined && most !== undefined ? `Claude's service did not answer; retrying (attempt ${attempt} of ${most}).` : "Claude's service did not answer; retrying.";
      // one row per turn, revised: a retry storm must not write a row per attempt
      this.ctx.write(`status:retry:${this.currentTurnId ?? "none"}`, status(text, "warning", "api_retry", str(frame.error)), at, this.currentTurnId);
    }
  }

  private user(frame: Obj, at: number): void {
    const content = obj(frame.message).content;
    const uuid = str(frame.uuid);
    // the leaf is the newest root transcript entry, which a tool result can be
    if (frame.parent_tool_use_id == null && uuid !== undefined) this.leaf(uuid);
    if (hasToolResults(content)) { toolResults(this.ctx, content, at); return; }
    if (frame.parent_tool_use_id != null || uuid === undefined) return;
    const submission = this.ctx.journal.submissionByUuid(this.ctx.sessionId, uuid);
    // a user-seat line with no send behind it is Claude Code's own (an interrupt marker, a resumed
    // line): it is not the owner's words, so it is not drawn as theirs
    if (submission === null) return;
    if (submission.state !== "accepted") {
      this.ctx.journal.submission(this.ctx.sessionId, { ...submission, state: "accepted", resolvedAt: at });
    }
    const itemId = `user:${uuid}`;
    if (this.ctx.journal.row(this.ctx.sessionId, itemId) === null) {
      const { text, images } = userContent(content);
      const shown = text.length > 0 && !isBookkeeping(text) ? text : submission.text;
      const kept = bound(shown, MESSAGE_MAX_BYTES);
      if (this.turn === null) this.openTurn(uuid, itemId, at);
      this.ctx.write(itemId, {
        kind: "message", role: "user", text: kept.text, from: submission.from,
        ...(images.length > 0 ? { images } : {}), ...(kept.cut > 0 ? { truncated: true as const } : {}),
      }, at, this.currentTurnId);
    }
  }

  private assistant(frame: Obj, at: number): void {
    const message = obj(frame.message);
    const parent = str(frame.parent_tool_use_id);
    const blocks = list(message.content).map(obj);
    if (parent !== undefined) {
      // a subagent's own text stays inside its Task call; its tool calls are shown under it
      for (const block of blocks) if (block.type === "tool_use") toolUse(this.ctx, block, parent, at);
      return;
    }
    const uuid = str(frame.uuid);
    if (uuid !== undefined) this.leaf(uuid);
    const messageId = str(message.id) ?? uuid ?? `at-${at}`;
    this.model = str(message.model) ?? this.model;
    if (this.turn === null) this.openTurn(messageId, undefined, at);
    const error = str(frame.error);
    if (error !== undefined) {
      const said = blocks.map((block) => str(block.text) ?? "").join("\n");
      const plain = apiErrorText(error, said);
      this.ctx.write(`status:${messageId}`, status(plain.text, "error", plain.code, said), at, this.currentTurnId);
      return;
    }
    for (const block of blocks) {
      if (block.type === "text") this.streams.final(messageId, "assistant", str(block.text) ?? "", at);
      else if (block.type === "thinking") this.streams.final(messageId, "reasoning", str(block.thinking) ?? "", at);
      else if (block.type === "tool_use") toolUse(this.ctx, block, undefined, at);
    }
  }

  private result(frame: Obj, at: number): void {
    const subtype = str(frame.subtype) ?? "unknown";
    const said = str(frame.result) ?? list(frame.errors).map((entry) => String(entry)).join("\n");
    const ok = subtype === "success" && frame.is_error !== true;
    const interrupted = !ok && subtype === "error_during_execution" && this.interruptAsked;
    if (!ok && !interrupted) {
      const plain = resultErrorText(subtype, said);
      this.ctx.write(`status:result:${this.currentTurnId ?? str(frame.uuid) ?? at}`, status(plain.text, "error", plain.code, said), at, this.currentTurnId);
    }
    if (this.turn === null) return;
    const usage = usageOf(frame.usage);
    const duration = num(frame.duration_ms);
    const cost = num(frame.total_cost_usd);
    this.closeTurn({
      state: ok ? "completed" : interrupted ? "interrupted" : "failed", outcome: subtype,
      ...(duration !== undefined ? { durationMs: duration } : {}), ...(usage ? { usage } : {}), ...(cost !== undefined ? { costUsd: cost } : {}),
    }, at);
  }

  private rateLimit(frame: Obj, at: number): void {
    const info = obj(frame.rate_limit_info);
    // allowed and warning events come every turn; only a refusal is worth a row
    if (info.status !== "rejected") return;
    const resets = num(info.resetsAt);
    const when = resets !== undefined ? ` It resets at ${new Date(resets * 1000).toISOString()}.` : "";
    this.ctx.write(`status:rate:${this.currentTurnId ?? "none"}`, status(`Claude's usage limit is reached.${when}`, "error", "usage_limit"), at, this.currentTurnId);
  }

  private leaf(uuid: string): void {
    if (this.sessionFacts.leafUuid === uuid) return;
    this.sessionFacts.leafUuid = uuid;
    this.options.onFacts?.(this.facts);
  }

  private openTurn(turnId: string, userItemId: string | undefined, at: number): void {
    this.interruptAsked = false;
    this.turn = { kind: "turn", turnId, state: "running", startedAt: at, ...(userItemId ? { userItemId } : {}) };
    this.ctx.write(turnItemId(turnId), this.turn, at, turnId);
  }

  private closeTurn(end: Omit<Partial<JournalTurn>, "kind" | "turnId"> & { state: JournalTurn["state"] }, at: number): void {
    const turn = this.turn;
    if (turn === null) return;
    this.streams.finishAll(at);
    if (end.state !== "completed") settleRunningTools(this.ctx, end.state === "unverifiable" ? "unverifiable" : "interrupted", at, turn.turnId);
    const closed: JournalTurn = { ...turn, ...end, completedAt: at, ...(this.model !== null ? { model: this.model } : {}) };
    this.ctx.write(turnItemId(turn.turnId), closed, at, turn.turnId);
    this.turn = null;
    this.interruptAsked = false;
  }

  prompt(p: PromptRequest, observedAt = Date.now()): void {
    try {
      const itemId = promptItemId(p.promptKey);
      const existing = this.ctx.journal.row(this.ctx.sessionId, itemId);
      if (existing !== null) return;
      this.ctx.write(itemId, promptBody(p), observedAt, this.currentTurnId);
    } catch (error) {
      this.options.onError?.(error, { type: "prompt" });
    }
    this.ctx.flush();
  }

  promptCancelled(promptKey: string, observedAt = Date.now()): void {
    const row = this.ctx.journal.row(this.ctx.sessionId, promptItemId(promptKey));
    if (row === null || (row.body.kind !== "approval" && row.body.kind !== "question") || row.body.resolution.state !== "pending") return;
    this.ctx.write(row.itemId, { ...row.body, resolution: { state: "cancelled", answer: null, resolvedBy: null, resolvedAt: observedAt } }, observedAt);
    this.ctx.flush();
  }

  promptAnswered(promptKey: string, answer: PromptAnswer, by: string, observedAt = Date.now()): JournalRow | null {
    const row = this.ctx.journal.row(this.ctx.sessionId, promptItemId(promptKey));
    if (row === null || (row.body.kind !== "approval" && row.body.kind !== "question")) return null;
    if (row.body.resolution.state !== "pending" || !answerFits(row.body, answer)) return null;
    const written = this.ctx.write(row.itemId, {
      ...row.body, resolution: { state: "resolved", answer: storedAnswer(answer), resolvedBy: by.slice(0, 200), resolvedAt: observedAt },
    }, observedAt);
    this.ctx.flush();
    return written;
  }

  interrupting(): void { this.interruptAsked = true; }

  ended(reason: "closed" | "crashed", observedAt = Date.now()): void {
    const endedAs = reason === "closed" ? "interrupted" : "unverifiable";
    if (this.turn !== null) this.closeTurn({ state: endedAs }, observedAt);
    this.streams.finishAll(observedAt);
    // rows an earlier process left open (a crash before this one started) settle too
    for (const row of this.ctx.journal.running(this.ctx.sessionId)) {
      const body = row.body;
      if (body.kind === "turn") this.ctx.write(row.itemId, { ...body, state: endedAs, completedAt: observedAt }, observedAt);
      else if (body.kind === "tool-call") this.ctx.write(row.itemId, { ...body, state: "failed", endedAs }, observedAt);
      else if (body.kind === "message") this.ctx.write(row.itemId, { ...body, state: "completed", completedAt: observedAt }, observedAt);
    }
    for (const row of this.ctx.journal.pendingPrompts(this.ctx.sessionId)) {
      if (row.body.kind !== "approval" && row.body.kind !== "question") continue;
      this.ctx.write(row.itemId, { ...row.body, resolution: { state: "cancelled", answer: null, resolvedBy: null, resolvedAt: observedAt } }, observedAt);
    }
    if (reason === "crashed") {
      this.ctx.write(`status:ended:${observedAt}`, status("The bot's Claude process stopped unexpectedly. It starts again with the next message.", "error", "crashed"), observedAt, null);
    }
    this.live = null;
    this.ctx.flush();
  }
}

/** Turns SDK frames into journal rows (a reduced copy of Orca's translator, spec section 2.1). */
export function createTranslator(
  sessionId: string, journal: BotJournal, emit: (rows: JournalRow[]) => void, options: TranslatorOptions = {},
): Translator {
  return new FrameTranslator(sessionId, journal, emit, options);
}
