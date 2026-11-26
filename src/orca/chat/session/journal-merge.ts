// TermWeave's own merge of a session bot's journal pages and pushes (shared/bots/chat.ts). Pure, so
// journal-merge.test.ts drives every case. Rows are keyed by itemId, the newest revision wins, and
// the screen draws them by ordinal (rows-to-messages.ts orders them).
import type { JournalPage, JournalRow } from "../../../../shared/bots/chat.ts";

export interface JournalState {
  /** null until the first page landed */
  epoch: string | null;
  rows: ReadonlyMap<string, JournalRow>;
  /** the newest sequence this client holds every change up to: where `after` resumes */
  head: number;
  /** the ordinal cursor for the next `before` page; null when the beginning is loaded */
  olderCursor: number | null;
}

export const EMPTY_JOURNAL: JournalState = { epoch: null, rows: new Map(), head: 0, olderCursor: null };

/** The newer of two revisions of one item; a tie goes to the later sequence. */
function newer(a: JournalRow, b: JournalRow): JournalRow {
  if (a.revision !== b.revision) return a.revision > b.revision ? a : b;
  return a.sequence >= b.sequence ? a : b;
}

/** `rows` with `incoming` merged in by itemId; an older revision never replaces a newer one. */
export function mergeRows(rows: ReadonlyMap<string, JournalRow>, incoming: readonly JournalRow[]): ReadonlyMap<string, JournalRow> {
  if (incoming.length === 0) return rows;
  const next = new Map(rows);
  for (const row of incoming) {
    const held = next.get(row.itemId);
    next.set(row.itemId, held === undefined ? row : newer(held, row));
  }
  return next;
}

type Page = Pick<JournalPage, "epoch" | "direction" | "items" | "hasOlder" | "nextCursor" | "head">;

/**
 * A page applied to the state. `tail` replaces everything (a first load or a reload); `before` adds
 * older rows; `after` adds changes. A `before` or `after` page from another epoch replaces nothing:
 * the caller sees `stale` and reloads the tail.
 */
export function applyPage(state: JournalState, page: Page): { state: JournalState; stale: boolean } {
  if (page.direction === "tail") {
    return { state: { epoch: page.epoch, rows: mergeRows(new Map(), page.items), head: page.head, olderCursor: page.hasOlder ? page.nextCursor : null }, stale: false };
  }
  if (state.epoch !== page.epoch) return { state, stale: true };
  const rows = mergeRows(state.rows, page.items);
  if (page.direction === "before") return { state: { ...state, rows, olderCursor: page.hasOlder ? page.nextCursor : null }, stale: false };
  // an `after` page's cursor is the newest sequence it returned: everything up to it is held
  const head = Math.max(state.head, page.nextCursor ?? state.head);
  return { state: { ...state, rows, head }, stale: false };
}

export type PushAction = "none" | "catch-up" | "reload";

/**
 * A pushed batch applied to the state, and what the caller does next.
 * - another epoch: the journal was replaced; reload the tail.
 * - a gap (the batch starts past head + 1): merge it, keep head, and catch up with `after` from head.
 *   Decision: catch up, not reload the tail. The server sends a row revised twice in one batch once,
 *   as its newest revision, so a batch can skip sequences with nothing lost; a tail reload there would
 *   drop the older pages the reader scrolled to. `after` returns every row revised since head, so it
 *   closes a real gap as surely, and costs one small request for a false one.
 */
export function applyPush(state: JournalState, push: { epoch: string; rows: readonly JournalRow[] }): { state: JournalState; action: PushAction } {
  if (state.epoch === null) return { state, action: "catch-up" };
  if (push.epoch !== state.epoch) return { state, action: "reload" };
  if (push.rows.length === 0) return { state, action: "none" };
  const sequences = push.rows.map((row) => row.sequence);
  const lowest = Math.min(...sequences);
  const rows = mergeRows(state.rows, push.rows);
  if (lowest > state.head + 1) return { state: { ...state, rows }, action: "catch-up" };
  return { state: { ...state, rows, head: Math.max(state.head, ...sequences) }, action: "none" };
}
