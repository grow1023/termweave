import { describe, expect, test } from "bun:test";

import type { JournalRow, QueuedMessage, Submission } from "../../../../shared/bots/chat.ts";
import { UNDELIVERED_SHOWN_MS, queueEntries } from "./queue-entries.ts";

const owner = { kind: "owner" as const };
const queued = (id: string, position: number): QueuedMessage => ({ clientMessageId: id, text: `q ${id}`, from: owner, position });
const submission = (id: string, state: Submission["state"], extra: Partial<Submission> = {}): Submission => ({
  clientMessageId: id, uuid: id, state, from: owner, text: `s ${id}`, submittedAt: 1_000, resolvedAt: null, ...extra,
});
const userRow = (id: string): [string, JournalRow] => [`user:${id}`, {
  itemId: `user:${id}`, revision: 1, sequence: 1, ordinal: 1, observedAt: 1, turnId: id, body: { kind: "message", role: "user", text: "x", from: owner },
}];
const none = { queued: [], submissions: [], sending: new Map<string, string>(), rows: new Map<string, JournalRow>(), now: 2_000 };

describe("queueEntries", () => {
  test("held messages by position, then sent ones, then requests in flight", () => {
    const entries = queueEntries({
      ...none,
      queued: [queued("b", 2), queued("a", 1)],
      submissions: [submission("a", "pending"), submission("c", "pending")],
      sending: new Map([["d", "typing d"]]),
    });
    expect(entries).toEqual([
      { id: "a", text: "q a", state: "queued" },
      { id: "b", text: "q b", state: "queued" },
      { id: "c", text: "s c", state: "delivering" },
      { id: "d", text: "typing d", state: "sending" },
    ]);
  });

  test("a message whose row arrived leaves the list", () => {
    const entries = queueEntries({ ...none, submissions: [submission("a", "accepted"), submission("b", "pending")], rows: new Map([userRow("b")]), sending: new Map([["b", "b"]]) });
    expect(entries).toEqual([]);
  });

  test("mail from TermWeave is not the owner's queue", () => {
    const mail: QueuedMessage = { ...queued("m", 1), from: { kind: "termweave", label: "Schedule" } };
    expect(queueEntries({ ...none, queued: [mail] })).toEqual([]);
  });

  test("an undelivered message shows for an hour", () => {
    const lost = submission("x", "unknown", { resolvedAt: 1_000 });
    expect(queueEntries({ ...none, submissions: [lost] })[0]?.state).toBe("undelivered");
    expect(queueEntries({ ...none, submissions: [lost], now: 1_000 + UNDELIVERED_SHOWN_MS })).toEqual([]);
  });
});
