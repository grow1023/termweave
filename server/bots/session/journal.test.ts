import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JournalBody } from "../../../shared/bots/chat.ts";
import { BotJournal, bound, MESSAGE_MAX_BYTES, PAGE_MAX_LIMIT } from "./journal.ts";

let dir: string;
let journal: BotJournal;
let session: string;

const say = (text: string): JournalBody => ({ kind: "message", role: "assistant", text });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tw-journal-"));
  journal = new BotJournal(join(dir, "state", "bot-journal.sqlite"));
  session = journal.setChat("bot-1", {}).sessionId;
});
afterEach(() => {
  journal.close();
  rmSync(dir, { recursive: true, force: true });
});

test("the file is private and carries a schema version", () => {
  const file = join(dir, "state", "bot-journal.sqlite");
  expect(statSync(file).mode & 0o777).toBe(0o600);
  journal.close();
  // reopening an existing file runs no migration twice
  journal = new BotJournal(file);
  expect(journal.chat("bot-1")?.sessionId).toBe(session);
});

test("upsert bumps revision and takes a new sequence, keeping the ordinal", () => {
  const a = journal.upsert(session, "a", say("one"), 10);
  const b = journal.upsert(session, "b", say("two"), 11);
  const a2 = journal.upsert(session, "a", say("one more"), 12);
  expect([a.revision, a.sequence, a.ordinal]).toEqual([1, 1, 1]);
  expect([b.sequence, b.ordinal]).toEqual([2, 2]);
  expect([a2.revision, a2.sequence, a2.ordinal]).toEqual([2, 3, 1]);
  expect(journal.head(session).sequence).toBe(3);
  expect(journal.chat("bot-1")?.lastSequence).toBe(3);
});

test("tail and before page in drawing order; after catches up on revisions", () => {
  for (let n = 0; n < 5; n++) journal.upsert(session, `r${n}`, say(`${n}`), n);
  const tail = journal.page(session, { direction: "tail", limit: 2 });
  expect(tail.items.map((row) => row.itemId)).toEqual(["r3", "r4"]);
  expect(tail.hasOlder).toBe(true);
  expect(tail.hasNewer).toBe(false);
  expect(tail.nextCursor).toBe(4);
  const before = journal.page(session, { direction: "before", cursor: tail.nextCursor ?? 0, limit: 10 });
  expect(before.items.map((row) => row.itemId)).toEqual(["r0", "r1", "r2"]);
  expect(before.hasOlder).toBe(false);
  expect(before.hasNewer).toBe(true);
  expect(before.nextCursor).toBeNull();

  journal.upsert(session, "r0", say("edited"), 9);
  const after = journal.page(session, { direction: "after", cursor: tail.head });
  expect(after.items.map((row) => row.itemId)).toEqual(["r0"]);
  expect(after.nextCursor).toBe(6);
  expect(after.hasNewer).toBe(false);
});

test("the limit defaults to 200 and is capped at 500", () => {
  for (let n = 0; n < PAGE_MAX_LIMIT + 5; n++) journal.upsert(session, `r${n}`, say("x"), n);
  expect(journal.page(session, { direction: "tail" }).items).toHaveLength(200);
  expect(journal.page(session, { direction: "tail", limit: 10_000 }).items).toHaveLength(PAGE_MAX_LIMIT);
  const after = journal.page(session, { direction: "after", cursor: 0, limit: 3 });
  expect(after.hasNewer).toBe(true);
});

test("a stored string is bounded, keeping its head and tail", () => {
  const huge = `${"a".repeat(MESSAGE_MAX_BYTES)}${"z".repeat(MESSAGE_MAX_BYTES)}`;
  const row = journal.upsert(session, "big", say(huge), 1);
  if (row.body.kind !== "message") throw new Error("kind");
  expect(row.body.text.length).toBeLessThan(MESSAGE_MAX_BYTES + 100);
  expect(row.body.text.startsWith("aaa")).toBe(true);
  expect(row.body.text.endsWith("zzz")).toBe(true);
  expect(row.body.text).toContain("bytes cut");
});

test("bound cuts by UTF-8 bytes and never splits a character", () => {
  const cut = bound("가".repeat(100), 31);
  expect(cut.bytes).toBe(300);
  expect(cut.cut).toBe(300 - 30);
  expect(cut.text).not.toContain("�");
  expect(bound("short", 100)).toEqual({ text: "short", bytes: 5, cut: 0 });
});

test("pending prompts and running rows are found by their columns", () => {
  const resolution = { state: "pending" as const, answer: null, resolvedBy: null, resolvedAt: null };
  journal.upsert(session, "prompt:1", { kind: "approval", promptKey: "1", title: "Allow?", toolName: "FakeShell", detail: null, options: [], resolution }, 1);
  journal.upsert(session, "turn:1", { kind: "turn", turnId: "1", state: "running" }, 1);
  expect(journal.pendingPrompts(session).map((row) => row.itemId)).toEqual(["prompt:1"]);
  expect(journal.running(session).map((row) => row.itemId)).toEqual(["turn:1"]);
  expect(journal.row(session, "turn:1")?.turnId).toBe("1");
});

test("submissions are found by uuid and keep who sent them", () => {
  journal.submission(session, { clientMessageId: "c1", uuid: "u1", state: "pending", from: { kind: "termweave", label: "worker w1" }, text: "report", submittedAt: 1, resolvedAt: null });
  journal.submission(session, { clientMessageId: "c1", uuid: "u1", state: "accepted", from: { kind: "termweave", label: "worker w1" }, text: "report", submittedAt: 1, resolvedAt: 2 });
  expect(journal.submissionByUuid(session, "u1")).toMatchObject({ state: "accepted", from: { kind: "termweave", label: "worker w1" }, resolvedAt: 2 });
  expect(journal.submissions(session)).toHaveLength(1);
  expect(journal.page(session, { direction: "tail" }).submissions).toHaveLength(1);
});

test("the queue keeps order and dequeue takes the first", () => {
  journal.enqueue(session, { clientMessageId: "c1", text: "one", from: { kind: "owner" } });
  journal.enqueue(session, { clientMessageId: "c2", text: "two", from: { kind: "termweave", label: null } });
  expect(journal.queued(session).map((entry) => entry.clientMessageId)).toEqual(["c1", "c2"]);
  expect(journal.dequeue(session)?.text).toBe("one");
  expect(journal.dequeue(session)?.from).toEqual({ kind: "termweave", label: null });
  expect(journal.dequeue(session)).toBeNull();
});

test("setChat keeps the session and epoch; only a reset changes the epoch", () => {
  const first = journal.chat("bot-1");
  const updated = journal.setChat("bot-1", { claudeSessionId: "claude-1", leafUuid: "leaf-1" });
  expect(updated.epoch).toBe(first?.epoch ?? "");
  expect(updated.claudeSessionId).toBe("claude-1");
  journal.upsert(session, "a", say("x"), 1);
  journal.enqueue(session, { clientMessageId: "c1", text: "q", from: { kind: "owner" } });
  const reset = journal.resetChat("bot-1");
  expect(reset.sessionId).toBe(session);
  expect(reset.epoch).not.toBe(first?.epoch ?? "");
  expect(reset.claudeSessionId).toBeNull();
  expect(journal.page(session, { direction: "tail" }).items).toHaveLength(0);
  expect(journal.queued(session)).toHaveLength(0);
  expect(journal.head(session)).toEqual({ epoch: reset.epoch, sequence: 0 });
});
