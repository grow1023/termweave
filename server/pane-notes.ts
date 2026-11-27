/**
 * Pane notes on the server: one JSON file per terminal under <stateDir>/pane-notes, and the five
 * /api/pane/notes routes. The note text is data from a person or an agent: it is stored and
 * returned, never run, never followed, and never logged.
 *
 * Every read-check-write below is synchronous, so two changes to one note cannot interleave
 * (Bun runs one request's synchronous code at a time); the pane lookup happens before it.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  PANE_NOTE_LINE_MAX, PANE_NOTE_MAX, appendAgentLine, noteSummary, noteTasks, setTaskDone,
  type PaneNote, type PaneNoteSummary,
} from "../shared/pane-notes.ts";
import { HerdrError } from "./herdr/client.ts";
import { badRequest, errorResponse, isJsonObject, jsonResponse } from "./http.ts";

export const PANE_NOTE_AUTHOR_MAX = 40;
/**
 * A terminal id that may hold a note: 1 to 200 visible ASCII characters, not "." or "..". herdr
 * documents no format for it, so the file name encodes every character outside [A-Za-z0-9._-].
 */
const TERMINAL_ID = /^(?!\.{1,2}$)[\x21-\x7e]{1,200}$/;
export const isNoteTerminalId = (value: unknown): value is string => typeof value === "string" && TERMINAL_ID.test(value);

/** Why a change was refused: the stored note travels with the refusal. */
export class NoteConflict extends Error {
  constructor(readonly code: "note_changed" | "note_full", message: string, readonly note: PaneNote) { super(message); }
}

export class PaneNoteStore {
  private readonly dir: string;
  constructor(stateDir: string) { this.dir = join(stateDir, "pane-notes"); }

  /** "/", "\\" and ":" never reach the file system: each byte outside [A-Za-z0-9._-] becomes %XX, "%" too, so names stay unique. */
  private file(terminalId: string): string {
    if (!isNoteTerminalId(terminalId)) throw new Error("invalid terminal id");
    const name = terminalId.replace(/[^A-Za-z0-9._-]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
    return join(this.dir, `${name}.json`);
  }

  read(terminalId: string): PaneNote {
    let raw: string;
    try { raw = readFileSync(this.file(terminalId), "utf8"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { terminal_id: terminalId, text: "", revision: 0, updated_at: null };
      throw error;
    }
    // a damaged file is an error, never an empty note that the next save would write over
    let parsed: unknown;
    // the parser's own message can quote the file: never the note's text in an answer
    try { parsed = JSON.parse(raw); } catch { throw new Error("the stored note is unreadable"); }
    if (!isJsonObject(parsed) || parsed.terminal_id !== terminalId || typeof parsed.text !== "string"
      || !Number.isSafeInteger(parsed.revision) || (parsed.revision as number) < 1
      || (parsed.updated_at !== null && typeof parsed.updated_at !== "string")) throw new Error("the stored note is unreadable");
    return { terminal_id: terminalId, text: parsed.text, revision: parsed.revision as number, updated_at: parsed.updated_at as string | null };
  }

  private write(note: PaneNote, text: string, at: string): PaneNote {
    const next: PaneNote = { terminal_id: note.terminal_id, text, revision: note.revision + 1, updated_at: at };
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const path = this.file(note.terminal_id);
    const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
      renameSync(temp, path);
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
    return next;
  }

  /** The owner's whole text, only over the revision the owner last saw. */
  replace(terminalId: string, text: string, baseRevision: number, at: string): PaneNote {
    const note = this.read(terminalId);
    if (note.revision !== baseRevision) throw new NoteConflict("note_changed", "the note changed since you opened it", note);
    return note.text === text ? note : this.write(note, text, at);
  }

  /** One task line done or not done, only while that line still holds the task the caller saw. */
  setTask(terminalId: string, line: number, done: boolean, expectText: string, at: string): PaneNote {
    const note = this.read(terminalId);
    const task = noteTasks(note.text).find((candidate) => candidate.line === line);
    const text = task && task.text === expectText ? setTaskDone(note.text, line, done) : null;
    if (text === null) throw new NoteConflict("note_changed", `line ${line} is not the task you named`, note);
    return text === note.text ? note : this.write(note, text, at);
  }

  /** One line under the agent log heading; the owner's text stays as it is. */
  append(terminalId: string, author: string, line: string, at: string): PaneNote {
    const note = this.read(terminalId);
    const text = appendAgentLine(note.text, author, line, at);
    if (text.length > PANE_NOTE_MAX) throw new NoteConflict("note_full", `the note would pass ${PANE_NOTE_MAX} characters`, note);
    return this.write(note, text, at);
  }
}

export interface NotePane { pane_id: string; terminal_id?: string | null }
export type PaneNotesMessage = { type: "pane-notes"; terminal_id: string; summary: PaneNoteSummary };
export interface PaneNotesDeps {
  store: PaneNoteStore;
  /** the live session's panes, as /api/pane/read reads them */
  panes: () => Promise<readonly NotePane[]>;
  broadcast: (message: PaneNotesMessage) => void;
  readOnly: boolean;
  now?: () => string;
}

export const PANE_NOTES_PATHS = ["/api/pane/notes", "/api/pane/notes/summaries", "/api/pane/notes/task", "/api/pane/notes/append"];

/** The terminal of a pane in the live snapshot; with `expected`, only while it is still that terminal. */
async function terminalOf(deps: PaneNotesDeps, paneId: unknown, expected: unknown): Promise<string | Response> {
  if (typeof paneId !== "string" || paneId.length === 0 || paneId.length > 200) return badRequest("missing_pane_id", "pane_id is required");
  if (expected !== undefined && expected !== null && !isNoteTerminalId(expected)) return badRequest("invalid_terminal_id", "terminal_id is not a terminal id");
  const pane = (await deps.panes()).find((candidate) => candidate.pane_id === paneId);
  if (!pane) throw new HerdrError("pane_not_found", `pane ${paneId} not found`);
  if (!pane.terminal_id) throw new HerdrError("no_terminal", `pane ${paneId} has no terminal`);
  if (!isNoteTerminalId(pane.terminal_id)) return badRequest("invalid_terminal_id", "this terminal's id cannot hold a note");
  if (expected !== undefined && expected !== null && expected !== pane.terminal_id) return jsonResponse({ error: { code: "terminal_changed", message: "that pane now shows another terminal" } }, 409);
  return pane.terminal_id;
}

/** A pane's note and its summary, for readers outside these routes (the bot command line). */
export function noteOfPane(store: PaneNoteStore, panes: readonly NotePane[], paneId: string): { note: PaneNote; summary: PaneNoteSummary } {
  const pane = panes.find((candidate) => candidate.pane_id === paneId);
  if (!pane?.terminal_id || !isNoteTerminalId(pane.terminal_id)) throw new HerdrError("pane_not_found", `pane ${paneId} has no terminal with a note`);
  const note = store.read(pane.terminal_id);
  return { note, summary: noteSummary(note) };
}

const answer = (note: PaneNote): Response => jsonResponse({ note, summary: noteSummary(note) }, 200, { "cache-control": "no-store" });

function conflict(error: NoteConflict): Response {
  return jsonResponse({ error: { code: error.code, message: error.message }, note: error.note, summary: noteSummary(error.note) }, 409);
}

async function body(request: Request): Promise<Record<string, unknown> | Response> {
  let payload: unknown;
  try { payload = await request.json(); } catch { return badRequest("invalid_json", "request body must be JSON"); }
  return isJsonObject(payload) ? payload : badRequest("invalid_body", "request body must be a JSON object");
}

/** A validated change for one of the three changing routes, or the refusal. */
type Change = (store: PaneNoteStore, terminalId: string, at: string) => PaneNote;
function changeOf(pathname: string, payload: Record<string, unknown>): Change | Response {
  if (pathname === "/api/pane/notes") {
    const { text, base_revision: base } = payload;
    if (typeof text !== "string") return badRequest("missing_text", "text is required");
    if (text.length > PANE_NOTE_MAX) return badRequest("note_too_long", `a note holds at most ${PANE_NOTE_MAX} characters`);
    if (!Number.isSafeInteger(base) || (base as number) < 0) return badRequest("invalid_base_revision", "base_revision must be a non-negative integer");
    return (store, id, at) => store.replace(id, text, base as number, at);
  }
  if (pathname === "/api/pane/notes/task") {
    const { line, done, expect_text: expectText } = payload;
    if (!Number.isSafeInteger(line) || (line as number) < 1) return badRequest("invalid_line", "line must be a positive integer");
    if (typeof done !== "boolean") return badRequest("invalid_done", "done must be true or false");
    if (typeof expectText !== "string" || expectText.length > PANE_NOTE_MAX) return badRequest("missing_expect_text", "expect_text is the task's text");
    return (store, id, at) => store.setTask(id, line as number, done, expectText, at);
  }
  const { author, text } = payload;
  if (typeof author !== "string" || author.trim() === "" || author.length > PANE_NOTE_AUTHOR_MAX || /[\x00-\x1f\x7f[\]]/.test(author)) {
    return badRequest("invalid_author", `author is a label of 1 to ${PANE_NOTE_AUTHOR_MAX} characters without brackets or control characters`);
  }
  if (typeof text !== "string" || text.trim() === "") return badRequest("missing_text", "text is required");
  if (text.length > PANE_NOTE_LINE_MAX) return badRequest("line_too_long", `an appended line holds at most ${PANE_NOTE_LINE_MAX} characters`);
  return (store, id, at) => store.append(id, author.trim(), text, at);
}

async function summaries(deps: PaneNotesDeps): Promise<Response> {
  const ids = [...new Set((await deps.panes()).map((pane) => pane.terminal_id).filter(isNoteTerminalId))];
  // one unreadable note leaves the others listed
  const notes = ids.flatMap((id) => { try { return [deps.store.read(id)]; } catch { return []; } });
  return jsonResponse({ summaries: notes.filter((note) => note.text.trim() !== "").map(noteSummary) }, 200, { "cache-control": "no-store" });
}

async function change(request: Request, pathname: string, deps: PaneNotesDeps): Promise<Response> {
  if (deps.readOnly) return jsonResponse({ error: { code: "read_only", message: "this device can only watch" } }, 403);
  const payload = await body(request);
  if (payload instanceof Response) return payload;
  const work = changeOf(pathname, payload);
  if (work instanceof Response) return work;
  const terminalId = await terminalOf(deps, payload.pane_id, payload.terminal_id);
  if (terminalId instanceof Response) return terminalId;
  const before = deps.store.read(terminalId).revision;
  const note = work(deps.store, terminalId, (deps.now ?? (() => new Date().toISOString()))());
  if (note.revision !== before) deps.broadcast({ type: "pane-notes", terminal_id: terminalId, summary: noteSummary(note) });
  return answer(note);
}

/** The five note routes; null for any other path. */
export async function handlePaneNotesRequest(request: Request, url: URL, deps: PaneNotesDeps): Promise<Response | null> {
  const { pathname } = url;
  if (!PANE_NOTES_PATHS.includes(pathname)) return null;
  try {
    if (pathname === "/api/pane/notes/summaries") {
      return request.method === "GET" ? await summaries(deps) : badRequest("method_not_allowed", "use GET");
    }
    if (pathname === "/api/pane/notes" && request.method === "GET") {
      const terminalId = await terminalOf(deps, url.searchParams.get("pane_id"), url.searchParams.get("terminal_id"));
      return terminalId instanceof Response ? terminalId : answer(deps.store.read(terminalId));
    }
    const method = pathname === "/api/pane/notes" ? "PUT" : "POST";
    if (request.method !== method) return badRequest("method_not_allowed", pathname === "/api/pane/notes" ? "use GET or PUT" : "use POST");
    return await change(request, pathname, deps);
  } catch (error) {
    if (error instanceof NoteConflict) return conflict(error);
    return errorResponse(error);
  }
}
