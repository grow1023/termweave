/**
 * The bot session host (spec 8.2): a session bot's chat as a Claude Agent SDK session with no
 * terminal. It opens and resumes the connection, queues messages while a turn runs, holds
 * permission prompts until the owner answers, and closes idle sessions. Rows go to the journal
 * through the translator; the caller pushes them to clients.
 */
import { randomUUID } from "node:crypto";

import type { BotChatStatus, JournalRow, JournalStatus, MessageFrom, PromptAnswer, QueuedMessage, BotEffort, BotModelOption } from "../../../shared/bots/chat.ts";
import type { Bot } from "../../../shared/bots/types.ts";
import { BotError } from "../runtime.ts";
import { openClaudeConnection, type ClaudeConnection } from "./connection.ts";
import { HOST_LIMITS, type ChatPage, type HostLimits, type OpenConnection, type SendState, type SessionHostDeps } from "./host-types.ts";
import type { BotJournal } from "./journal.ts";
import { busy, clearIdle, liveStatus, newLive, type Live } from "./live.ts";
import { sdkPermissionMode, type BotPermissionMode, type PermissionRequest, type PermissionResult } from "./permission.ts";
import { answerPrompt, holdPrompt } from "./prompting.ts";
import { buildClaudeEnv, codeModeResumeRefusal, ownerCodeMode, resolveClaudeBinary } from "./sdk.ts";
import { createTranslator, type LiveState, type SessionFacts, type TranslatorClock } from "./translate.ts";

export { HOST_LIMITS, type ChatPage, type HostLimits, type OpenConnection, type SendState, type SessionHostDeps } from "./host-types.ts";
import { systemClock } from "./translate/context.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a person may read of a failure: our own errors say it plainly; anything else could hold paths. */
const reasonOf = (error: unknown): string => error instanceof BotError ? error.message : "Claude Code could not start";

export class BotSessionHost {
  private lives: ReadonlyMap<string, Live> = new Map();
  private failures: ReadonlyMap<string, readonly number[]> = new Map();
  private stopped: ReadonlySet<string> = new Set();
  private readonly clock: TranslatorClock;
  private readonly limits: HostLimits;
  private readonly open: OpenConnection;
  /** writes the bot's CLAUDE.md and CLI before a start; the runtime sets it */
  private prepare: (bot: Bot) => void = () => {};

  constructor(private readonly deps: SessionHostDeps) {
    this.clock = deps.clock ?? systemClock;
    this.limits = { ...HOST_LIMITS, ...deps.limits };
    this.open = deps.open ?? ((launch, handlers) => openClaudeConnection(launch, handlers));
  }

  setPrepare(prepare: (bot: Bot) => void): void { this.prepare = prepare; }

  /** Opens the bot's session, or resumes the Claude session it has. */
  async ensure(bot: Bot): Promise<void> { await this.connection(bot); }

  /**
   * Records a message and sends it now, or after the running turn. It is never dropped: a send
   * that could not be written stays queued for the next start.
   */
  async tell(botId: string, text: string, from: MessageFrom, clientMessageId?: string): Promise<{ clientMessageId: string; state: SendState }> {
    this.sessionBot(botId);
    const live = this.liveFor(botId);
    const id = clientMessageId ?? randomUUID();
    if (!UUID.test(id)) throw new BotError("invalid_message_id", "a client message id must be a UUID");
    const known = this.deps.journal.submissionByUuid(live.sessionId, id);
    // a retried request is the same message, not a second one
    if (known !== null) return { clientMessageId: id, state: this.isQueued(live, id) ? "queued" : "accepted" };
    this.deps.journal.submission(live.sessionId, { clientMessageId: id, uuid: id, state: "pending", from, text, submittedAt: this.clock.now(), resolvedAt: null });
    if (from.kind === "owner") this.unblock(botId);
    // behind whatever already waits: messages go in the order they came
    this.deps.journal.enqueue(live.sessionId, { clientMessageId: id, text, from });
    const sent = await this.drain(botId);
    return { clientMessageId: id, state: sent === id ? "accepted" : "queued" };
  }

  /** Sends the next queued message when the bot is free. The runtime calls it when a bot is resumed. */
  async flush(botId: string): Promise<void> { await this.drain(botId); }

  async stop(botId: string): Promise<{ cancelled: boolean }> {
    const live = this.lives.get(botId);
    if (live?.conn == null || live.translator === null) return { cancelled: false };
    live.translator.interrupting();
    return live.conn.interrupt();
  }

  /** Settles a waiting prompt once; a second answer is refused. */
  async answer(botId: string, itemId: string, answer: PromptAnswer, by: string): Promise<void> {
    answerPrompt(this.deps.journal, this.lives.get(botId), botId, itemId, answer, by, this.clock.now());
  }

  status(botId: string): BotChatStatus { return liveStatus(this.lives.get(botId)); }

  /** The models the account can use: asked of a live session, else the last answer; null when none was ever given. */
  async models(botId: string): Promise<BotModelOption[] | null> {
    const conn = this.lives.get(botId)?.conn ?? [...this.lives.values()].find((live) => live.conn !== null)?.conn ?? null;
    if (conn !== null) {
      try { this.knownModels = await conn.models(); } catch { /* the last answer stands */ }
    }
    return this.knownModels;
  }
  private knownModels: BotModelOption[] | null = null;

  page(botId: string, req: Parameters<BotJournal["page"]>[1]): ChatPage {
    const live = this.liveFor(botId);
    return { ...this.deps.journal.page(live.sessionId, req), status: this.status(botId), queued: this.deps.journal.queued(live.sessionId) };
  }

  /** A setting changed: a stopped bot may start again, and a live session takes the new mode. */
  async settingsChanged(botId: string, change: { permissionMode?: BotPermissionMode; model?: string | null; effort?: BotEffort | null }): Promise<void> {
    this.unblock(botId);
    const live = this.lives.get(botId);
    if (change.permissionMode !== undefined && live?.conn) {
      const mode = sdkPermissionMode(change.permissionMode);
      // "own" has no SDK mode to switch to: the next start reads the user's settings instead
      if (mode === null) await this.close(botId);
      else await live.conn.setPermissionMode(mode);
    }
    // a live session takes the new model or effort from its next turn; a closed one starts with them
    if (change.model !== undefined && live?.conn) await live.conn.setModel(change.model);
    if (change.effort !== undefined && live?.conn) await live.conn.setEffort(change.effort);
    void this.drain(botId);
  }

  /** Ends the bot's session; queued messages stay for its next start. */
  async close(botId: string): Promise<void> {
    const live = this.lives.get(botId);
    if (live === undefined) return;
    clearIdle(live, this.clock);
    if (live.opening !== null) await live.opening.catch(() => {});
    const conn = live.conn;
    if (conn === null) return;
    await conn.close();
    // a connection that ended without its exit callback still leaves nothing open here
    if (live.conn === conn) this.exited(live, live.generation, new Error("closed"), true);
  }

  /** Ends every session and its child: the server calls it before it exits. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.lives.keys()].map((botId) => this.close(botId).catch((error: unknown) => {
      console.error(`bot session: close failed: ${error instanceof Error ? error.message : String(error)}`);
    })));
  }

  /** The bot is gone: its session ends and the host forgets it. The journal keeps its rows. */
  async forget(botId: string): Promise<void> {
    await this.close(botId);
    this.lives = new Map([...this.lives].filter(([id]) => id !== botId));
    this.unblock(botId);
  }

  /** How many children run now: the live script checks this is 0 after closeAll. */
  liveCount(): number { return [...this.lives.values()].filter((live) => live.conn !== null || live.opening !== null).length; }

  // ---- opening ----

  private sessionBot(botId: string): Bot {
    const bot = this.deps.store.bot(botId);
    if (!bot) throw new BotError("unknown_bot", `no bot ${botId}`);
    if (bot.runtime !== "session") throw new BotError("not_session_bot", "this bot runs in a terminal, not as a chat session");
    return bot;
  }

  private liveFor(botId: string): Live {
    const existing = this.lives.get(botId);
    if (existing !== undefined) return existing;
    const chat = this.deps.journal.chat(botId) ?? this.deps.journal.setChat(botId, {}, this.clock.now());
    const live = newLive(botId, chat.sessionId, this.clock.now());
    this.lives = new Map([...this.lives, [botId, live]]);
    return live;
  }

  private async connection(bot: Bot): Promise<ClaudeConnection> {
    if (bot.runtime !== "session") throw new BotError("not_session_bot", "this bot runs in a terminal, not as a chat session");
    const live = this.liveFor(bot.id);
    if (live.conn !== null) return live.conn;
    if (live.opening !== null) return live.opening;
    if (this.stopped.has(bot.id)) throw new BotError("session_stopped", "this bot's Claude failed to start; send it a message or change a setting to try again");
    live.opening = this.start(bot, live);
    try { return await live.opening; } finally { live.opening = null; }
  }

  private async start(bot: Bot, live: Live): Promise<ClaudeConnection> {
    if (await this.deps.paneLive(bot)) {
      throw new BotError("pane_live", "this bot's terminal still runs Claude; close that terminal first, so one Claude session does not run in two places");
    }
    await this.freeSlot(bot.id);
    const generation = live.generation + 1;
    live.generation = generation;
    try {
      this.prepare(bot);
      const base = await this.deps.env();
      const codeMode = bot.codeMode === true || (this.deps.ownerCodeMode ?? ownerCodeMode)(base);
      const env = buildClaudeEnv({ base, codeMode });
      const binary = (this.deps.resolveBinary ?? resolveClaudeBinary)(env);
      const resume = typeof bot.claudeSessionId === "string" && bot.claudeSessionId !== "";
      live.translator = createTranslator(live.sessionId, this.deps.journal, (rows) => this.emitted(live, rows), {
        clock: this.clock,
        onFacts: (facts) => this.facts(bot.id, facts),
        onError: (error) => console.error(`bot session: a frame was not translated: ${error instanceof Error ? error.name : "error"}`),
      });
      const conn = await this.open(
        { cwd: bot.home, env, binary, sessionId: resume ? bot.claudeSessionId! : randomUUID(), resume, appendSystemPrompt: "", permissionMode: bot.permissionMode ?? "ask", ...(codeMode ? { codeMode } : {}), model: bot.model ?? null, effort: bot.effort ?? null, ...this.deps.launch?.(bot) },
        {
          onFrame: (frame) => this.frame(live, generation, frame),
          onPermission: (request) => this.permission(live, generation, request),
          onExit: (error, expected) => this.exited(live, generation, error, expected),
        },
      );
      live.conn = conn;
      this.cancelStalePrompts(live);
      this.touch(live);
      return conn;
    } catch (error) {
      live.translator = null;
      this.failed(live, error, "start");
      throw error;
    }
  }

  /** Room for one more session: the idle one used longest ago closes, or the start waits. */
  private async freeSlot(botId: string): Promise<void> {
    const open = [...this.lives.values()].filter((live) => live.botId !== botId && (live.conn !== null || live.opening !== null));
    if (open.length < this.limits.maxLive) return;
    const idle = open.filter((live) => live.conn !== null && !busy(live)).sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (idle === undefined) throw new BotError("no_slot", `${this.limits.maxLive} bot chats are busy`);
    await this.close(idle.botId);
  }

  /** Prompt rows an earlier process left pending: nothing can answer them now. */
  private cancelStalePrompts(live: Live): void {
    for (const row of this.deps.journal.pendingPrompts(live.sessionId)) {
      if (row.body.kind === "approval" || row.body.kind === "question") live.translator?.promptCancelled(row.body.promptKey, this.clock.now());
    }
  }

  private facts(botId: string, facts: SessionFacts): void {
    if (facts.claudeSessionId !== null && this.deps.store.bot(botId)?.claudeSessionId !== facts.claudeSessionId) {
      // from the first turn on, the transcript exists: the next start resumes it
      this.deps.store.updateBot(botId, { claudeSessionId: facts.claudeSessionId });
      this.deps.statusChanged(botId);
    }
    this.deps.journal.setChat(botId, { claudeSessionId: facts.claudeSessionId, leafUuid: facts.leafUuid }, this.clock.now());
  }

  // ---- sending ----

  private isQueued(live: Live, id: string): boolean {
    return this.deps.journal.queued(live.sessionId).some((message) => message.clientMessageId === id);
  }

  /** Sends the first queued message if nothing runs; returns its id, or null when it waits. */
  private async drain(botId: string): Promise<string | null> {
    const bot = this.deps.store.bot(botId);
    const live = this.lives.get(botId);
    if (!bot || bot.runtime !== "session" || bot.paused || live === undefined || live.draining || busy(live)) return null;
    if (this.stopped.has(botId) || this.deps.journal.queued(live.sessionId).length === 0) return null;
    live.draining = true;
    try {
      let conn: ClaudeConnection;
      try { conn = await this.connection(bot); } catch (error) { this.waits(live, error); return null; }
      if (busy(live)) return null;
      const next = this.deps.journal.dequeue(live.sessionId);
      if (next === null) return null;
      return await this.send(live, conn, next);
    } finally {
      live.draining = false;
    }
  }

  private async send(live: Live, conn: ClaudeConnection, message: QueuedMessage): Promise<string | null> {
    live.awaiting = true;
    live.sawRunning = false;
    this.touch(live);
    // the bots list shows the bot working from the send on, before Claude's first frame
    this.emitted(live, []);
    try {
      await conn.send(message.text, { uuid: message.clientMessageId });
      return message.clientMessageId;
    } catch (error) {
      live.awaiting = false;
      this.emitted(live, []);
      const code = error instanceof BotError ? error.code : "";
      if (code === "send_outcome_unknown") {
        // it may have reached Claude: sending it again could run it twice
        const known = this.deps.journal.submissionByUuid(live.sessionId, message.clientMessageId);
        if (known !== null) this.deps.journal.submission(live.sessionId, { ...known, state: "unknown", resolvedAt: this.clock.now() });
      } else {
        this.requeueFirst(live, message);
      }
      return null;
    }
  }

  /** Back to the front of the queue: it was first, and stays first. */
  private requeueFirst(live: Live, message: QueuedMessage): void {
    const rest: QueuedMessage[] = [];
    for (let next = this.deps.journal.dequeue(live.sessionId); next !== null; next = this.deps.journal.dequeue(live.sessionId)) rest.push(next);
    for (const entry of [message, ...rest]) this.deps.journal.enqueue(live.sessionId, entry);
  }

  /** Why a queued message did not go: said once in the chat, so the owner is not left guessing. */
  private waits(live: Live, error: unknown): void {
    const code = error instanceof BotError ? error.code : "";
    if (code === "no_slot") this.statusRow(live, "wait:slot", `This bot waits for a free chat slot: ${this.limits.maxLive} other bot chats are busy. Its message is kept and goes when one finishes.`, "warning", "no_slot");
    else if (code === "pane_live") this.statusRow(live, "wait:pane", `${reasonOf(error)}. The message is kept.`, "warning", "pane_live");
  }

  // ---- what Claude sends ----

  private frame(live: Live, generation: number, frame: Record<string, unknown>): void {
    const translator = live.translator;
    if (generation !== live.generation || translator === null) return;
    // a resume refused for its mode: the next start (the owner's next message) runs in that mode
    if (frame["type"] === "result" && codeModeResumeRefusal(resultText(frame)) && this.deps.store.bot(live.botId)?.codeMode !== true) {
      this.deps.store.updateBot(live.botId, { codeMode: true });
    }
    const before = translator.currentTurnId;
    const wasIdle = translator.liveState === "idle";
    translator.frame(frame, this.clock.now());
    const after = translator.currentTurnId;
    if (translator.liveState === "running") live.sawRunning = true;
    if (after !== null) live.awaiting = false;
    else if (live.awaiting && live.sawRunning && translator.liveState === "idle") live.awaiting = false;
    this.touch(live);
    // the translator announced its rows before the lines above settled what runs: say the status as it is now
    this.emitted(live, []);
    const ended = before !== null && after === null;
    // read again: the frame moved it, which the narrowing above cannot see
    const state: LiveState = translator.liveState;
    const nowIdle = !wasIdle && state === "idle";
    if ((ended || nowIdle) && !busy(live)) {
      void this.drain(live.botId);
      void this.retryWaiting(live.botId);
    }
  }

  private permission(live: Live, generation: number, request: PermissionRequest): Promise<PermissionResult | null> {
    const translator = live.translator;
    if (generation !== live.generation || translator === null) return Promise.resolve(null);
    const name = this.deps.store.bot(live.botId)?.name ?? "A bot";
    return holdPrompt(live, translator, request, {
      clock: this.clock,
      repushMs: this.limits.repushMs,
      push: (body, tag) => { void this.deps.notify(`${name} needs you`, body, null, tag).catch(() => {}); },
      changed: () => { this.touch(live); this.emitted(live, []); },
    });
  }

  private exited(live: Live, generation: number, error: Error, expected: boolean): void {
    if (generation !== live.generation || (live.conn === null && live.translator === null)) return;
    const translator = live.translator;
    live.conn = null;
    live.awaiting = false;
    clearIdle(live, this.clock);
    for (const prompt of live.prompts.values()) prompt.settle(null);
    live.prompts = new Map();
    // the translator settles its open rows (turn, tools, prompts); a crash also says so in the chat
    translator?.ended(expected ? "closed" : "crashed", this.clock.now());
    live.translator = null;
    if (!expected) this.failed(live, error, "crash");
    this.emitted(live, []);
    void this.retryWaiting(live.botId);
  }

  // ---- bookkeeping ----

  private failed(live: Live, error: unknown, kind: "start" | "crash"): void {
    const at = this.clock.now();
    const recent = [...(this.failures.get(live.botId) ?? []).filter((when) => at - when < this.limits.failWindowMs), at];
    this.failures = new Map([...this.failures, [live.botId, recent]]);
    const why = reasonOf(error);
    if (recent.length >= this.limits.failLimit) {
      this.stopped = new Set([...this.stopped, live.botId]);
      this.statusRow(live, `stopped:${at}`, `The bot's Claude failed ${recent.length} times within a minute (last: ${why}). It stays stopped until you send it a message or change a setting.`, "error", "start_failed");
    } else if (kind === "start") {
      this.statusRow(live, `start:${at}`, `The bot's Claude could not start (${why}). It tries again with the next message.`, "error", "start_failed");
    }
  }

  private unblock(botId: string): void {
    this.stopped = new Set([...this.stopped].filter((id) => id !== botId));
    this.failures = new Map([...this.failures].filter(([id]) => id !== botId));
  }

  /** Bots whose message waits for a slot try again once one may be free. */
  private async retryWaiting(freed: string): Promise<void> {
    for (const live of this.lives.values()) {
      if (live.botId === freed || live.conn !== null || live.opening !== null) continue;
      if (this.deps.journal.queued(live.sessionId).length > 0 && !this.stopped.has(live.botId)) await this.drain(live.botId);
    }
  }

  private statusRow(live: Live, key: string, text: string, tone: JournalStatus["tone"], code: string): void {
    const row = this.deps.journal.upsert(live.sessionId, `status:host:${key}`, { kind: "status", text, tone, code }, this.clock.now(), null);
    this.emitted(live, [row]);
  }

  private emitted(live: Live, rows: JournalRow[]): void {
    const status = liveStatus(live);
    const moved = status !== live.status;
    // a status that moves with no row (a turn's last frame, a stop) still goes to the open chats
    if (rows.length > 0 || moved) this.deps.changed(live.botId, rows, status);
    if (!moved) return;
    live.status = status;
    this.deps.statusChanged(live.botId);
  }

  /** Marks the session used and starts its idle clock again when nothing runs or waits. */
  private touch(live: Live): void {
    live.lastUsed = this.clock.now();
    clearIdle(live, this.clock);
    if (live.conn === null || busy(live)) return;
    live.idleTimer = this.clock.setTimer(() => {
      live.idleTimer = null;
      if (live.conn !== null && !busy(live)) void this.close(live.botId);
    }, this.limits.idleMs);
  }
}

/** A result frame's error text: `result`, or its `errors` joined. */
function resultText(frame: Record<string, unknown>): string {
  if (typeof frame["result"] === "string") return frame["result"];
  return Array.isArray(frame["errors"]) ? frame["errors"].map(String).join("\n") : "";
}
