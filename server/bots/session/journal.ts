import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type {
  BoundedText, JournalBody, JournalDirection, JournalPage, JournalRow, MessageFrom, QueuedMessage, Submission, SubmissionState,
} from "../../../shared/bots/chat.ts";

/** Byte limits: one frame must not fill the disk, and a page must stay small enough to send. */
export const MESSAGE_MAX_BYTES = 200 * 1024;
export const TOOL_OUTPUT_MAX_BYTES = 64 * 1024;
/** any other string in a row (titles, paths, labels) */
export const FIELD_MAX_BYTES = 16 * 1024;
export const PAGE_DEFAULT_LIMIT = 200;
export const PAGE_MAX_LIMIT = 500;
/** the newest submissions a page carries */
const PAGE_SUBMISSIONS = 50;
/** a whole row after its strings are bounded; past this the row is replaced, not stored */
const ROW_MAX_BYTES = 512 * 1024;

const SCHEMA_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `text` cut to `max` UTF-8 bytes: the first and last parts, the cut said in the middle. */
export function bound(text: string, max: number): BoundedText {
  const bytes = encoder.encode(text);
  if (bytes.length <= max) return { text, bytes: bytes.length, cut: 0 };
  const half = Math.floor(max / 2);
  const cut = bytes.length - 2 * half;
  // a cut inside a multi-byte character decodes to U+FFFD; drop those halves of characters
  const head = decoder.decode(bytes.subarray(0, half)).replace(/�+$/, "");
  const tail = decoder.decode(bytes.subarray(bytes.length - half)).replace(/^�+/, "");
  return { text: `${head}\n… ${cut} bytes cut …\n${tail}`, bytes: bytes.length, cut };
}

/** A string cut to `max` bytes, for fields that do not carry their own BoundedText. */
export function clip(text: string, max: number): string {
  return bound(text, max).text;
}

/** Every string in a value cut to `max` bytes. The last guard before a row is stored. */
function clampStrings(value: unknown, max: number): unknown {
  if (typeof value === "string") return encoder.encode(value).length > max ? clip(value, max) : value;
  if (Array.isArray(value)) return value.map((entry) => clampStrings(entry, max));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clampStrings(entry, max)]));
  }
  return value;
}

function storedBody(body: JournalBody): string {
  const json = JSON.stringify(clampStrings(body, MESSAGE_MAX_BYTES));
  if (encoder.encode(json).length <= ROW_MAX_BYTES) return json;
  // only a body with many large fields gets here; keep the row so its item id still answers
  return JSON.stringify({ kind: "status", text: "This entry was too large to keep.", tone: "warning", code: "too_large" } satisfies JournalBody);
}

/** The chat a bot has: its journal session, the reset epoch, and Claude's own handles. */
export interface ChatRecord {
  botId: string;
  sessionId: string;
  epoch: string;
  lastSequence: number;
  claudeSessionId: string | null;
  leafUuid: string | null;
  updatedAt: number;
}

type ItemRecord = { item_id: string; revision: number; sequence: number; ordinal: number; observed_at: number; turn_id: string | null; body_json: string };
type ChatRecordRow = { bot_id: string; session_id: string; epoch: string; last_sequence: number; claude_session_id: string | null; leaf_uuid: string | null; updated_at: number };
type SubmissionRecord = { client_message_id: string; uuid: string; state: string; from_json: string | null; text: string; submitted_at: number; resolved_at: number | null };

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE chat (bot_id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, epoch TEXT NOT NULL,
      last_sequence INTEGER NOT NULL DEFAULT 0, claude_session_id TEXT, leaf_uuid TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE items (session_id TEXT NOT NULL, item_id TEXT NOT NULL, revision INTEGER NOT NULL,
      sequence INTEGER NOT NULL, ordinal INTEGER NOT NULL, kind TEXT NOT NULL, state TEXT, turn_id TEXT,
      prompt_pending INTEGER NOT NULL DEFAULT 0, observed_at INTEGER NOT NULL, body_json TEXT NOT NULL,
      PRIMARY KEY (session_id, item_id));
    CREATE INDEX items_seq ON items(session_id, sequence);
    CREATE INDEX items_ord ON items(session_id, ordinal);
    CREATE TABLE submissions (session_id TEXT NOT NULL, client_message_id TEXT NOT NULL, uuid TEXT NOT NULL,
      state TEXT NOT NULL, from_json TEXT, text TEXT NOT NULL, submitted_at INTEGER NOT NULL, resolved_at INTEGER,
      PRIMARY KEY (session_id, client_message_id));
    CREATE INDEX submissions_uuid ON submissions(session_id, uuid);
    CREATE TABLE queue (session_id TEXT NOT NULL, client_message_id TEXT NOT NULL, position REAL NOT NULL,
      text TEXT NOT NULL, from_json TEXT, PRIMARY KEY (session_id, client_message_id));
  `,
};

function lifecycleOf(body: JournalBody): string | null {
  switch (body.kind) {
    case "turn": case "tool-call": return body.state;
    case "message": return body.state ?? null;
    case "approval": case "question": return body.resolution.state;
    default: return null;
  }
}

function toRow(record: ItemRecord): JournalRow {
  return {
    itemId: record.item_id, revision: record.revision, sequence: record.sequence, ordinal: record.ordinal,
    observedAt: record.observed_at, turnId: record.turn_id, body: JSON.parse(record.body_json) as JournalBody,
  };
}

function toChat(record: ChatRecordRow): ChatRecord {
  return {
    botId: record.bot_id, sessionId: record.session_id, epoch: record.epoch, lastSequence: record.last_sequence,
    claudeSessionId: record.claude_session_id, leafUuid: record.leaf_uuid, updatedAt: record.updated_at,
  };
}

function parseFrom(json: string | null): MessageFrom {
  try {
    const value = json === null ? null : JSON.parse(json) as MessageFrom;
    if (value?.kind === "termweave") return { kind: "termweave", label: typeof value.label === "string" ? value.label : null };
  } catch { /* a damaged column reads as the owner's, the safe default for display */ }
  return { kind: "owner" };
}

function toSubmission(record: SubmissionRecord): Submission {
  return {
    clientMessageId: record.client_message_id, uuid: record.uuid, state: record.state as SubmissionState,
    from: parseFrom(record.from_json), text: record.text, submittedAt: record.submitted_at, resolvedAt: record.resolved_at,
  };
}

/**
 * Every bot chat's rows in one SQLite file. `items` keeps only the current revision of each row:
 * a revision takes a new sequence, so `after` (sequence > cursor) is a complete catch-up without
 * an event log. The epoch changes only when a chat is reset.
 */
export class BotJournal {
  private readonly db: Database;

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.db = new Database(file, { create: true });
    // the rows hold the owner's conversation: nobody else on the machine reads them
    chmodSync(file, 0o600);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.migrate();
  }

  close(): void { this.db.close(); }

  private migrate(): void {
    const current = (this.db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
    for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
      const step = MIGRATIONS[version];
      if (step === undefined) throw new Error(`bot journal: no migration to schema ${version}`);
      this.db.transaction(() => { this.db.exec(step); this.db.exec(`PRAGMA user_version=${version}`); })();
    }
  }

  chat(botId: string): ChatRecord | null {
    const record = this.db.query("SELECT * FROM chat WHERE bot_id = ?").get(botId) as ChatRecordRow | null;
    return record === null ? null : toChat(record);
  }

  /** Creates the bot's chat on first use; later calls change only the fields given. */
  setChat(botId: string, change: { claudeSessionId?: string | null; leafUuid?: string | null }, at = Date.now()): ChatRecord {
    const existing = this.chat(botId);
    const next: ChatRecord = existing === null
      ? { botId, sessionId: randomUUID(), epoch: randomUUID(), lastSequence: 0, claudeSessionId: null, leafUuid: null, updatedAt: at }
      : existing;
    const merged = { ...next, ...change, updatedAt: at };
    this.db.query(`INSERT INTO chat (bot_id, session_id, epoch, last_sequence, claude_session_id, leaf_uuid, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(bot_id) DO UPDATE SET claude_session_id = excluded.claude_session_id,
      leaf_uuid = excluded.leaf_uuid, updated_at = excluded.updated_at`)
      .run(botId, merged.sessionId, merged.epoch, merged.lastSequence, merged.claudeSessionId, merged.leafUuid, at);
    return this.chat(botId) ?? merged;
  }

  /** Starts the chat over: a new epoch, no rows, no queue, no Claude session to resume. */
  resetChat(botId: string, at = Date.now()): ChatRecord {
    const chat = this.setChat(botId, {}, at);
    this.db.transaction(() => {
      for (const table of ["items", "submissions", "queue"]) this.db.query(`DELETE FROM ${table} WHERE session_id = ?`).run(chat.sessionId);
      this.db.query("UPDATE chat SET epoch = ?, last_sequence = 0, claude_session_id = NULL, leaf_uuid = NULL, updated_at = ? WHERE bot_id = ?")
        .run(randomUUID(), at, botId);
    })();
    return this.chat(botId) ?? chat;
  }

  head(sessionId: string): { epoch: string; sequence: number } {
    const chat = this.db.query("SELECT epoch, last_sequence FROM chat WHERE session_id = ?").get(sessionId) as { epoch: string; last_sequence: number } | null;
    return { epoch: chat?.epoch ?? "", sequence: Math.max(chat?.last_sequence ?? 0, this.maxSequence(sessionId)) };
  }

  private maxSequence(sessionId: string): number {
    return (this.db.query("SELECT COALESCE(MAX(sequence), 0) AS n FROM items WHERE session_id = ?").get(sessionId) as { n: number }).n;
  }

  row(sessionId: string, itemId: string): JournalRow | null {
    const record = this.db.query("SELECT * FROM items WHERE session_id = ? AND item_id = ?").get(sessionId, itemId) as ItemRecord | null;
    return record === null ? null : toRow(record);
  }

  /** Writes a row's next revision under a new sequence. `turnId` defaults to what the row had. */
  upsert(sessionId: string, itemId: string, body: JournalBody, at: number, turnId?: string | null): JournalRow {
    return this.db.transaction((): JournalRow => {
      const previous = this.row(sessionId, itemId);
      const sequence = this.head(sessionId).sequence + 1;
      const turn = turnId !== undefined ? turnId : previous?.turnId ?? (body.kind === "turn" ? body.turnId : null);
      const pending = (body.kind === "approval" || body.kind === "question") && body.resolution.state === "pending" ? 1 : 0;
      this.db.query(`INSERT INTO items (session_id, item_id, revision, sequence, ordinal, kind, state, turn_id, prompt_pending, observed_at, body_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, item_id) DO UPDATE SET revision = excluded.revision,
        sequence = excluded.sequence, kind = excluded.kind, state = excluded.state, turn_id = excluded.turn_id,
        prompt_pending = excluded.prompt_pending, observed_at = excluded.observed_at, body_json = excluded.body_json`)
        .run(sessionId, itemId, (previous?.revision ?? 0) + 1, sequence, previous?.ordinal ?? sequence, body.kind,
          lifecycleOf(body), turn, pending, at, storedBody(body));
      this.db.query("UPDATE chat SET last_sequence = ?, updated_at = ? WHERE session_id = ?").run(sequence, at, sessionId);
      const written = this.row(sessionId, itemId);
      if (written === null) throw new Error("bot journal: a row written was not read back");
      return written;
    })();
  }

  /** Records a send or its new state. The text is bounded like a message. */
  submission(sessionId: string, s: Submission): void {
    this.db.query(`INSERT INTO submissions (session_id, client_message_id, uuid, state, from_json, text, submitted_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, client_message_id) DO UPDATE SET uuid = excluded.uuid,
      state = excluded.state, from_json = excluded.from_json, text = excluded.text, resolved_at = excluded.resolved_at`)
      .run(sessionId, s.clientMessageId, s.uuid, s.state, JSON.stringify(s.from), clip(s.text, MESSAGE_MAX_BYTES), s.submittedAt, s.resolvedAt);
  }

  submissionByUuid(sessionId: string, uuid: string): Submission | null {
    const record = this.db.query("SELECT * FROM submissions WHERE session_id = ? AND uuid = ?").get(sessionId, uuid) as SubmissionRecord | null;
    return record === null ? null : toSubmission(record);
  }

  submissions(sessionId: string, limit = PAGE_SUBMISSIONS): Submission[] {
    const records = this.db.query("SELECT * FROM submissions WHERE session_id = ? ORDER BY submitted_at DESC, rowid DESC LIMIT ?")
      .all(sessionId, limit) as SubmissionRecord[];
    return records.map(toSubmission).reverse();
  }

  page(sessionId: string, req: { direction: JournalDirection; cursor?: number; limit?: number }): JournalPage {
    const limit = Math.min(PAGE_MAX_LIMIT, Math.max(1, Math.floor(req.limit ?? PAGE_DEFAULT_LIMIT)));
    const head = this.head(sessionId);
    const base = { epoch: head.epoch, direction: req.direction, submissions: this.submissions(sessionId), head: head.sequence };
    if (req.direction === "after") {
      const cursor = req.cursor ?? 0;
      const records = this.db.query("SELECT * FROM items WHERE session_id = ? AND sequence > ? ORDER BY sequence LIMIT ?")
        .all(sessionId, cursor, limit + 1) as ItemRecord[];
      const items = records.slice(0, limit).map(toRow);
      const last = items[items.length - 1];
      return { ...base, items, hasOlder: this.count(sessionId, "sequence <= ?", cursor) > 0, hasNewer: records.length > limit, nextCursor: last?.sequence ?? cursor };
    }
    const records = (req.direction === "before" && req.cursor !== undefined
      ? this.db.query("SELECT * FROM items WHERE session_id = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT ?").all(sessionId, req.cursor, limit + 1)
      : this.db.query("SELECT * FROM items WHERE session_id = ? ORDER BY ordinal DESC LIMIT ?").all(sessionId, limit + 1)) as ItemRecord[];
    const items = records.slice(0, limit).map(toRow).reverse();
    const oldest = items[0];
    const newest = items[items.length - 1];
    const hasOlder = records.length > limit;
    return {
      ...base, items, hasOlder,
      hasNewer: newest !== undefined && this.count(sessionId, "ordinal > ?", newest.ordinal) > 0,
      nextCursor: hasOlder && oldest !== undefined ? oldest.ordinal : null,
    };
  }

  private count(sessionId: string, where: string, value: number): number {
    return (this.db.query(`SELECT COUNT(*) AS n FROM items WHERE session_id = ? AND ${where}`).get(sessionId, value) as { n: number }).n;
  }

  pendingPrompts(sessionId: string): JournalRow[] {
    return (this.db.query("SELECT * FROM items WHERE session_id = ? AND prompt_pending = 1 ORDER BY ordinal").all(sessionId) as ItemRecord[]).map(toRow);
  }

  /** Turns, tool calls and reasoning still marked running: what a process end must settle. */
  running(sessionId: string): JournalRow[] {
    return (this.db.query("SELECT * FROM items WHERE session_id = ? AND state = 'running' ORDER BY ordinal").all(sessionId) as ItemRecord[]).map(toRow);
  }

  enqueue(sessionId: string, message: { clientMessageId: string; text: string; from: MessageFrom }): QueuedMessage {
    const last = (this.db.query("SELECT COALESCE(MAX(position), 0) AS p FROM queue WHERE session_id = ?").get(sessionId) as { p: number }).p;
    const text = clip(message.text, MESSAGE_MAX_BYTES);
    this.db.query("INSERT OR REPLACE INTO queue (session_id, client_message_id, position, text, from_json) VALUES (?, ?, ?, ?, ?)")
      .run(sessionId, message.clientMessageId, last + 1, text, JSON.stringify(message.from));
    return { clientMessageId: message.clientMessageId, text, from: message.from, position: last + 1 };
  }

  /** Takes the first queued message off the queue. */
  dequeue(sessionId: string): QueuedMessage | null {
    return this.db.transaction((): QueuedMessage | null => {
      const first = this.queued(sessionId)[0];
      if (first === undefined) return null;
      this.db.query("DELETE FROM queue WHERE session_id = ? AND client_message_id = ?").run(sessionId, first.clientMessageId);
      return first;
    })();
  }

  queued(sessionId: string): QueuedMessage[] {
    const records = this.db.query("SELECT * FROM queue WHERE session_id = ? ORDER BY position").all(sessionId) as { client_message_id: string; position: number; text: string; from_json: string | null }[];
    return records.map((record) => ({ clientMessageId: record.client_message_id, text: record.text, from: parseFrom(record.from_json), position: record.position }));
  }
}
