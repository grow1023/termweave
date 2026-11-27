import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JournalBody, MessageFrom } from "../../../shared/bots/chat.ts";
import type { Bot } from "../../../shared/bots/types.ts";
import { BotError } from "../runtime.ts";
import { BotStore } from "../store.ts";
import type { ClaudeConnection, ClaudeHandlers, ClaudeLaunch } from "./connection.ts";
import * as f from "./fixtures.ts";
import { BotJournal } from "./journal.ts";
import { DENIED_MESSAGE, type PermissionRequest, type PermissionResult } from "./permission.ts";
import { BotSessionHost } from "./session.ts";
import type { PromptGate } from "./host-types.ts";
import type { TranslatorClock } from "./translate.ts";

const MIN = 60_000;

function fakeClock(): TranslatorClock & { advance(ms: number): void } {
  let now = 1_000;
  let next = 1;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    setTimer(fn, ms) { const id = next++; timers = [...timers, { id, at: now + ms, fn }]; return id; },
    clearTimer(handle) { timers = timers.filter((timer) => timer.id !== handle); },
    advance(ms) {
      now += ms;
      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      for (const timer of due) timer.fn();
    },
  };
}

interface FakeConn extends ClaudeConnection {
  launch: ClaudeLaunch;
  handlers: ClaudeHandlers;
  sent: { text: string; uuid: string }[];
  interrupts: number;
  modes: string[];
  models_: (string | null)[];
  efforts: (string | null)[];
  closed: boolean;
  sendError: Error | null;
  crash(): void;
}

let dir: string;
let store: BotStore;
let journal: BotJournal;
let clock: ReturnType<typeof fakeClock>;
let conns: FakeConn[];
let opens: number;
let failOpens: number;
let paneLive: boolean;
let notified: { tag: string; body: string }[];
let statusPushes: number;
let pushedStatus: string | null;
let prepared: string[];
let host: BotSessionHost;
let gate: ((request: PermissionRequest) => PromptGate | undefined) | null;

function fakeOpen(launch: ClaudeLaunch, handlers: ClaudeHandlers): Promise<ClaudeConnection> {
  opens += 1;
  if (failOpens > 0) { failOpens -= 1; return Promise.reject(new BotError("claude_not_found", "Claude Code was not found")); }
  let ended = false;
  const end = (error: Error, expected: boolean): void => { if (!ended) { ended = true; handlers.onExit(error, expected); } };
  const conn: FakeConn = {
    launch, handlers, sent: [], interrupts: 0, modes: [], models_: [], efforts: [], closed: false, sendError: null,
    sessionId: launch.sessionId, pid: 4242, exited: new Promise<Error>(() => {}),
    async send(text, opts) { if (conn.sendError) throw conn.sendError; conn.sent = [...conn.sent, { text, uuid: opts.uuid }]; },
    async interrupt() { conn.interrupts += 1; return { cancelled: true }; },
    async setPermissionMode(mode) { conn.modes = [...conn.modes, mode]; },
    async setModel(model) { conn.models_ = [...conn.models_, model]; },
    async setEffort(effort) { conn.efforts = [...conn.efforts, effort]; },
    async models() { return [{ value: "opus", label: "Opus", efforts: ["low", "high"] }]; },
    async close() { conn.closed = true; end(new BotError("claude_exited", "Claude Code exited with code 0"), true); },
    crash() { end(new BotError("claude_exited", "Claude Code exited with code 1"), false); },
  };
  conns = [...conns, conn];
  return Promise.resolve(conn);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tw-session-"));
  store = new BotStore(join(dir, "state"));
  journal = new BotJournal(join(dir, "state", "bot-journal.sqlite"));
  clock = fakeClock();
  conns = [];
  opens = 0;
  failOpens = 0;
  paneLive = false;
  notified = [];
  statusPushes = 0;
  pushedStatus = null;
  prepared = [];
  gate = null;
  host = new BotSessionHost({
    journal, store,
    env: async () => ({ PATH: "/usr/bin", CLAUDECODE: "1" }),
    changed: (_botId, _rows, status) => { pushedStatus = status; },
    statusChanged: () => { statusPushes += 1; },
    notify: async (_title, body, _pane, tag) => { notified = [...notified, { tag, body }]; },
    paneLive: async () => paneLive,
    open: fakeOpen,
    gate: async (_bot, request) => gate?.(request),
    resolveBinary: () => "/opt/claude",
    clock,
  });
  host.setPrepare((bot) => { prepared = [...prepared, bot.id]; });
});
afterEach(async () => {
  await host.closeAll();
  journal.close();
  rmSync(dir, { recursive: true, force: true });
});

function addBot(id: string, over: Partial<Bot> = {}): Bot {
  const home = join(dir, "homes", id);
  mkdirSync(home, { recursive: true });
  const bot: Bot = { id, name: `Bot ${id}`, agent: "claude", home, repo: null, paused: false, paneId: null, createdAt: "2026-11-27T00:00:00Z", runtime: "session", ...over };
  store.addBot(bot);
  return bot;
}

const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Bun.sleep(0); };
const owner: MessageFrom = { kind: "owner" };
const mail: MessageFrom = { kind: "termweave", label: null };
const session = (botId: string): string => journal.chat(botId)!.sessionId;
const body = (botId: string, itemId: string): JournalBody | undefined => journal.row(session(botId), itemId)?.body;
const rows = (botId: string): JournalBody[] => journal.page(session(botId), { direction: "tail" }).items.map((row) => row.body);
const feed = (conn: FakeConn, frames: Record<string, unknown>[]): void => { for (const frame of frames) conn.handlers.onFrame(frame); };
/** frames up to Claude taking the message (the turn is open), and the rest of the turn */
const turnStart = (uuid: string, text: string, id: string) => f.plainTurn(uuid, text, id, ["ok"]).slice(0, 7);
const turnEnd = (uuid: string, text: string, id: string) => f.plainTurn(uuid, text, id, ["ok"]).slice(7);
const fullTurn = (conn: FakeConn, at: number, id: string): void => {
  const sent = conn.sent[at]!;
  feed(conn, f.plainTurn(sent.uuid, sent.text, id, ["ok"]));
};

function request(toolName: string, input: Record<string, unknown>, key = "req-1"): PermissionRequest & { abort: AbortController } {
  const abort = new AbortController();
  return {
    toolName, input, requestId: key, toolUseID: `tool-${key}`, agentID: undefined,
    suggestions: [{ type: "addRules", rules: [{ toolName, ruleContent: "x" }], behavior: "allow", destination: "localSettings" }],
    title: undefined, displayName: undefined, description: undefined, decisionReason: undefined, blockedPath: undefined,
    signal: abort.signal, abort,
  };
}

test("the first message opens a new session in the bot's home and sends it", async () => {
  const bot = addBot("b1");
  const sent = await host.tell("b1", "hello", owner);
  expect(sent.state).toBe("accepted");
  expect(conns).toHaveLength(1);
  const conn = conns[0]!;
  expect(conn.launch).toMatchObject({ cwd: bot.home, binary: "/opt/claude", resume: false, appendSystemPrompt: "", permissionMode: "ask" });
  expect(conn.launch.env["CLAUDECODE"]).toBeUndefined();
  expect(conn.launch.env["CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS"]).toBe("1");
  expect(prepared).toEqual(["b1"]);
  expect(conn.sent).toEqual([{ text: "hello", uuid: sent.clientMessageId }]);
  fullTurn(conn, 0, "m1");
  // Claude's id is the bot's once its first turn ran: the next start resumes it
  expect(store.bot("b1")?.claudeSessionId).toBe(f.SESSION);
  expect(host.status("b1")).toBe("done");
  await host.close("b1");
  await host.tell("b1", "again", owner);
  expect(conns[1]!.launch).toMatchObject({ resume: true, sessionId: f.SESSION });
});

test("the status pushed to open chats is the status the host reports, after every frame of a turn", async () => {
  addBot("b1");
  const sent = await host.tell("b1", "hello", owner);
  const conn = conns[0]!;
  for (const frame of f.plainTurn(sent.clientMessageId, "hello", "m1", ["ok"])) {
    feed(conn, [frame]);
    expect(pushedStatus).toBe(host.status("b1"));
  }
  expect(host.status("b1")).toBe("done");
});

test("a resume refused for Code Mode marks the bot, and its next start runs in that mode", async () => {
  addBot("b1", { claudeSessionId: "11111111-1111-4111-8111-111111111111" });
  await host.tell("b1", "hello", owner);
  expect(conns[0]!.launch.codeMode).toBeUndefined();
  feed(conns[0]!, [{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["Failed to resume session: This session was started in Code Mode (experimental), which is off in this run, so it can't be resumed."] }]);
  expect(store.bot("b1")?.codeMode).toBe(true);
  conns[0]!.handlers.onExit(new Error("exit 1"), false);
  await settle();
  await host.tell("b1", "again", owner);
  await settle();
  expect(conns.at(-1)!.launch.codeMode).toBe(true);
  expect(conns.at(-1)!.launch.env["CLAUDE_CODE_ENTRYPOINT"]).toBe("sdk-ts");
});

test("a model and an effort start with the session, and a change reaches a live one", async () => {
  addBot("b1", { model: "sonnet", effort: "low" });
  await host.tell("b1", "hello", owner);
  const conn = conns[0]!;
  expect(conn.launch).toMatchObject({ model: "sonnet", effort: "low" });
  await host.settingsChanged("b1", { model: "opus", effort: null });
  expect(conn.models_).toEqual(["opus"]);
  expect(conn.efforts).toEqual([null]);
  expect(await host.models("b1")).toEqual([{ value: "opus", label: "Opus", efforts: ["low", "high"] }]);
  await host.close("b1");
  // with no live session the last list still answers
  expect(await host.models("b1")).toHaveLength(1);
});

test("messages during a turn wait and go after it, one per turn, in order", async () => {
  addBot("b1");
  const a = await host.tell("b1", "A", owner);
  const conn = conns[0]!;
  feed(conn, turnStart(a.clientMessageId, "A", "m1"));
  expect(host.status("b1")).toBe("working");
  expect((await host.tell("b1", "B", mail)).state).toBe("queued");
  expect((await host.tell("b1", "C", owner)).state).toBe("queued");
  expect(conn.sent.map((entry) => entry.text)).toEqual(["A"]);
  feed(conn, turnEnd(a.clientMessageId, "A", "m1"));
  await settle();
  expect(conn.sent.map((entry) => entry.text)).toEqual(["A", "B"]);
  fullTurn(conn, 1, "m2");
  await settle();
  expect(conn.sent.map((entry) => entry.text)).toEqual(["A", "B", "C"]);
  expect(body("b1", `user:${conn.sent[1]!.uuid}`)).toMatchObject({ from: { kind: "termweave" } });
});

test("stop interrupts the turn and the turn reads as interrupted", async () => {
  addBot("b1");
  const a = await host.tell("b1", "long job", owner);
  const conn = conns[0]!;
  feed(conn, turnStart(a.clientMessageId, "long job", "m1"));
  expect(await host.stop("b1")).toEqual({ cancelled: true });
  expect(conn.interrupts).toBe(1);
  feed(conn, [f.result("error_during_execution"), f.state("idle")]);
  expect(body("b1", `turn:${a.clientMessageId}`)).toMatchObject({ state: "interrupted" });
});

async function promptFor(toolName: string, input: Record<string, unknown>, key = "req-1") {
  addBot("b1");
  const a = await host.tell("b1", "do it", owner);
  const conn = conns[0]!;
  feed(conn, turnStart(a.clientMessageId, "do it", "m1"));
  const req = request(toolName, input, key);
  let result: PermissionResult | null | "waiting" = "waiting";
  void conn.handlers.onPermission(req).then((value) => { result = value; });
  return { conn, req, result: () => result };
}

test("a permission prompt writes a row, pushes now and once more after 30 minutes, and waits", async () => {
  const { result } = await promptFor("Bash", { command: "rm -rf build" });
  expect(body("b1", "prompt:req-1")).toMatchObject({ kind: "approval", resolution: { state: "pending" } });
  expect(host.status("b1")).toBe("blocked");
  expect(notified).toEqual([{ tag: "bot-b1-prompt-req-1", body: "Allow Bash?" }]);
  clock.advance(29 * MIN);
  expect(notified).toHaveLength(1);
  clock.advance(1 * MIN);
  expect(notified).toHaveLength(2);
  clock.advance(10 * 60 * MIN);
  expect(notified).toHaveLength(2);
  await settle();
  expect(result()).toBe("waiting");
});

test("allow once answers with the input as given", async () => {
  const { result } = await promptFor("Bash", { command: "ls" });
  await host.answer("b1", "prompt:req-1", { kind: "option", optionId: "allow" }, "owner");
  await settle();
  expect(result()).toEqual({ behavior: "allow", updatedInput: { command: "ls" }, toolUseID: "tool-req-1" });
  expect(body("b1", "prompt:req-1")).toMatchObject({ resolution: { state: "resolved", resolvedBy: "owner" } });
  expect(host.status("b1")).toBe("working");
});

test("allow for this session keeps the suggested rules in the session only", async () => {
  const { result } = await promptFor("Bash", { command: "ls" });
  await host.answer("b1", "prompt:req-1", { kind: "option", optionId: "allowForSession" }, "owner");
  await settle();
  expect(result()).toMatchObject({ behavior: "allow", updatedPermissions: [{ type: "addRules", destination: "session" }] });
});

test("deny answers with the denial, and a second answer is refused", async () => {
  const { result } = await promptFor("Bash", { command: "ls" });
  await host.answer("b1", "prompt:req-1", { kind: "option", optionId: "deny" }, "owner");
  await settle();
  expect(result()).toEqual({ behavior: "deny", message: DENIED_MESSAGE, toolUseID: "tool-req-1" });
  await expect(host.answer("b1", "prompt:req-1", { kind: "option", optionId: "allow" }, "owner")).rejects.toMatchObject({ code: "prompt_already_answered" });
});

test("an answer that does not fit the prompt is refused and the prompt still waits", async () => {
  const { result } = await promptFor("Bash", { command: "ls" });
  await expect(host.answer("b1", "prompt:req-1", { kind: "option", optionId: "launch" }, "owner")).rejects.toMatchObject({ code: "invalid_answer" });
  await settle();
  expect(result()).toBe("waiting");
});

test("AskUserQuestion waits for the person, then gets the chosen labels", async () => {
  const input = { questions: [{ question: "Which branch?", header: "Branch", multiSelect: false, options: [{ label: "main" }, { label: "dev" }] }] };
  const { result } = await promptFor("AskUserQuestion", input);
  expect(host.status("b1")).toBe("waiting");
  clock.advance(24 * 60 * MIN);
  await settle();
  expect(result()).toBe("waiting");
  const row = body("b1", "prompt:req-1");
  if (row?.kind !== "question") throw new Error("expected a question row");
  await host.answer("b1", "prompt:req-1", { kind: "answers", answers: [{ questionId: "q1", optionIds: [row.questions[0]!.options[1]!.id] }] }, "owner");
  await settle();
  expect(result()).toMatchObject({ behavior: "allow", updatedInput: { ...input, answers: { "Which branch?": "dev" } } });
});

test("an unexpected exit cancels prompts, keeps the queue, and the next message reopens", async () => {
  const { conn, result } = await promptFor("Bash", { command: "ls" });
  expect((await host.tell("b1", "queued while busy", mail)).state).toBe("queued");
  conn.crash();
  await settle();
  expect(result()).toBeNull();
  expect(body("b1", "prompt:req-1")).toMatchObject({ resolution: { state: "cancelled" } });
  expect(rows("b1").some((row) => row.kind === "turn" && row.state === "unverifiable")).toBe(true);
  expect(rows("b1").some((row) => row.kind === "status" && row.code === "crashed")).toBe(true);
  expect(journal.queued(session("b1")).map((entry) => entry.text)).toEqual(["queued while busy"]);
  expect(host.status("b1")).toBe("offline");
  expect(conns).toHaveLength(1);
  await host.tell("b1", "new one", owner);
  expect(conns).toHaveLength(2);
  // the message that waited goes first; the new one waits for its turn
  expect(conns[1]!.sent.map((entry) => entry.text)).toEqual(["queued while busy"]);
  expect(journal.queued(session("b1")).map((entry) => entry.text)).toEqual(["new one"]);
});

test("a send that was not written stays queued for the next start", async () => {
  addBot("b1");
  await host.tell("b1", "first", owner);
  const conn = conns[0]!;
  fullTurn(conn, 0, "m1");
  conn.sendError = new BotError("send_unwritten", "the session ended before this message was sent");
  expect((await host.tell("b1", "second", owner)).state).toBe("queued");
  expect(journal.queued(session("b1")).map((entry) => entry.text)).toEqual(["second"]);
});

test("two failed starts within a minute stop the retries until the owner writes", async () => {
  addBot("b1");
  failOpens = 2;
  expect((await host.tell("b1", "one", mail)).state).toBe("queued");
  expect(rows("b1").filter((row) => row.kind === "status" && row.code === "start_failed")).toHaveLength(1);
  expect((await host.tell("b1", "two", mail)).state).toBe("queued");
  const failures = rows("b1").filter((row) => row.kind === "status" && row.code === "start_failed");
  expect(failures).toHaveLength(2);
  expect(failures[1]).toMatchObject({ text: expect.stringContaining("stays stopped") });
  await host.tell("b1", "three", mail);
  expect(opens).toBe(2);
  await host.tell("b1", "owner writes", owner);
  expect(opens).toBe(3);
  expect(conns[0]!.sent.map((entry) => entry.text)).toEqual(["one"]);
  expect(journal.queued(session("b1"))).toHaveLength(3);
});

test("an idle session closes after 20 minutes and resumes on the next message", async () => {
  addBot("b1");
  await host.tell("b1", "hi", owner);
  fullTurn(conns[0]!, 0, "m1");
  clock.advance(19 * MIN);
  expect(conns[0]!.closed).toBe(false);
  clock.advance(1 * MIN);
  await settle();
  expect(conns[0]!.closed).toBe(true);
  expect(host.status("b1")).toBe("offline");
  // a quiet close is no crash: no status row
  expect(rows("b1").some((row) => row.kind === "status")).toBe(false);
  await host.tell("b1", "back", owner);
  expect(conns[1]!.launch.resume).toBe(true);
});

test("a session with a waiting prompt is not closed for idleness", async () => {
  const { conn } = await promptFor("Bash", { command: "ls" });
  clock.advance(3 * 60 * MIN);
  await settle();
  expect(conn.closed).toBe(false);
});

test("at most 4 live sessions: the idle one used longest ago gives way", async () => {
  for (const id of ["b1", "b2", "b3", "b4", "b5"]) addBot(id);
  for (const [at, id] of ["b1", "b2", "b3", "b4"].entries()) {
    await host.tell(id, "hi", owner);
    fullTurn(conns[at]!, 0, `m${id}`);
    clock.advance(1_000);
  }
  await host.tell("b5", "hi", owner);
  expect(conns[0]!.closed).toBe(true);
  expect(conns.slice(1).every((conn) => !conn.closed)).toBe(true);
  expect(host.liveCount()).toBe(4);
});

test("with 4 busy sessions a fifth bot waits for a free slot, then goes", async () => {
  for (const id of ["b1", "b2", "b3", "b4", "b5"]) addBot(id);
  const first: Record<string, string> = {};
  for (const [at, id] of ["b1", "b2", "b3", "b4"].entries()) {
    first[id] = (await host.tell(id, "work", owner)).clientMessageId;
    feed(conns[at]!, turnStart(first[id]!, "work", `m${id}`));
  }
  expect((await host.tell("b5", "me too", mail)).state).toBe("queued");
  expect(body("b5", "status:host:wait:slot")).toMatchObject({ kind: "status", code: "no_slot" });
  expect(conns).toHaveLength(4);
  feed(conns[1]!, turnEnd(first["b2"]!, "work", "mb2"));
  await settle();
  expect(conns[1]!.closed).toBe(true);
  expect(conns).toHaveLength(5);
  expect(conns[4]!.sent.map((entry) => entry.text)).toEqual(["me too"]);
});

test("closeAll ends every session", async () => {
  addBot("b1");
  addBot("b2");
  await host.tell("b1", "hi", owner);
  await host.tell("b2", "hi", owner);
  expect(host.liveCount()).toBe(2);
  await host.closeAll();
  expect(conns.every((conn) => conn.closed)).toBe(true);
  expect(host.liveCount()).toBe(0);
  expect(statusPushes).toBeGreaterThan(0);
});

test("no session opens while the bot's terminal still runs (one Claude session, one place)", async () => {
  const bot = addBot("b1", { paneId: "p1" });
  paneLive = true;
  await expect(host.ensure(bot)).rejects.toMatchObject({ code: "pane_live" });
  expect((await host.tell("b1", "hi", owner)).state).toBe("queued");
  expect(body("b1", "status:host:wait:pane")).toMatchObject({ code: "pane_live" });
  expect(opens).toBe(0);
});

test("a pane bot is refused", async () => {
  addBot("b1", { runtime: "pane" });
  await expect(host.tell("b1", "hi", owner)).rejects.toMatchObject({ code: "not_session_bot" });
});

test("a host's gate refuses a request with no card, or asks with no lasting option and hears of the approval", async () => {
  let approvals = 0;
  gate = (request) => request.toolName === "mcp__other__delete" ? { deny: "not yours" }
    : { card: { once: true, detail: "npm test", action: { kind: "send", target: "P3 api" } }, allowed: () => { approvals += 1; } };
  const refused = await promptFor("mcp__other__delete", { id: 1 });
  await settle();
  expect(refused.result()).toEqual({ behavior: "deny", message: "not yours", toolUseID: "tool-req-1" });
  expect(body("b1", "prompt:req-1")).toBeUndefined();

  const req = request("mcp__termweave__send_to_terminal", { pane_id: "w1:p1", text: "npm test" }, "req-2");
  let result: PermissionResult | null | "waiting" = "waiting";
  void refused.conn.handlers.onPermission(req).then((value) => { result = value; });
  await settle();
  expect(body("b1", "prompt:req-2")).toMatchObject({ detail: "npm test", action: { kind: "send", target: "P3 api" }, options: [{ id: "allow" }, { id: "deny" }] });
  await expect(host.answer("b1", "prompt:req-2", { kind: "option", optionId: "allowForSession" }, "owner")).rejects.toMatchObject({ code: "invalid_answer" });
  expect(approvals).toBe(0);
  await host.answer("b1", "prompt:req-2", { kind: "option", optionId: "allow" }, "owner");
  await settle();
  expect(result).toMatchObject({ behavior: "allow", updatedInput: { pane_id: "w1:p1", text: "npm test" } });
  expect(approvals).toBe(1);
});
