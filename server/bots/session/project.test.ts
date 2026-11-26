import { expect, test } from "bun:test";

import type { JournalBody, JournalRow } from "../../../shared/bots/chat.ts";
import { chatStatusOf, projectConversation } from "./project.ts";

let ordinal = 0;
const row = (itemId: string, body: JournalBody, sequence?: number): JournalRow => {
  ordinal += 1;
  return { itemId, revision: 1, sequence: sequence ?? ordinal, ordinal, observedAt: 1_700_000_000_000 + ordinal, turnId: "t1", body };
};
const pending = { state: "pending" as const, answer: null, resolvedBy: null, resolvedAt: null };
const input = { text: "{}", bytes: 2, cut: 0 };

test("rows project into user and assistant turns in drawing order", () => {
  const rows = [
    row("turn:t1", { kind: "turn", turnId: "t1", state: "completed" }),
    row("user:1", { kind: "message", role: "user", text: "hi", from: { kind: "owner" } }),
    row("msg:a", { kind: "message", role: "reasoning", text: "thinking" }),
    // revised later (higher sequence), still drawn where the call was made
    row("tool:1", { kind: "tool-call", name: "FakeShell", callId: "1", summary: "ls", input, state: "failed", isError: true, output: { text: "no", bytes: 9000, cut: 8000 } }, 99),
    row("msg:b", { kind: "message", role: "assistant", text: "done" }),
    row("user:2", { kind: "message", role: "user", text: "report", from: { kind: "termweave", label: "worker w1" } }),
    row("status:1", { kind: "status", text: "Limit reached.", tone: "error", code: "usage_limit" }),
  ];
  const turns = projectConversation([...rows].reverse());
  expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant", "user", "assistant"]);
  expect(turns[0]?.parts).toEqual([{ kind: "text", text: "hi" }]);
  expect(turns[1]?.parts).toEqual([
    { kind: "thinking", text: "thinking" },
    { kind: "tool", name: "FakeShell", summary: "ls", input: "{}", output: "no", error: true, output_size: 9000 },
    { kind: "text", text: "done" },
  ]);
  expect(turns[2]?.parts).toEqual([{ kind: "notice", text: "worker w1: report" }]);
  expect(turns[3]?.parts).toEqual([{ kind: "text", text: "Error: Limit reached." }]);
  expect(turns[1]?.ts).toBe(new Date(rows[2]!.observedAt).toISOString());
  expect(turns[1]?.end_ts).toBe(new Date(rows[4]!.observedAt).toISOString());
});

test("a prompt shows as a line saying what it waits for", () => {
  const turns = projectConversation([row("prompt:1", { kind: "approval", promptKey: "1", title: "Allow FakeShell?", toolName: "FakeShell", detail: null, options: [], resolution: pending })]);
  expect(turns[0]?.parts).toEqual([{ kind: "text", text: "Allow FakeShell? (waiting for the owner)" }]);
});

test("chat status: offline, blocked, waiting, working, done", () => {
  const approval = row("prompt:1", { kind: "approval", promptKey: "1", title: "Allow?", toolName: "X", detail: null, options: [], resolution: pending });
  const question = row("prompt:2", { kind: "question", promptKey: "2", question: "Which?", questions: [], resolution: pending });
  const running = row("turn:2", { kind: "turn", turnId: "2", state: "running" });
  const finished = row("turn:3", { kind: "turn", turnId: "3", state: "completed" });
  const idle = { connected: true, state: "idle" as const };
  expect(chatStatusOf([approval], null)).toBe("offline");
  expect(chatStatusOf([approval], { connected: false, state: null })).toBe("offline");
  expect(chatStatusOf([question, approval], idle)).toBe("blocked");
  expect(chatStatusOf([question], idle)).toBe("waiting");
  expect(chatStatusOf([], { connected: true, state: "running" })).toBe("working");
  expect(chatStatusOf([running], { connected: true, state: null })).toBe("working");
  expect(chatStatusOf([running, finished], idle)).toBe("done");
  expect(chatStatusOf([], idle)).toBe("done");
});
