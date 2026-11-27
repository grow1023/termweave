/**
 * Pane notes on the screen: the five routes, a small shared store that the header button and the
 * panel read, and the pure rules they follow. A note belongs to a terminal (`terminal_id`); the
 * screen only knows its pane, so the store is keyed by the pane and learns the terminal from the
 * route's answer. The `pane-notes` push (App.tsx turns it into the window event
 * `termweave:pane-notes`) carries a summary only: a newer revision makes the store read the note
 * again. The note text is data: nothing here renders it as HTML or follows it.
 */
import { useEffect, useSyncExternalStore } from "react";

import { ApiError } from "./api.ts";
import { useMachineId } from "./machineContext.tsx";
import { machinePath, paneStorageId } from "../../shared/machines.ts";
import { AGENT_LOG_HEADING, noteTasks, setTaskDone, type PaneNote, type PaneNoteSummary } from "../../shared/pane-notes.ts";

export interface PaneNoteAnswer { note: PaneNote; summary: PaneNoteSummary }

/** A refused note route: the server's own words, and on 409 `note_changed` the stored note. */
export class PaneNoteError extends ApiError {
  readonly serverMessage: string;
  readonly note: PaneNote | null;
  constructor(url: string, status: number, message: string, code: string | null, note: PaneNote | null) {
    super(url, status, message, code);
    this.name = "PaneNoteError";
    this.serverMessage = message;
    this.note = note;
  }
}

// ---------------------------------------------------------------------------------------------
// pure rules

export function isPaneNote(value: unknown): value is PaneNote {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Record<string, unknown>;
  return typeof note.terminal_id === "string" && typeof note.text === "string" && typeof note.revision === "number"
    && (note.updated_at === null || typeof note.updated_at === "string");
}

function isSummary(value: unknown): value is PaneNoteSummary {
  if (typeof value !== "object" || value === null) return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.terminal_id === "string" && typeof summary.open === "number" && typeof summary.done === "number"
    && typeof summary.revision === "number" && (summary.next === null || typeof summary.next === "string");
}

/** `{ note, summary }` from a route's body, or null for any other shape. */
export function parseNoteAnswer(body: unknown): PaneNoteAnswer | null {
  if (typeof body !== "object" || body === null) return null;
  const { note, summary } = body as Record<string, unknown>;
  return isPaneNote(note) && isSummary(summary) ? { note, summary } : null;
}

/** The stored note a 409 answer carries, at the top level or inside the error envelope. */
export function conflictNote(body: unknown): PaneNote | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as { note?: unknown; error?: { note?: unknown } };
  if (isPaneNote(record.note)) return record.note;
  return isPaneNote(record.error?.note) ? record.error.note : null;
}

/** What the folded note shows beside its button: the first open task, or nothing. */
export function foldedLine(summary: PaneNoteSummary | null): string | null {
  return summary !== null && summary.open > 0 && summary.next !== null && summary.next.trim() !== "" ? summary.next : null;
}

export type NoteBlock =
  | { kind: "task"; line: number; done: boolean; text: string }
  | { kind: "text"; line: number; text: string; heading: boolean }
  | { kind: "agent"; line: number; at: string; author: string; text: string };

const AGENT_LINE = /^\s*[-*+]\s+(\S+)\s+\[([^\]]*)\]\s?(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^#{1,6}\s/;

/**
 * The note as the panel shows it: task lines, runs of plain text, and the agents' lines (under
 * AGENT_LOG_HEADING, up to the next heading of level 1 or 2). Line numbers are 1-based, as the
 * shared helpers count them. Blank lines only separate runs of text.
 */
export function noteBlocks(text: string): NoteBlock[] {
  const tasks = new Map(noteTasks(text).map((task) => [task.line, task]));
  let fence: string | null = null;
  let agentSection = false;
  return text.split("\n").reduce<NoteBlock[]>((blocks, raw, index) => {
    const line = index + 1;
    const body = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const fenceMark = FENCE.exec(body)?.[1];
    const fenced = fence !== null || fenceMark !== undefined;
    if (fenceMark !== undefined) fence = fence === null ? fenceMark : fenceMark[0] === fence[0] && fenceMark.length >= fence.length && body.trim() === fenceMark ? null : fence;
    const task = tasks.get(line);
    if (task) return [...blocks, { kind: "task", line, done: task.done, text: task.text }];
    if (!fenced && body.trimEnd() === AGENT_LOG_HEADING) agentSection = true;
    else if (!fenced && /^#{1,2}\s/.test(body)) agentSection = false;
    const agent = agentSection && !fenced ? AGENT_LINE.exec(body) : null;
    if (agent) return [...blocks, { kind: "agent", line, at: agent[1]!, author: agent[2]!, text: agent[3] ?? "" }];
    if (body.trim() === "" && !fenced) return blocks;
    const heading = !fenced && HEADING.test(body);
    const shown = heading ? body.replace(/^#{1,6}\s+/, "") : body;
    const last = blocks[blocks.length - 1];
    // a run of text continues only from the line right above it
    if (!heading && last?.kind === "text" && !last.heading && last.line + last.text.split("\n").length === line) {
      return [...blocks.slice(0, -1), { ...last, text: `${last.text}\n${shown}` }];
    }
    return [...blocks, { kind: "text", line, text: shown, heading }];
  }, []);
}

/** The note with one task line ticked or unticked, for the screen to show before the server answers. */
export function withTaskDone(note: PaneNote, line: number, done: boolean): PaneNote | null {
  const text = setTaskDone(note.text, line, done);
  return text === null ? null : { ...note, text };
}

/** The owner's edit: what they typed, the revision it started from, and a newer note a Save met. */
export interface NoteEdit { readonly text: string; readonly base: number; readonly original: string; readonly conflict: PaneNote | null }

export function startEdit(note: PaneNote): NoteEdit {
  return { text: note.text, base: note.revision, original: note.text, conflict: null };
}

/** A 409: the typed text stays as it is; the server's note waits for the owner's choice. */
export function meetConflict(edit: NoteEdit, server: PaneNote): NoteEdit {
  return { ...edit, conflict: server };
}

/**
 * The owner's choice after a 409. "theirs" takes the server's text; "mine" keeps the typed text
 * and bases it on the server's revision, so the next Save replaces that note on purpose.
 */
export function resolveConflict(edit: NoteEdit, choice: "mine" | "theirs"): NoteEdit {
  const server = edit.conflict;
  if (server === null) return edit;
  return choice === "theirs"
    ? { text: server.text, base: server.revision, original: server.text, conflict: null }
    : { text: edit.text, base: server.revision, original: server.text, conflict: null };
}

export function editChanged(edit: NoteEdit): boolean {
  return edit.text !== edit.original;
}

/**
 * A task's text added to a composer draft without losing what the draft holds: on a new line
 * after it. null when the result would pass `max` characters.
 */
export function appendToDraft(draft: string, task: string, max: number): string | null {
  const next = draft.trim() === "" ? task : `${draft.replace(/\s+$/, "")}\n${task}`;
  return next.length > max ? null : next;
}

export function noteFoldKey(terminalId: string): string {
  return `termweave:pane-note-open:${terminalId}`;
}

// ---------------------------------------------------------------------------------------------
// the routes

async function noteRequest(url: string, method: "GET" | "PUT" | "POST", body?: unknown): Promise<unknown> {
  const response = await fetch(url, method === "GET" ? { cache: "no-store" } : {
    method,
    headers: { "content-type": "application/json", "x-herdr-machine": "1" },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try { parsed = await response.json(); } catch { /* non-JSON body */ }
  if (!response.ok) {
    const envelope = (parsed as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const message = typeof envelope?.message === "string" ? envelope.message : response.statusText || `HTTP ${response.status}`;
    const code = typeof envelope?.code === "string" ? envelope.code : null;
    throw new PaneNoteError(url, response.status, message, code, response.status === 409 ? conflictNote(parsed) : null);
  }
  return parsed;
}

async function answerOf(url: string, method: "GET" | "PUT" | "POST", body?: unknown): Promise<PaneNoteAnswer> {
  const answer = parseNoteAnswer(await noteRequest(url, method, body));
  if (answer === null) throw new PaneNoteError(url, 502, "The server sent a note in an unknown shape.", "bad_answer", null);
  return answer;
}

export function fetchPaneNote(paneId: string, machineId = "local"): Promise<PaneNoteAnswer> {
  return answerOf(machinePath(machineId, `pane/notes?${new URLSearchParams({ pane_id: paneId }).toString()}`), "GET");
}

export async function fetchPaneNoteSummaries(machineId = "local"): Promise<PaneNoteSummary[]> {
  const body = await noteRequest(machinePath(machineId, "pane/notes/summaries"), "GET");
  const list = (body as { summaries?: unknown } | null)?.summaries;
  return Array.isArray(list) ? list.filter(isSummary) : [];
}

export function savePaneNote(paneId: string, text: string, baseRevision: number, machineId = "local"): Promise<PaneNoteAnswer> {
  return answerOf(machinePath(machineId, "pane/notes"), "PUT", { pane_id: paneId, text, base_revision: baseRevision });
}

export function setPaneNoteTask(paneId: string, line: number, done: boolean, expectText: string, machineId = "local"): Promise<PaneNoteAnswer> {
  return answerOf(machinePath(machineId, "pane/notes/task"), "POST", { pane_id: paneId, line, done, expect_text: expectText });
}

export function appendPaneNote(paneId: string, author: string, text: string, machineId = "local"): Promise<PaneNoteAnswer> {
  return answerOf(machinePath(machineId, "pane/notes/append"), "POST", { pane_id: paneId, author, text });
}

// ---------------------------------------------------------------------------------------------
// the store

/** "missing": the server has no such pane or no note routes (an older server); the control hides. */
export interface PaneNoteEntry {
  readonly status: "loading" | "ready" | "missing" | "error";
  readonly note: PaneNote | null;
  readonly summary: PaneNoteSummary | null;
}

const LOADING: PaneNoteEntry = { status: "loading", note: null, summary: null };
const entries = new Map<string, PaneNoteEntry>();
const targets = new Map<string, { machineId: string; paneId: string; users: number }>();
const requests = new Map<string, number>();
const listeners = new Set<() => void>();

function publish(key: string, entry: PaneNoteEntry): void {
  entries.set(key, entry);
  for (const listener of listeners) listener();
}

/** A route's answer for a pane: kept unless the store already holds a newer revision. */
export function acceptPaneNote(machineId: string, paneId: string, answer: PaneNoteAnswer): void {
  const key = paneStorageId(machineId, paneId);
  const current = entries.get(key)?.note;
  if (current && current.terminal_id === answer.note.terminal_id && current.revision > answer.note.revision) return;
  publish(key, { status: "ready", note: answer.note, summary: answer.summary });
}

export async function reloadPaneNote(machineId: string, paneId: string): Promise<void> {
  const key = paneStorageId(machineId, paneId);
  const request = (requests.get(key) ?? 0) + 1;
  requests.set(key, request);
  try {
    const answer = await fetchPaneNote(paneId, machineId);
    if (requests.get(key) !== request) return;
    // a slow read never undoes a newer change's answer; another terminal's note replaces it outright
    acceptPaneNote(machineId, paneId, answer);
  } catch (error) {
    if (requests.get(key) !== request) return;
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 405);
    publish(key, { ...(entries.get(key) ?? LOADING), status: missing ? "missing" : "error" });
  }
}

function onPush(event: Event): void {
  const detail = (event as CustomEvent<unknown>).detail as { type?: unknown; terminal_id?: unknown; summary?: unknown } | null;
  if (!detail || detail.type !== "pane-notes" || typeof detail.terminal_id !== "string" || !isSummary(detail.summary)) return;
  const summary = detail.summary;
  for (const [key, entry] of entries) {
    const note = entry.note;
    if (note === null || note.terminal_id !== detail.terminal_id || summary.revision <= note.revision) continue;
    publish(key, { ...entry, summary });
    const target = targets.get(key);
    if (target) void reloadPaneNote(target.machineId, target.paneId);
  }
}

function onSessionChanged(): void {
  for (const target of targets.values()) void reloadPaneNote(target.machineId, target.paneId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("termweave:pane-notes", onPush);
    window.addEventListener("termweave:session-changed", onSessionChanged);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("termweave:pane-notes", onPush);
      window.removeEventListener("termweave:session-changed", onSessionChanged);
    }
  };
}

/** Loads the pane's note while a component shows it, and reads it again on each mount. */
function useTarget(machineId: string, paneId: string | null): void {
  useEffect(() => {
    if (paneId === null) return;
    const key = paneStorageId(machineId, paneId);
    const target = targets.get(key);
    targets.set(key, { machineId, paneId, users: (target?.users ?? 0) + 1 });
    void reloadPaneNote(machineId, paneId);
    return () => {
      const current = targets.get(key);
      if (!current || current.users <= 1) targets.delete(key);
      else targets.set(key, { ...current, users: current.users - 1 });
    };
  }, [machineId, paneId]);
}

/** The pane's note, its summary, and whether it loaded (this app's machine, from context). */
export function usePaneNote(paneId: string | null): PaneNoteEntry {
  const machineId = useMachineId();
  useTarget(machineId, paneId);
  const key = paneId === null ? null : paneStorageId(machineId, paneId);
  return useSyncExternalStore(subscribe, () => (key === null ? LOADING : entries.get(key) ?? LOADING), () => LOADING);
}

/** The folded note's numbers alone: open and done tasks and the first open one. */
export function usePaneNoteSummary(paneId: string | null): PaneNoteSummary | null {
  return usePaneNote(paneId).summary;
}
