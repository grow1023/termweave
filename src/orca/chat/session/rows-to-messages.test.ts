import { describe, expect, test } from "bun:test";

import type { JournalBody, JournalRow } from "../../../../shared/bots/chat.ts";
import type { Translate } from "../../../lib/i18n.ts";
import type { NativeChatTextBlock } from "../shared/index.ts";
import { noticeLabel } from "../transcript/notice-label.ts";
import { currentHold, pendingPromptRows, rowsToMessages } from "./rows-to-messages.ts";

/** English with the placeholders filled, as the app's `t` does for a missing key. */
const t: Translate = (key, vars) => (vars === undefined ? key : key.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)));

let seq = 0;
const row = (itemId: string, body: JournalBody, turnId: string | null = "t1", extra: Partial<JournalRow> = {}): JournalRow => {
  seq += 1;
  return { itemId, revision: 1, sequence: seq, ordinal: seq, observedAt: 10_000 + seq * 1_000, turnId, body, ...extra };
};
const bounded = (text: string) => ({ text, bytes: text.length, cut: 0 });
const user = (id: string, text: string, turnId = "t1") => row(`user:${id}`, { kind: "message", role: "user", text, from: { kind: "owner" } }, turnId);
const said = (id: string, text: string, turnId = "t1") => row(id, { kind: "message", role: "assistant", text, state: "completed" }, turnId);
const tool = (id: string, state: "running" | "completed" | "failed", extra: Record<string, unknown> = {}) => row(id, {
  kind: "tool-call", name: "Bash", callId: `call-${id}`, summary: "ls /srv/app", input: bounded('{"command":"ls /srv/app"}'), state,
  ...(state === "running" ? {} : { output: bounded(state === "failed" ? "no such file" : "a.txt") }),
  ...(state === "failed" ? { isError: true } : {}), ...extra,
} as JournalBody);
const turn = (state: "running" | "completed" | "interrupted" | "failed", turnId = "t1", extra: Record<string, unknown> = {}) =>
  row(`turn:${turnId}`, { kind: "turn", turnId, state, startedAt: 10_000, ...(state === "running" ? {} : { completedAt: 99_000, durationMs: 89_000 }), ...extra } as JournalBody, turnId);

const approval = (state: "pending" | "resolved" | "cancelled", optionId?: string) => row("prompt:p1", {
  kind: "approval", promptKey: "p1", title: "Allow Bash?", toolName: "Bash", detail: '{"command":"rm x"}',
  options: [{ id: "allow", label: "Allow" }, { id: "allowForSession", label: "Allow for this session" }, { id: "deny", label: "Deny" }],
  resolution: { state, answer: optionId ? { kind: "option", optionId } : null, resolvedBy: optionId ? "owner" : null, resolvedAt: optionId ? 1 : null },
});

describe("rowsToMessages", () => {
  test("ids are the journal's item ids and do not move as rows arrive", () => {
    const first = rowsToMessages([user("u1", "hi"), said("a1", "hello")], t);
    const later = rowsToMessages([user("u1", "hi"), said("a1", "hello"), tool("c1", "running")], t);
    expect(first.map((m) => m.id)).toEqual(["user:u1", "a1"]);
    expect(later.map((m) => m.id)).toEqual(["user:u1", "a1"]);
  });

  test("draws rows by ordinal, not by the order they came in", () => {
    const a = said("a1", "first");
    const b = said("a2", "second");
    const messages = rowsToMessages([{ ...a, sequence: 99, revision: 2 }, b], t);
    expect(messages[0]?.blocks).toEqual([{ type: "text", text: "first" }, { type: "text", text: "second" }]);
  });

  test("a running call has no result; a done call has one; a failed call is an error", () => {
    const blocks = (state: "running" | "completed" | "failed") => rowsToMessages([tool("c1", state)], t)[0]!.blocks;
    expect(blocks("running").map((b) => b.type)).toEqual(["tool-call"]);
    expect(blocks("completed")[1]).toEqual({ type: "tool-result", callId: "call-c1", output: "a.txt" });
    expect(blocks("failed")[1]).toMatchObject({ type: "tool-result", isError: true, output: "no such file" });
    expect(blocks("completed")[0]).toMatchObject({ type: "tool-call", name: "Bash", input: { command: "ls /srv/app" }, summary: "ls /srv/app" });
  });

  test("a call stopped before it answered says so and reads as failed", () => {
    const [message] = rowsToMessages([tool("c1", "running", { state: "failed", endedAs: "interrupted", output: undefined, isError: undefined })], t);
    expect(message?.blocks[1]).toMatchObject({ type: "tool-result", output: "Stopped before it answered.", isError: true });
  });

  test("a subagent's calls stay out of the run", () => {
    const messages = rowsToMessages([tool("c1", "completed", { parentCallId: "task-1" })], t);
    expect(messages).toEqual([]);
  });

  test("words after a tool start a new message; the turn's last assistant message ends it at its completion", () => {
    const messages = rowsToMessages([user("u1", "go"), turn("completed"), said("a1", "looking"), tool("c1", "completed"), said("a2", "done")], t);
    expect(messages.map((m) => [m.id, m.role, m.endsTurn])).toEqual([["user:u1", "user", false], ["a1", "assistant", false], ["a2", "assistant", true]]);
    expect(messages[2]?.timestamp).toBe(99_000);
    expect(new Set(messages.map((m) => m.turnIndex)).size).toBe(1);
  });

  test("mail from TermWeave is a notice, not the owner's bubble", () => {
    const mail = row("user:m1", { kind: "message", role: "user", text: "worker 2 finished", from: { kind: "termweave", label: "Worker report" } });
    const [message] = rowsToMessages([mail], t);
    expect(message).toMatchObject({ role: "system", blocks: [{ type: "text", text: "worker 2 finished", presentation: "notice", noticeLabel: "Worker report" }] });
  });

  test("mail's label and text stay apart; mail with no label gets the neutral label", () => {
    const mail = (id: string, label: string | null) => row(`user:${id}`, { kind: "message", role: "user", text: "schedule fired", from: { kind: "termweave", label } });
    const [labelled, bare] = rowsToMessages([mail("m1", "Schedule"), mail("m2", null)], t);
    const first = labelled!.blocks[0] as NativeChatTextBlock;
    const second = bare!.blocks[0] as NativeChatTextBlock;
    expect([noticeLabel(first, t), first.text]).toEqual(["Schedule", "schedule fired"]);
    expect([noticeLabel(second, t), second.text]).toEqual(["TermWeave message", "schedule fired"]);
  });

  test("a pane notice keeps its own label", () => {
    expect(noticeLabel({ type: "text", text: "done", presentation: "notice" }, t)).toBe("Background result delivered");
  });

  test("a Task call counts the calls its sub-agent made; one with none has no suffix", () => {
    const task = (id: string) => tool(id, "completed", { name: "Task", summary: "Explore the repo" });
    const messages = rowsToMessages([
      task("task1"), tool("c1", "completed", { parentCallId: "call-task1" }), tool("c2", "completed", { parentCallId: "call-task1" }), task("task2"),
    ], t);
    const calls = messages.flatMap((m) => m.blocks).filter((b) => b.type === "tool-call");
    expect(calls.map((b) => [b.callId, b.summary])).toEqual([["call-task1", "Explore the repo · 2 steps"], ["call-task2", "Explore the repo"]]);
  });

  test("an interrupted turn leaves an interruption line after its last row", () => {
    const messages = rowsToMessages([user("u1", "go"), turn("interrupted"), said("a1", "half"), user("u2", "next", "t2")], t);
    expect(messages.map((m) => m.id)).toEqual(["user:u1", "a1", "turn:t1:end", "user:u2"]);
    expect(messages[2]?.blocks[0]).toMatchObject({ presentation: "interrupted" });
  });

  test("a failed turn says so once: not again when an error row already did", () => {
    const quiet = rowsToMessages([user("u1", "go"), turn("failed"), said("a1", "x")], t);
    expect(quiet.at(-1)?.blocks[0]).toEqual({ type: "text", text: "This turn failed." });
    const loud = rowsToMessages([user("u1", "go"), turn("failed"), row("status:x", { kind: "status", text: "API error", tone: "error", code: "api_error" })], t);
    expect(loud.map((m) => m.id)).toEqual(["user:u1", "status:x"]);
    expect(loud[1]?.blocks[0]).toEqual({ type: "text", text: "Error: API error" });
  });

  test("a pending prompt is not a row; a settled one is a quiet line", () => {
    expect(rowsToMessages([approval("pending")], t)).toEqual([]);
    expect(rowsToMessages([approval("resolved", "allowForSession")], t)[0]?.blocks[0]).toEqual({ type: "text", text: "Allowed for this session: Bash" });
    expect(rowsToMessages([approval("resolved", "deny")], t)[0]?.blocks[0]).toEqual({ type: "text", text: "Denied: Bash" });
    expect(rowsToMessages([approval("cancelled")], t)[0]?.blocks[0]).toEqual({ type: "text", text: "Request withdrawn: Bash" });
  });

  test("an answered question shows each question with its answer", () => {
    const question = row("prompt:q", {
      kind: "question", promptKey: "q", question: "Which db?",
      questions: [{ id: "q1", question: "Which db?", multiSelect: false, options: [{ id: "q1:choice-1", label: "Postgres" }, { id: "q1:choice-2", label: "SQLite" }] }],
      resolution: { state: "resolved", answer: { kind: "answers", answers: [{ questionId: "q1", optionIds: ["q1:choice-2"] }] }, resolvedBy: "owner", resolvedAt: 1 },
    });
    expect(rowsToMessages([question], t)[0]?.blocks[0]).toEqual({ type: "text", text: "Which db? → SQLite" });
  });
});

describe("pendingPromptRows", () => {
  test("only waiting approval and question rows, oldest first", () => {
    const a = approval("pending");
    const b = { ...approval("resolved", "allow"), itemId: "prompt:p2" };
    expect(pendingPromptRows([b, a]).map((r) => r.itemId)).toEqual(["prompt:p1"]);
  });
});

describe("currentHold", () => {
  const status = (key: string, code: string) => row(`status:host:${key}`, { kind: "status", text: `text ${code}`, tone: "warning", code }, null);

  test("a waiting slot holds until a turn starts after it", () => {
    const sent = user("u1", "go");
    const slot = status("wait:slot", "no_slot");
    expect(currentHold([slot, sent])).toEqual({ kind: "slot", text: "text no_slot" });
    expect(currentHold([slot, turn("running", "t9")])).toBeNull();
  });

  test("a stop after failed starts and a single failed start are told apart", () => {
    expect(currentHold([status("stopped:5", "start_failed")])?.kind).toBe("stopped");
    expect(currentHold([status("start:5", "start_failed")])?.kind).toBe("start-failed");
  });

  test("other status rows are no hold", () => {
    expect(currentHold([status("x", "compacted")])).toBeNull();
  });
});
