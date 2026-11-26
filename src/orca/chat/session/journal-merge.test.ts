import { describe, expect, test } from "bun:test";

import type { JournalPage, JournalRow } from "../../../../shared/bots/chat.ts";
import { EMPTY_JOURNAL, applyPage, applyPush, mergeRows, type JournalState } from "./journal-merge.ts";

const row = (itemId: string, revision: number, sequence: number, ordinal = sequence, text = `${itemId} r${revision}`): JournalRow => ({
  itemId, revision, sequence, ordinal, observedAt: 1_000 + sequence, turnId: "t1",
  body: { kind: "message", role: "assistant", text },
});

const page = (direction: JournalPage["direction"], items: JournalRow[], extra: Partial<JournalPage> = {}): JournalPage => ({
  epoch: "e1", direction, items, submissions: [], hasOlder: false, hasNewer: false, nextCursor: null, head: 0, ...extra,
});

const loaded = (rows: JournalRow[], head: number): JournalState => applyPage(EMPTY_JOURNAL, page("tail", rows, { head })).state;

describe("mergeRows", () => {
  test("keeps the newest revision of an item, whichever arrives first", () => {
    const merged = mergeRows(new Map(), [row("a", 2, 5), row("a", 1, 3)]);
    expect(merged.get("a")?.revision).toBe(2);
    expect(mergeRows(merged, [row("a", 3, 7)]).get("a")?.revision).toBe(3);
  });

  test("returns the same map for an empty batch", () => {
    const rows = new Map([["a", row("a", 1, 1)]]);
    expect(mergeRows(rows, [])).toBe(rows);
  });

  test("does not change the map it was given", () => {
    const rows = new Map([["a", row("a", 1, 1)]]);
    mergeRows(rows, [row("a", 2, 2), row("b", 1, 3)]);
    expect([...rows.keys()]).toEqual(["a"]);
    expect(rows.get("a")?.revision).toBe(1);
  });
});

describe("applyPage", () => {
  test("a tail page replaces everything and sets head, epoch and the older cursor", () => {
    const before = loaded([row("old", 1, 1)], 1);
    const { state } = applyPage(before, page("tail", [row("a", 1, 9, 4)], { epoch: "e2", head: 9, hasOlder: true, nextCursor: 4 }));
    expect([...state.rows.keys()]).toEqual(["a"]);
    expect(state).toMatchObject({ epoch: "e2", head: 9, olderCursor: 4 });
  });

  test("a before page adds older rows and moves the cursor; none left gives null", () => {
    const state = loaded([row("b", 1, 5, 5)], 5);
    const { state: next } = applyPage(state, page("before", [row("a", 1, 2, 2)], { hasOlder: false, nextCursor: null }));
    expect([...next.rows.keys()].sort()).toEqual(["a", "b"]);
    expect(next.olderCursor).toBeNull();
    expect(next.head).toBe(5);
  });

  test("an after page merges changes and resumes from its cursor", () => {
    const state = loaded([row("a", 1, 3)], 3);
    const { state: next } = applyPage(state, page("after", [row("a", 2, 4, 3), row("b", 1, 5)], { nextCursor: 5, head: 5 }));
    expect(next.rows.get("a")?.revision).toBe(2);
    expect(next.head).toBe(5);
  });

  test("a before or after page from another epoch is stale and changes nothing", () => {
    const state = loaded([row("a", 1, 3)], 3);
    const result = applyPage(state, page("after", [row("z", 1, 1)], { epoch: "e2", nextCursor: 1 }));
    expect(result.stale).toBe(true);
    expect(result.state).toBe(state);
  });
});

describe("applyPush", () => {
  test("a contiguous batch merges and advances head", () => {
    const state = loaded([row("a", 1, 3)], 3);
    const { state: next, action } = applyPush(state, { epoch: "e1", rows: [row("a", 2, 4, 3), row("b", 1, 5)] });
    expect(action).toBe("none");
    expect(next.head).toBe(5);
    expect(next.rows.get("a")?.revision).toBe(2);
  });

  test("a batch that starts past head + 1 merges, keeps head, and asks to catch up", () => {
    const state = loaded([row("a", 1, 3)], 3);
    const { state: next, action } = applyPush(state, { epoch: "e1", rows: [row("b", 1, 7)] });
    expect(action).toBe("catch-up");
    expect(next.head).toBe(3);
    expect(next.rows.has("b")).toBe(true);
  });

  test("a new epoch asks for a reload and keeps the old rows until it lands", () => {
    const state = loaded([row("a", 1, 3)], 3);
    const { state: next, action } = applyPush(state, { epoch: "e2", rows: [row("x", 1, 1)] });
    expect(action).toBe("reload");
    expect(next).toBe(state);
  });

  test("a push before the first page asks to catch up once the page lands", () => {
    expect(applyPush(EMPTY_JOURNAL, { epoch: "e1", rows: [row("a", 1, 1)] }).action).toBe("catch-up");
  });

  test("an older revision pushed late does not replace the newer one", () => {
    const state = loaded([row("a", 3, 6)], 6);
    const { state: next } = applyPush(state, { epoch: "e1", rows: [row("a", 2, 5)] });
    expect(next.rows.get("a")?.revision).toBe(3);
    expect(next.head).toBe(6);
  });
});
