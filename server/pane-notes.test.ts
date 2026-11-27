import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_LOG_HEADING, PANE_NOTE_LINE_MAX, PANE_NOTE_MAX } from "../shared/pane-notes.ts";
import { handleBotCliRequest } from "./bots/api.ts";
import type { BotRuntime } from "./bots/runtime.ts";
import type { BotStore } from "./bots/store.ts";
import { PaneNoteStore, handlePaneNotesRequest, isNoteTerminalId, noteOfPane, type NotePane, type PaneNotesDeps, type PaneNotesMessage } from "./pane-notes.ts";

const AT = "2026-11-27T10:00:00.000Z";
let dir: string;
let messages: PaneNotesMessage[];
let panes: NotePane[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pane-notes-"));
  messages = [];
  panes = [{ pane_id: "w1:p1", terminal_id: "term-1" }, { pane_id: "w1:p2", terminal_id: "fixture:terminal" }, { pane_id: "w1:p3", terminal_id: ".." }];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function deps(readOnly = false): PaneNotesDeps {
  return { store: new PaneNoteStore(dir), panes: async () => panes, broadcast: (message) => { messages = [...messages, message]; }, readOnly, now: () => AT };
}
async function call(method: string, path: string, body?: unknown, readOnly = false): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = new URL(`http://127.0.0.1${path}`);
  const request = new Request(url, { method, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } }) });
  const response = await handlePaneNotesRequest(request, url, deps(readOnly));
  if (!response) throw new Error("route not handled");
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}
const code = (json: Record<string, unknown>): unknown => (json.error as { code?: unknown } | undefined)?.code;
const note = (json: Record<string, unknown>) => json.note as { text: string; revision: number; terminal_id: string; updated_at: string | null };

describe("PaneNoteStore", () => {
  it("reads a missing note as empty with revision 0", () => {
    expect(new PaneNoteStore(dir).read("term-1")).toEqual({ terminal_id: "term-1", text: "", revision: 0, updated_at: null });
  });
  it("grows the revision by one on every change and keeps the file", () => {
    const store = new PaneNoteStore(dir);
    expect(store.replace("term-1", "- [ ] a", 0, AT).revision).toBe(1);
    expect(store.setTask("term-1", 1, true, "a", AT).revision).toBe(2);
    expect(store.append("term-1", "P6", "did a", AT).revision).toBe(3);
    const stored = JSON.parse(readFileSync(join(dir, "pane-notes", "term-1.json"), "utf8"));
    expect(stored).toEqual({ terminal_id: "term-1", text: `- [x] a\n\n${AGENT_LOG_HEADING}\n- ${AT} [P6] did a\n`, revision: 3, updated_at: AT });
    expect(new PaneNoteStore(dir).read("term-1").revision).toBe(3);
  });
  it("writes through a temp file and a rename, leaving no temp file", () => {
    const store = new PaneNoteStore(dir);
    store.replace("term-1", "one", 0, AT);
    store.replace("term-1", "two", 1, AT);
    expect(readdirSync(join(dir, "pane-notes"))).toEqual(["term-1.json"]);
  });
  it("keeps the old note whole when a write fails", () => {
    if (process.getuid?.() === 0 || process.platform === "win32") return; // root and Windows ignore the mode
    const store = new PaneNoteStore(dir);
    store.replace("term-1", "kept", 0, AT);
    chmodSync(join(dir, "pane-notes"), 0o500);
    try {
      expect(() => store.replace("term-1", "lost", 1, AT)).toThrow();
    } finally { chmodSync(join(dir, "pane-notes"), 0o700); }
    expect(store.read("term-1")).toMatchObject({ text: "kept", revision: 1 });
    expect(readdirSync(join(dir, "pane-notes"))).toEqual(["term-1.json"]);
  });
  it("names a file for an id with a colon without the colon", () => {
    new PaneNoteStore(dir).replace("fixture:terminal", "x", 0, AT);
    expect(readdirSync(join(dir, "pane-notes"))).toEqual(["fixture%3Aterminal.json"]);
    expect(new PaneNoteStore(dir).read("fixture:terminal").text).toBe("x");
  });
  it("refuses a terminal id that is not a plain visible name", () => {
    for (const id of [".", "..", "", "x".repeat(201), "a b", "a\nb", "aé"]) {
      expect(isNoteTerminalId(id)).toBe(false);
      expect(() => new PaneNoteStore(dir).read(id)).toThrow("invalid terminal id");
    }
  });
  it("keeps an id with a slash, a backslash or a percent sign inside the folder, each under its own name", () => {
    const store = new PaneNoteStore(dir);
    for (const [index, id] of ["../escape", "a/b", "a\\b", "a%2Fb", "%tmux@1"].entries()) store.replace(id, `n${index}`, 0, AT);
    expect(readdirSync(join(dir, "pane-notes")).sort()).toEqual(["%25tmux%401.json", "..%2Fescape.json", "a%252Fb.json", "a%2Fb.json", "a%5Cb.json"]);
    expect(readdirSync(dir)).toEqual(["pane-notes"]);
    expect(store.read("a/b").text).toBe("n1");
    expect(store.read("a%2Fb").text).toBe("n3");
  });
  it("treats a damaged file as an error, never as an empty note", () => {
    mkdirSync(join(dir, "pane-notes"), { recursive: true });
    writeFileSync(join(dir, "pane-notes", "term-1.json"), "{not json, secret words");
    expect(() => new PaneNoteStore(dir).read("term-1")).toThrow("the stored note is unreadable");
    writeFileSync(join(dir, "pane-notes", "term-1.json"), JSON.stringify({ terminal_id: "TERM-1", text: "x", revision: 1, updated_at: null }));
    expect(() => new PaneNoteStore(dir).read("term-1")).toThrow("the stored note is unreadable");
  });
  it("noteOfPane reads by the pane's terminal", () => {
    new PaneNoteStore(dir).replace("term-1", "- [ ] a", 0, AT);
    expect(noteOfPane(new PaneNoteStore(dir), panes, "w1:p1").summary).toEqual({ terminal_id: "term-1", open: 1, done: 0, next: "a", revision: 1 });
    expect(() => noteOfPane(new PaneNoteStore(dir), panes, "w9:p9")).toThrow("has no terminal");
  });
});

describe("GET /api/pane/notes", () => {
  it("answers the note and summary of the pane's terminal", async () => {
    const { status, json } = await call("GET", "/api/pane/notes?pane_id=w1%3Ap1");
    expect(status).toBe(200);
    expect(json).toEqual({ note: { terminal_id: "term-1", text: "", revision: 0, updated_at: null }, summary: { terminal_id: "term-1", open: 0, done: 0, next: null, revision: 0 } });
  });
  it("answers 404 pane_not_found for an unknown pane and 400 without pane_id", async () => {
    expect(await call("GET", "/api/pane/notes?pane_id=w9%3Ap9")).toMatchObject({ status: 404, json: { error: { code: "pane_not_found" } } });
    expect((await call("GET", "/api/pane/notes")).status).toBe(400);
  });
  it("refuses a pane whose terminal id cannot be a file name", async () => {
    expect(await call("GET", "/api/pane/notes?pane_id=w1%3Ap3")).toMatchObject({ status: 400, json: { error: { code: "invalid_terminal_id" } } });
  });
  it("answers 409 terminal_changed when the pane shows another terminal", async () => {
    expect(await call("GET", "/api/pane/notes?pane_id=w1%3Ap1&terminal_id=term-2")).toMatchObject({ status: 409, json: { error: { code: "terminal_changed" } } });
  });
  it("a read-only viewer can read", async () => {
    expect((await call("GET", "/api/pane/notes?pane_id=w1%3Ap1", undefined, true)).status).toBe(200);
  });
});

describe("PUT /api/pane/notes", () => {
  it("replaces the text over the stored revision and broadcasts the summary", async () => {
    const { status, json } = await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "- [ ] ship\n- [x] test", base_revision: 0 });
    expect(status).toBe(200);
    expect(note(json)).toEqual({ terminal_id: "term-1", text: "- [ ] ship\n- [x] test", revision: 1, updated_at: AT });
    expect(messages).toEqual([{ type: "pane-notes", terminal_id: "term-1", summary: { terminal_id: "term-1", open: 1, done: 1, next: "ship", revision: 1 } }]);
  });
  it("answers 409 note_changed with the stored note when base_revision is old", async () => {
    await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "first", base_revision: 0 });
    const { status, json } = await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "second", base_revision: 0 });
    expect(status).toBe(409);
    expect(code(json)).toBe("note_changed");
    expect(note(json).text).toBe("first");
    expect(note(json).revision).toBe(1);
    expect(messages).toHaveLength(1);
  });
  it("does not bump the revision for the same text", async () => {
    await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "same", base_revision: 0 });
    expect(note((await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "same", base_revision: 1 })).json).revision).toBe(1);
    expect(messages).toHaveLength(1);
  });
  it("holds the length limit", async () => {
    expect((await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "x".repeat(PANE_NOTE_MAX), base_revision: 0 })).status).toBe(200);
    expect(await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "x".repeat(PANE_NOTE_MAX + 1), base_revision: 1 })).toMatchObject({ status: 400, json: { error: { code: "note_too_long" } } });
  });
  it("validates the body", async () => {
    expect(code((await call("PUT", "/api/pane/notes", "not json")).json)).toBe("invalid_json");
    expect(code((await call("PUT", "/api/pane/notes", [1])).json)).toBe("invalid_body");
    expect(code((await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: 5, base_revision: 0 })).json)).toBe("missing_text");
    expect(code((await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "x", base_revision: -1 })).json)).toBe("invalid_base_revision");
    expect(code((await call("PUT", "/api/pane/notes", { text: "x", base_revision: 0 })).json)).toBe("missing_pane_id");
    expect(code((await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", terminal_id: "a b", text: "x", base_revision: 0 })).json)).toBe("invalid_terminal_id");
    expect(code((await call("POST", "/api/pane/notes", { pane_id: "w1:p1", text: "x", base_revision: 0 })).json)).toBe("method_not_allowed");
  });
  it("refuses a read-only viewer on every changing route", async () => {
    for (const [method, path] of [["PUT", "/api/pane/notes"], ["POST", "/api/pane/notes/task"], ["POST", "/api/pane/notes/append"]] as const) {
      expect(await call(method, path, { pane_id: "w1:p1", text: "x", base_revision: 0 }, true)).toMatchObject({ status: 403, json: { error: { code: "read_only" } } });
    }
    expect(messages).toEqual([]);
  });
  it("answers 409 terminal_changed when a pinned terminal is gone", async () => {
    expect((await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", terminal_id: "term-old", text: "x", base_revision: 0 })).status).toBe(409);
  });
});

describe("POST /api/pane/notes/task", () => {
  beforeEach(async () => { await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "# Plan\n- [ ] ship\n- [x] test", base_revision: 0 }); messages = []; });
  it("sets a task line done and back", async () => {
    const done = await call("POST", "/api/pane/notes/task", { pane_id: "w1:p1", line: 2, done: true, expect_text: "ship" });
    expect(done.status).toBe(200);
    expect(note(done.json).text).toBe("# Plan\n- [x] ship\n- [x] test");
    expect(done.json.summary).toEqual({ terminal_id: "term-1", open: 0, done: 2, next: null, revision: 2 });
    expect(note((await call("POST", "/api/pane/notes/task", { pane_id: "w1:p1", line: 2, done: false, expect_text: "ship" })).json).text).toBe("# Plan\n- [ ] ship\n- [x] test");
    expect(messages).toHaveLength(2);
  });
  it("answers 409 note_changed for a non-task line or another task's text", async () => {
    for (const [line, text] of [[1, "Plan"], [2, "something else"], [9, "ship"]] as const) {
      const { status, json } = await call("POST", "/api/pane/notes/task", { pane_id: "w1:p1", line, done: true, expect_text: text });
      expect(status).toBe(409);
      expect(code(json)).toBe("note_changed");
      expect(note(json).revision).toBe(1);
    }
    expect(messages).toEqual([]);
  });
  it("toggles an owner's task longer than an appended line may be", async () => {
    const long = "y".repeat(PANE_NOTE_LINE_MAX + 500);
    await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: `- [ ] ${long}`, base_revision: 1 });
    expect((await call("POST", "/api/pane/notes/task", { pane_id: "w1:p1", line: 1, done: true, expect_text: long })).status).toBe(200);
  });
  it("validates line, done and expect_text", async () => {
    expect(code((await call("POST", "/api/pane/notes/task", { pane_id: "w1:p1", line: 0, done: true, expect_text: "ship" })).json)).toBe("invalid_line");
    expect(code((await call("POST", "/api/pane/notes/task", { pane_id: "w1:p1", line: 2, done: "yes", expect_text: "ship" })).json)).toBe("invalid_done");
    expect(code((await call("POST", "/api/pane/notes/task", { pane_id: "w1:p1", line: 2, done: true })).json)).toBe("missing_expect_text");
  });
});

describe("POST /api/pane/notes/append", () => {
  it("appends an authored line under the agent log and keeps the owner's text", async () => {
    await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "owner words", base_revision: 0 });
    const { status, json } = await call("POST", "/api/pane/notes/append", { pane_id: "w1:p1", author: "P6", text: "built\nand tested" });
    expect(status).toBe(200);
    expect(note(json).text).toBe(`owner words\n\n${AGENT_LOG_HEADING}\n- ${AT} [P6] built and tested\n`);
    expect(note(json).revision).toBe(2);
    expect(messages.at(-1)?.terminal_id).toBe("term-1");
  });
  it("holds the line and author limits", async () => {
    expect((await call("POST", "/api/pane/notes/append", { pane_id: "w1:p1", author: "P6", text: "x".repeat(PANE_NOTE_LINE_MAX) })).status).toBe(200);
    expect(code((await call("POST", "/api/pane/notes/append", { pane_id: "w1:p1", author: "P6", text: "x".repeat(PANE_NOTE_LINE_MAX + 1) })).json)).toBe("line_too_long");
    expect((await call("POST", "/api/pane/notes/append", { pane_id: "w1:p1", author: "a".repeat(40), text: "x" })).status).toBe(200);
    for (const author of ["a".repeat(41), "", "  ", "P[6]", "P\n6", 6]) {
      expect(code((await call("POST", "/api/pane/notes/append", { pane_id: "w1:p1", author, text: "x" })).json)).toBe("invalid_author");
    }
    expect(code((await call("POST", "/api/pane/notes/append", { pane_id: "w1:p1", author: "P6", text: " " })).json)).toBe("missing_text");
  });
  it("answers 409 note_full when the line would pass the note limit", async () => {
    await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "x".repeat(PANE_NOTE_MAX - 10), base_revision: 0 });
    const { status, json } = await call("POST", "/api/pane/notes/append", { pane_id: "w1:p1", author: "P6", text: "more" });
    expect(status).toBe(409);
    expect(code(json)).toBe("note_full");
    expect(note(json).revision).toBe(1);
  });
});

describe("tw-bot pane notes (POST /api/bot-cli/pane-notes)", () => {
  const SECRET = "fixture-secret";
  const store = { botBySecret: (given: string) => (given === SECRET ? { id: "b1" } : undefined), secret: () => SECRET } as unknown as BotStore;
  const runtime = { listPanes: async () => [{ paneId: "w1:p1" }] } as unknown as BotRuntime;
  const cli = (id: string, reader = true) => handleBotCliRequest(
    new Request("http://127.0.0.1/api/bot-cli/pane-notes", { method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ id }) }),
    "/api/bot-cli/pane-notes", true, runtime, store, async () => [],
    reader ? async (paneId) => noteOfPane(new PaneNoteStore(dir), panes, paneId) : undefined);
  it("reads the note of a pane the bot can read, marked as data", async () => {
    new PaneNoteStore(dir).replace("term-1", "- [ ] a", 0, AT);
    const response = await cli("w1:p1");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ untrusted: true, note: { terminal_id: "term-1", text: "- [ ] a", revision: 1 }, summary: { open: 1, next: "a" } });
  });
  it("refuses a pane the bot cannot read, and answers not found without a reader", async () => {
    expect(await (await cli("w1:p2")).json()).toMatchObject({ error: { code: "unknown_pane" } });
    expect((await cli("w1:p1", false)).status).toBe(400);
  });
});

describe("GET /api/pane/notes/summaries", () => {
  it("lists the live panes whose note has text, and skips ids that cannot hold a note", async () => {
    await call("PUT", "/api/pane/notes", { pane_id: "w1:p1", text: "- [ ] a", base_revision: 0 });
    await call("PUT", "/api/pane/notes", { pane_id: "w1:p2", text: "  ", base_revision: 0 });
    new PaneNoteStore(dir).replace("closed-term", "kept after close", 0, AT);
    const { status, json } = await call("GET", "/api/pane/notes/summaries");
    expect(status).toBe(200);
    expect(json).toEqual({ summaries: [{ terminal_id: "term-1", open: 1, done: 0, next: "a", revision: 1 }] });
    // the closed terminal's note stays on disk
    expect(new PaneNoteStore(dir).read("closed-term").text).toBe("kept after close");
  });
});
