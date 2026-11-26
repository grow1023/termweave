import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JournalBody, JournalRow, MessageFrom } from "../../../shared/bots/chat.ts";
import * as f from "./fixtures.ts";
import { BotJournal, TOOL_OUTPUT_MAX_BYTES } from "./journal.ts";
import { createTranslator, type Translator, type TranslatorClock } from "./translate.ts";

function fakeClock(): TranslatorClock & { advance(ms: number): void; pending(): number } {
  let now = 0;
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
    pending: () => timers.length,
  };
}

let dir: string;
let journal: BotJournal;
let session: string;
let clock: ReturnType<typeof fakeClock>;
let emitted: JournalRow[][];
let tr: Translator;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tw-translate-"));
  journal = new BotJournal(join(dir, "bot-journal.sqlite"));
  session = journal.setChat("bot-1", {}).sessionId;
  clock = fakeClock();
  emitted = [];
  tr = createTranslator(session, journal, (rows) => { emitted = [...emitted, rows]; }, { clock });
});
afterEach(() => {
  journal.close();
  rmSync(dir, { recursive: true, force: true });
});

const send = (uuid: string, text: string, from: MessageFrom = { kind: "owner" }): void =>
  journal.submission(session, { clientMessageId: `c-${uuid}`, uuid, state: "pending", from, text, submittedAt: 0, resolvedAt: null });
const feed = (frames: Record<string, unknown>[]): void => { for (const frame of frames) tr.frame(frame, clock.now()); };
const rows = (): JournalRow[] => journal.page(session, { direction: "tail" }).items;
const body = (itemId: string): JournalBody | undefined => journal.row(session, itemId)?.body;

test("a plain turn: the send is confirmed once, the reply is one row, the turn completes", () => {
  send("u1", "hello");
  feed(f.plainTurn("u1", "hello", "m1", ["o", "k"]));
  expect(tr.facts).toEqual({ claudeSessionId: f.SESSION, model: "claude-test-1", leafUuid: "a-m1" });
  feed([f.replay("u1", "hello")]); // a repeated replay writes nothing new
  expect(journal.submissionByUuid(session, "u1")?.state).toBe("accepted");
  expect(rows().map((row) => row.itemId)).toEqual(["turn:u1", "user:u1", "msg:m1:0"]);
  expect(body("user:u1")).toMatchObject({ role: "user", text: "hello", from: { kind: "owner" } });
  expect(body("msg:m1:0")).toMatchObject({ role: "assistant", text: "ok", state: "completed" });
  expect(body("turn:u1")).toMatchObject({
    state: "completed", outcome: "success", durationMs: 1234, costUsd: 0.01, model: "claude-test-1",
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 7, cacheCreationTokens: 1 },
  });
  expect(tr.currentTurnId).toBeNull();
  expect(tr.liveState).toBe("idle");
});

test("hooks, ui_invalidate, status and rate-limit frames write no rows", () => {
  feed([f.hook("hook_started"), f.hook("hook_response"), f.uiInvalidate(), f.statusFrame(), f.rateLimit("allowed"), f.rateLimit("allowed_warning"), f.state("running")]);
  expect(rows()).toHaveLength(0);
  expect(emitted).toHaveLength(0);
});

test("system mail is marked as from TermWeave", () => {
  send("u2", "worker w1 finished", { kind: "termweave", label: "worker w1" });
  feed([f.replay("u2", "worker w1 finished")]);
  expect(body("user:u2")).toMatchObject({ from: { kind: "termweave", label: "worker w1" } });
});

test("a user line with no send behind it is not drawn as the owner's", () => {
  feed([f.replay("stray", "[Request interrupted by user]")]);
  expect(rows()).toHaveLength(0);
});

test("streaming text is coalesced to one revision per 250 ms", () => {
  send("u1", "count");
  feed([f.replay("u1", "count"), f.messageStart("m1"), f.blockStart(0, "text")]);
  tr.frame(f.textDelta(0, "1"), 0);
  expect(body("msg:m1:0")).toMatchObject({ text: "1", state: "running" });
  for (const piece of ["2", "3", "4"]) { clock.advance(50); tr.frame(f.textDelta(0, piece), clock.now()); }
  expect(journal.row(session, "msg:m1:0")?.revision).toBe(1);
  expect(clock.pending()).toBe(1);
  clock.advance(100); // 250 ms after the first write
  expect(journal.row(session, "msg:m1:0")).toMatchObject({ revision: 2, body: { text: "1234" } });
  expect(emitted[emitted.length - 1]?.map((row) => row.itemId)).toEqual(["msg:m1:0"]);
  feed([f.assistant("m1", "a1", [f.text("1234")]), f.result("success")]);
  expect(body("msg:m1:0")).toMatchObject({ text: "1234", state: "completed" });
  expect(clock.pending()).toBe(0);
});

test("thinking and text blocks of one message become separate rows in order", () => {
  send("u1", "think");
  feed([
    f.replay("u1", "think"), f.messageStart("m1"), f.blockStart(0, "thinking"), f.thinkingDelta(0, "hmm"),
    f.assistant("m1", "a1", [f.thinking("hmm, yes")]), f.blockStop(0),
    f.blockStart(1, "text"), f.textDelta(1, "answer"), f.assistant("m1", "a2", [f.text("answer")]), f.blockStop(1),
  ]);
  expect(body("msg:m1:0")).toMatchObject({ role: "reasoning", text: "hmm, yes", state: "completed" });
  expect(body("msg:m1:1")).toMatchObject({ role: "assistant", text: "answer" });
});

test("a tool call runs, then completes with bounded output", () => {
  send("u1", "look");
  const long = `${"h".repeat(TOOL_OUTPUT_MAX_BYTES)}${"t".repeat(TOOL_OUTPUT_MAX_BYTES)}`;
  feed([f.replay("u1", "look"), f.assistant("m1", "a1", [f.toolUseBlock("call-1", "FakeRead", { file_path: `${f.CWD}/NOTE.md` })])]);
  expect(body("tool:call-1")).toMatchObject({ kind: "tool-call", state: "running", summary: `${f.CWD}/NOTE.md` });
  expect(journal.row(session, "tool:call-1")?.turnId).toBe("u1");
  feed([f.toolResult("call-1", [{ type: "text", text: long }])]);
  const done = body("tool:call-1");
  if (done?.kind !== "tool-call") throw new Error("kind");
  expect(done.state).toBe("completed");
  expect(done.output?.bytes).toBe(2 * TOOL_OUTPUT_MAX_BYTES);
  expect(done.output?.cut).toBe(TOOL_OUTPUT_MAX_BYTES);
  expect(done.output?.text.startsWith("hhh")).toBe(true);
  expect(done.output?.text.endsWith("ttt")).toBe(true);
});

test("a denied tool result marks the call failed", () => {
  feed([f.assistant("m1", "a1", [f.toolUseBlock("call-2", "FakeShell", { command: "touch x" })]), f.toolResult("call-2", "User denied this action.", true)]);
  expect(body("tool:call-2")).toMatchObject({ state: "failed", isError: true, output: { text: "User denied this action." } });
});

test("an interrupt closes the turn as interrupted and fails the running call", () => {
  send("u1", "slow");
  feed([f.replay("u1", "slow"), f.messageStart("m1"), f.blockStart(0, "text"), f.textDelta(0, "par"),
    f.assistant("m1", "a1", [f.toolUseBlock("call-3", "FakeShell", { command: "sleep" })])]);
  tr.interrupting();
  feed([f.result("error_during_execution"), f.state("idle")]);
  expect(body("turn:u1")).toMatchObject({ state: "interrupted", outcome: "error_during_execution" });
  expect(body("tool:call-3")).toMatchObject({ state: "failed", endedAs: "interrupted" });
  expect(body("msg:m1:0")).toMatchObject({ text: "par", state: "completed" });
  expect(rows().some((row) => row.body.kind === "status")).toBe(false);
});

test("an error result without an interrupt fails the turn with a visible status", () => {
  send("u1", "go");
  feed([f.replay("u1", "go"), f.result("success", { is_error: true, result: "Claude AI usage limit reached|1900000000" })]);
  expect(body("turn:u1")).toMatchObject({ state: "failed" });
  const statuses = rows().filter((row) => row.body.kind === "status");
  expect(statuses).toHaveLength(1);
  expect(statuses[0]?.body).toMatchObject({ tone: "error", code: "usage_limit" });
});

test("an API error assistant frame becomes a status row, not reply text", () => {
  send("u1", "go");
  feed([f.replay("u1", "go"), f.assistant("m9", "a9", [f.text("API Error: 500 internal")], { error: "server_error" })]);
  expect(body("status:m9")).toMatchObject({ kind: "status", tone: "error", code: "api_error", detail: { text: "API Error: 500 internal" } });
  expect(body("msg:m9:0")).toBeUndefined();
});

test("a rejected rate limit writes one status row", () => {
  send("u1", "go");
  feed([f.replay("u1", "go"), f.rateLimit("rejected"), f.rateLimit("rejected")]);
  expect(rows().filter((row) => row.body.kind === "status")).toHaveLength(1);
});

test("a later init never starts a new chat or renames the session", () => {
  feed([f.init(f.SESSION, "model-a"), f.init("other-session", "model-b")]);
  expect(tr.facts.claudeSessionId).toBe(f.SESSION);
  expect(tr.facts.model).toBe("model-a");
  expect(rows()).toHaveLength(0);
});

test("unknown and malformed frames are ignored without throwing", () => {
  const errors: unknown[] = [];
  const quiet = createTranslator(session, journal, () => {}, { clock, onError: (error) => { errors.push(error); } });
  const odd: unknown[] = [{}, { type: "brand_new_kind" }, { type: "assistant", message: null }, { type: "user", message: { content: 5 } },
    { type: "stream_event", event: { type: "content_block_delta", index: "x" } }, { type: "result" }, { type: "system", subtype: 3 }];
  for (const frame of odd) expect(() => quiet.frame(frame as Record<string, unknown>, 0)).not.toThrow();
  expect(() => quiet.frame(null as unknown as Record<string, unknown>, 0)).not.toThrow();
  expect(errors).toHaveLength(0);
});

test("an approval is pending until answered once; a bad answer is refused", () => {
  send("u1", "write");
  feed([f.replay("u1", "write"), f.state("requires_action")]);
  tr.prompt({ promptKey: "req-1", toolName: "FakeShell", input: { command: "touch x" }, toolUseId: "call-4", blockedPath: `${f.CWD}/x` }, 5);
  expect(body("prompt:req-1")).toMatchObject({ kind: "approval", title: "Allow FakeShell?", callId: "call-4", resolution: { state: "pending" } });
  expect(journal.pendingPrompts(session)).toHaveLength(1);
  expect(tr.promptAnswered("req-1", { kind: "option", optionId: "nope" }, "owner")).toBeNull();
  expect(tr.promptAnswered("req-1", { kind: "option", optionId: "allow" }, "owner")?.body).toMatchObject({ resolution: { state: "resolved", resolvedBy: "owner" } });
  expect(tr.promptAnswered("req-1", { kind: "option", optionId: "deny" }, "owner")).toBeNull();
});

test("an AskUserQuestion prompt becomes a question row with escaped option ids", () => {
  tr.prompt({ promptKey: "req-2", toolName: "AskUserQuestion", input: { questions: [{ question: "Which?", header: "Pick", multiSelect: false, options: [{ label: "A" }, { label: "B", description: "the other" }] }] } }, 1);
  const question = body("prompt:req-2");
  if (question?.kind !== "question") throw new Error("kind");
  expect(question.questions[0]?.options.map((option) => option.id)).toEqual(["q1:choice-1", "q1:choice-2"]);
  expect(tr.promptAnswered("req-2", { kind: "answers", answers: [{ questionId: "q1", optionIds: ["q1:choice-1", "q1:choice-2"] }] }, "owner")).toBeNull();
  expect(tr.promptAnswered("req-2", { kind: "answers", answers: [{ questionId: "q1", optionIds: ["q1:choice-2"], other: "why not" }] }, "owner")).not.toBeNull();
});

test("a plan prompt and a cancelled prompt", () => {
  tr.prompt({ promptKey: "req-3", toolName: "ExitPlanMode", input: { plan: "1. do it" } }, 1);
  expect(body("prompt:req-3")).toMatchObject({ title: "Review proposed plan", plan: "1. do it", detail: null });
  tr.promptCancelled("req-3", 2);
  expect(body("prompt:req-3")).toMatchObject({ resolution: { state: "cancelled", resolvedAt: 2 } });
});

test("ended settles the open turn, running calls and pending prompts", () => {
  send("u1", "work");
  feed([f.replay("u1", "work"), f.assistant("m1", "a1", [f.toolUseBlock("call-5", "FakeShell", { command: "long" })])]);
  tr.prompt({ promptKey: "req-4", toolName: "FakeShell", input: {} }, 1);
  tr.ended("crashed", 9);
  expect(body("turn:u1")).toMatchObject({ state: "unverifiable", completedAt: 9 });
  expect(body("tool:call-5")).toMatchObject({ state: "failed", endedAs: "unverifiable" });
  expect(body("prompt:req-4")).toMatchObject({ resolution: { state: "cancelled" } });
  expect(rows().some((row) => row.body.kind === "status" && row.body.code === "crashed")).toBe(true);
  expect(journal.running(session)).toHaveLength(0);
  expect(tr.liveState).toBeNull();
});

test("a closed process interrupts the turn and writes no error", () => {
  send("u1", "work");
  feed([f.replay("u1", "work")]);
  tr.ended("closed", 3);
  expect(body("turn:u1")).toMatchObject({ state: "interrupted" });
  expect(rows().some((row) => row.body.kind === "status")).toBe(false);
});

test("session_state idle settles a turn that got no result", () => {
  send("u1", "x");
  feed([f.replay("u1", "x"), f.state("idle")]);
  expect(body("turn:u1")).toMatchObject({ state: "completed" });
  expect((body("turn:u1") as { outcome?: string }).outcome).toBeUndefined();
});
