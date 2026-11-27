import { describe, expect, it } from "bun:test";
import { AGENT_LOG_HEADING, appendAgentLine, noteSummary, noteTasks, setTaskDone } from "./pane-notes.ts";

const NOTE = [
  "# Build the release",   // 1
  "- [ ] write the notes", // 2
  "* [x] run the tests",   // 3
  "  - [X] nested done",   // 4
  "    - [ ]   indented open  ", // 5
  "- plain item",          // 6
  "```",                   // 7
  "- [ ] inside a fence",  // 8
  "```",                   // 9
  "~~~~",                  // 10
  "- [ ] inside tildes",   // 11
  "~~~",                   // 12 (too short: does not close)
  "~~~~",                  // 13
  "- [] not a box",        // 14
].join("\n");

describe("noteTasks", () => {
  it("finds task lines with -, *, indentation, [x] and [X], and skips fenced lines", () => {
    expect(noteTasks(NOTE)).toEqual([
      { line: 2, done: false, text: "write the notes" },
      { line: 3, done: true, text: "run the tests" },
      { line: 4, done: true, text: "nested done" },
      { line: 5, done: false, text: "indented open" },
    ]);
  });
  it("tolerates CRLF line ends", () => {
    expect(noteTasks("- [ ] one\r\n- [x] two\r\n")).toEqual([
      { line: 1, done: false, text: "one" },
      { line: 2, done: true, text: "two" },
    ]);
  });
  it("an empty note has no tasks", () => {
    expect(noteTasks("")).toEqual([]);
  });
});

describe("noteSummary", () => {
  it("counts open and done tasks and names the first open one", () => {
    expect(noteSummary({ terminal_id: "t1", text: NOTE, revision: 4, updated_at: null }))
      .toEqual({ terminal_id: "t1", open: 2, done: 2, next: "write the notes", revision: 4 });
    expect(noteSummary({ terminal_id: "t1", text: "", revision: 0, updated_at: null }))
      .toEqual({ terminal_id: "t1", open: 0, done: 0, next: null, revision: 0 });
  });
});

describe("setTaskDone", () => {
  it("changes only the box character", () => {
    const done = setTaskDone(NOTE, 2, true)!;
    expect(done.split("\n")[1]).toBe("- [x] write the notes");
    expect(done.split("\n").filter((_, index) => index !== 1)).toEqual(NOTE.split("\n").filter((_, index) => index !== 1));
    expect(setTaskDone(NOTE, 4, false)!.split("\n")[3]).toBe("  - [ ] nested done");
    expect(setTaskDone(NOTE, 5, true)!.split("\n")[4]).toBe("    - [x]   indented open  ");
  });
  it("returns the same text when the task already has that state", () => {
    expect(setTaskDone(NOTE, 3, true)).toBe(NOTE);
  });
  it("keeps a CRLF line end", () => {
    expect(setTaskDone("- [ ] a\r\n- [ ] b", 1, true)).toBe("- [x] a\r\n- [ ] b");
  });
  it("returns null for a non-task line, a fenced line or a line out of range", () => {
    for (const line of [1, 6, 8, 11, 14, 0, -1, 99, 1.5]) expect(setTaskDone(NOTE, line, true)).toBeNull();
  });
});

describe("appendAgentLine", () => {
  const at = "2026-11-27T10:00:00.000Z";
  it("adds the heading once at the end, then appends under it", () => {
    const once = appendAgentLine("# Plan\n- [ ] ship\n", "P6", "started the build", at);
    expect(once).toBe(`# Plan\n- [ ] ship\n\n${AGENT_LOG_HEADING}\n- ${at} [P6] started the build\n`);
    const twice = appendAgentLine(once, "reviewer", "build passed", at);
    expect(twice).toBe(`${once}- ${at} [reviewer] build passed\n`);
    expect(twice.split("\n").filter((line) => line === AGENT_LOG_HEADING)).toHaveLength(1);
  });
  it("starts an empty note with the heading", () => {
    expect(appendAgentLine("", "P1", "hello", at)).toBe(`${AGENT_LOG_HEADING}\n- ${at} [P1] hello\n`);
  });
  it("turns newlines into spaces so one entry stays one line", () => {
    const text = appendAgentLine("", "P\n6", "line one\nline two\r\n## not a heading", at);
    expect(text).toBe(`${AGENT_LOG_HEADING}\n- ${at} [P 6] line one line two ## not a heading\n`);
    expect(noteTasks(appendAgentLine("", "P6", "[ ] looks like a box", at))).toEqual([]);
  });
  it("keeps an author's brackets from closing the label", () => {
    expect(appendAgentLine("", "a]b[c", "x", at)).toContain("[a)b(c] x");
  });
  it("appends inside the log section, before a later heading", () => {
    const text = `# Plan\n\n${AGENT_LOG_HEADING}\n- old\n\n## Later\nowner text\n`;
    expect(appendAgentLine(text, "P6", "new", at))
      .toBe(`# Plan\n\n${AGENT_LOG_HEADING}\n- old\n- ${at} [P6] new\n\n## Later\nowner text\n`);
  });
  it("does not take a heading inside a fence for the log, and closes an open fence first", () => {
    const fenced = `\`\`\`\n${AGENT_LOG_HEADING}\n\`\`\`\n`;
    expect(appendAgentLine(fenced, "P6", "x", at)).toBe(`${fenced.trimEnd()}\n\n${AGENT_LOG_HEADING}\n- ${at} [P6] x\n`);
    const open = "```\ncode";
    const appended = appendAgentLine(open, "P6", "x", at);
    expect(appended).toBe(`\`\`\`\ncode\n\`\`\`\n\n${AGENT_LOG_HEADING}\n- ${at} [P6] x\n`);
    // the next append finds the heading instead of adding another
    expect(appendAgentLine(appended, "P6", "y", at).split("\n").filter((line) => line === AGENT_LOG_HEADING)).toHaveLength(1);
  });
  it("never removes the owner's text", () => {
    const owner = "# Plan\n- [ ] a\n\nnotes";
    expect(appendAgentLine(owner, "P6", "x", at).startsWith(owner)).toBe(true);
  });
});
