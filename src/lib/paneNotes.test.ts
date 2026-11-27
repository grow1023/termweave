import { describe, expect, test } from "bun:test";

import { appendAgentLine, type PaneNote } from "../../shared/pane-notes.ts";
import {
  appendToDraft,
  conflictNote,
  editChanged,
  foldedLine,
  meetConflict,
  noteBlocks,
  parseNoteAnswer,
  resolveConflict,
  startEdit,
  withTaskDone,
} from "./paneNotes.ts";

const note = (text: string, revision = 3): PaneNote => ({ terminal_id: "term-1", text, revision, updated_at: "2026-11-27T10:00:00.000Z" });

describe("foldedLine", () => {
  test("shows the first open task", () => {
    expect(foldedLine({ terminal_id: "t", open: 2, done: 1, next: "Run the tests", revision: 4 })).toBe("Run the tests");
  });
  test("shows nothing without a summary, without open tasks, or with an empty task", () => {
    expect(foldedLine(null)).toBeNull();
    expect(foldedLine({ terminal_id: "t", open: 0, done: 3, next: null, revision: 4 })).toBeNull();
    expect(foldedLine({ terminal_id: "t", open: 1, done: 0, next: "  ", revision: 4 })).toBeNull();
  });
});

describe("noteBlocks", () => {
  test("splits tasks, text runs and headings, with 1-based lines", () => {
    const blocks = noteBlocks("# Build the importer\nIt reads /srv/demo/data.\nTwo lines.\n\n- [ ] Write the parser\n- [x] Read the spec");
    expect(blocks).toEqual([
      { kind: "text", line: 1, text: "Build the importer", heading: true },
      { kind: "text", line: 2, text: "It reads /srv/demo/data.\nTwo lines.", heading: false },
      { kind: "task", line: 5, done: false, text: "Write the parser" },
      { kind: "task", line: 6, done: true, text: "Read the spec" },
    ]);
  });

  test("marks the lines that appendAgentLine writes as agent lines with their author", () => {
    const text = appendAgentLine("- [ ] Ship it", "P6", "tests pass", "2026-11-27T10:05:00.000Z");
    const blocks = noteBlocks(text);
    expect(blocks.at(-1)).toEqual({ kind: "agent", line: 4, at: "2026-11-27T10:05:00.000Z", author: "P6", text: "tests pass" });
    expect(blocks[0]).toEqual({ kind: "task", line: 1, done: false, text: "Ship it" });
  });

  test("a list line outside the agent log stays the owner's text", () => {
    expect(noteBlocks("- 2026-11-27 [P6] not an agent")[0]?.kind).toBe("text");
  });

  test("the agent section ends at the next level-2 heading", () => {
    const blocks = noteBlocks("## Agent log\n- 2026-11-27T10:00:00Z [bot] hi\n## Later\n- 2026-11-27T11:00:00Z [x] owner text");
    expect(blocks.map((block) => block.kind)).toEqual(["text", "agent", "text", "text"]);
  });

  test("a task inside a code fence is text", () => {
    const blocks = noteBlocks("```\n- [ ] not a task\n```");
    expect(blocks.some((block) => block.kind === "task")).toBe(false);
  });
});

describe("withTaskDone", () => {
  test("ticks only the box and keeps the revision", () => {
    const next = withTaskDone(note("- [ ] One\n- [ ] Two"), 2, true);
    expect(next?.text).toBe("- [ ] One\n- [x] Two");
    expect(next?.revision).toBe(3);
  });
  test("null for a line that is not a task", () => {
    expect(withTaskDone(note("plain"), 1, true)).toBeNull();
  });
});

describe("the owner's edit and a 409", () => {
  test("a conflict keeps the typed text and the old base until the owner chooses", () => {
    const edit = { ...startEdit(note("old")), text: "mine" };
    const met = meetConflict(edit, note("theirs", 5));
    expect(met.text).toBe("mine");
    expect(met.base).toBe(3);
    expect(met.conflict?.revision).toBe(5);
  });
  test("keep mine: the typed text on the server's revision", () => {
    const resolved = resolveConflict(meetConflict({ ...startEdit(note("old")), text: "mine" }, note("theirs", 5)), "mine");
    expect(resolved).toEqual({ text: "mine", base: 5, original: "theirs", conflict: null });
    expect(editChanged(resolved)).toBe(true);
  });
  test("take theirs: the server's text, nothing changed", () => {
    const resolved = resolveConflict(meetConflict({ ...startEdit(note("old")), text: "mine" }, note("theirs", 5)), "theirs");
    expect(resolved.text).toBe("theirs");
    expect(resolved.base).toBe(5);
    expect(editChanged(resolved)).toBe(false);
  });
  test("no conflict: resolve changes nothing", () => {
    const edit = startEdit(note("x"));
    expect(resolveConflict(edit, "mine")).toBe(edit);
  });
});

describe("appendToDraft", () => {
  test("an empty draft takes the task", () => {
    expect(appendToDraft("", "Run the tests", 100)).toBe("Run the tests");
    expect(appendToDraft("  \n", "Run the tests", 100)).toBe("Run the tests");
  });
  test("a draft keeps its text and gets the task on a new line", () => {
    expect(appendToDraft("Please\n", "Run the tests", 100)).toBe("Please\nRun the tests");
  });
  test("null past the limit", () => {
    expect(appendToDraft("12345", "6789", 9)).toBeNull();
  });
});

describe("route answers", () => {
  test("parseNoteAnswer accepts the contract's shape only", () => {
    const answer = { note: note("x"), summary: { terminal_id: "term-1", open: 0, done: 0, next: null, revision: 3 } };
    expect(parseNoteAnswer(answer)).toEqual(answer);
    expect(parseNoteAnswer({ note: { text: 1 }, summary: answer.summary })).toBeNull();
    expect(parseNoteAnswer(null)).toBeNull();
  });
  test("conflictNote finds the stored note at the top level or in the error envelope", () => {
    expect(conflictNote({ error: { code: "note_changed", message: "changed" }, note: note("a", 7) })?.revision).toBe(7);
    expect(conflictNote({ error: { code: "note_changed", message: "changed", note: note("b", 8) } })?.revision).toBe(8);
    expect(conflictNote({ error: { code: "note_changed" } })).toBeNull();
  });
});
