// Unit tests for the tool helpers copied from stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.)
// and TermWeave's own run header. Synthetic input only.
import { describe, expect, test } from "bun:test";

import type { NativeChatBlock } from "../../shared/index.ts";

import { call, FIXTURE_PREVIOUS_TODO, FIXTURE_RUNS, result } from "../fixtures.ts";
import { diffFromText, diffFromToolCall } from "./diff.ts";
import { buildEditCards, nativeChatEditFilePatchText } from "./edit-cards.ts";
import { nativeChatEditGutterChars } from "./edit-model.ts";
import { editFilesFromToolPair } from "./edit-normalize.ts";
import { buildNativeChatToolRunRows } from "./run-rows.ts";
import { diffNativeChatTaskLists, normalizeNativeChatTaskList } from "./task-list.ts";
import { nativeChatToolIconName, nativeChatToolRunIconName } from "./tool-icon.ts";
import { mcpToolIdentity } from "./tool-identity.ts";
import { nativeChatToolLineLabel } from "./tool-line-label.ts";
import { nativeChatToolRunHeader } from "./tool-run-header.ts";
import { NATIVE_CHAT_TOOL_RUN_SENTENCE_ENGLISH, nativeChatToolRunSentence } from "./tool-run-sentence.ts";
import { summarizeToolPath } from "./tool-summary.ts";

const runs = FIXTURE_RUNS as Required<typeof FIXTURE_RUNS>;
const sentence = (name: string, live = false) =>
  nativeChatToolRunSentence(runs[name] ?? [], { live }, NATIVE_CHAT_TOOL_RUN_SENTENCE_ENGLISH);

describe("diff builder", () => {
  test("an Edit call's input becomes a path line, removals, then additions", () => {
    expect(diffFromToolCall("Edit", { file_path: "/a.ts", old_string: "x\ny", new_string: "x\nz" })).toEqual([
      { kind: "meta", text: "/a.ts" },
      { kind: "del", text: "x" },
      { kind: "del", text: "y" },
      { kind: "add", text: "x" },
      { kind: "add", text: "z" },
    ]);
  });
  test("a tool outside the edit set and dash-led prose give no diff", () => {
    expect(diffFromToolCall("Read", { file_path: "/a.ts" })).toBeNull();
    expect(diffFromText("- one item only")).toBeNull();
  });
  test("a unified diff keeps hunk headers as meta lines", () => {
    expect(diffFromText("@@ -1 +1 @@\n-a\n+b")?.map((line) => line.kind)).toEqual(["meta", "del", "add"]);
  });
});

describe("edit cards", () => {
  test("Edit: one changed line, counted, without line numbers", () => {
    const files = editFilesFromToolPair({ name: "Edit", input: { file_path: "/a.ts", old_string: "a\nb", new_string: "a\nc" }, result: { output: "ok" } });
    expect(files?.length).toBe(1);
    const file = files![0]!;
    expect([file.added, file.removed, file.lineNumbersKnown, file.changeKind]).toEqual([1, 1, false, "edited"]);
    expect(nativeChatEditGutterChars(file)).toBe(0);
    expect(nativeChatEditFilePatchText(file.lines)).toBe(" a\n-b\n+c");
  });
  test("Write says added only when the result proves creation", () => {
    const write = (output: string) => editFilesFromToolPair({ name: "Write", input: { file_path: "/n.ts", content: "x\ny\n" }, result: { output } })?.[0]?.changeKind;
    expect(write("File created successfully at: /n.ts")).toBe("added");
    expect(write("The file /n.ts has been updated.")).toBe("edited");
  });
  test("MultiEdit separates its snippets with a gap row", () => {
    const files = editFilesFromToolPair({
      name: "MultiEdit",
      input: { file_path: "/a.ts", edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: "d" }] },
      result: { output: "ok" },
    });
    expect(files?.[0]?.lines.map((line) => line.kind)).toEqual(["del", "add", "gap", "del", "add"]);
  });
  test("Codex apply_patch envelope: one card per file", () => {
    const patch = "*** Begin Patch\n*** Add File: new.txt\n+hello\n*** Update File: old.txt\n@@\n-a\n+b\n*** End Patch";
    const files = editFilesFromToolPair({ name: "apply_patch", input: patch, result: { output: "applied" } });
    expect(files?.map((file) => [file.path, file.changeKind, file.added, file.removed])).toEqual([
      ["new.txt", "added", 1, 0],
      ["old.txt", "edited", 1, 1],
    ]);
  });
  test("no card without a result, or with an error result", () => {
    const input = { file_path: "/a.ts", old_string: "a", new_string: "b" };
    expect(editFilesFromToolPair({ name: "Edit", input })).toBeNull();
    expect(editFilesFromToolPair({ name: "Edit", input, result: { output: "no match", isError: true } })).toBeNull();
  });
  test("buildEditCards consumes the edit's result", () => {
    const blocks = runs.oneEdit ?? [];
    const model = buildEditCards(blocks);
    expect(model.editCards.get(blocks[0]!)?.key).toBe("Edit:0");
    expect(model.consumedResults.has(blocks[1]!)).toBe(true);
  });
});

describe("run sentence", () => {
  test("settled runs", () => {
    expect(sentence("threeReads")).toBe("Read 3 files");
    expect(sentence("grepAndRead")).toBe("Searched 1 time and read 1 file");
    expect(sentence("oneEdit")).toBe("Edited 1 file");
    expect(sentence("mcp")).toBe("Used 1 integration");
  });
  test("a lone settled command reads as the command itself", () => {
    expect(sentence("oneBash")).toBe("git status --short");
  });
  test("a live run uses the present tense", () => {
    expect(sentence("liveRead", true)).toBe("Reading 1 file and running 1 command");
  });
});

describe("run header", () => {
  test("a failed result is counted and the run is not a success", () => {
    const header = nativeChatToolRunHeader(runs.failedBash ?? [], false);
    expect([header.failedCallCount, header.succeeded, header.live]).toEqual([1, false, false]);
  });
  test("a settled run whose last call has no result is not marked a success", () => {
    // liveRead's last call has no result: once the turn no longer works on it (it waits on a permission, or was stopped)
    const header = nativeChatToolRunHeader(runs.liveRead ?? [], false);
    expect([header.live, header.succeeded]).toEqual([false, false]);
  });
  test("live only while the turn works and the last call has no result", () => {
    const blocks = runs.liveRead ?? [];
    const live = nativeChatToolRunHeader(blocks, true);
    expect([live.live, live.latestCallLabel, live.runningCall === blocks[2]]).toEqual([true, "bun run build", true]);
    expect(nativeChatToolRunHeader(blocks, false).live).toBe(false);
    expect(nativeChatToolRunHeader(runs.threeReads ?? [], true).live).toBe(false);
  });
  test("icon: shared category, else the wrench", () => {
    expect(nativeChatToolRunHeader(runs.threeReads ?? [], false).iconName).toBe("eye");
    expect(nativeChatToolRunHeader(runs.mcp ?? [], false).iconName).toBe("plug");
    expect(nativeChatToolRunIconName([{ name: "Grep" }, { name: "Read" }])).toBe("wrench");
    expect(nativeChatToolRunIconName([])).toBeNull();
  });
  test("fallback words by call count", () => {
    expect(nativeChatToolRunHeader([result("x", "out")], false).fallbackLabel).toBe("result");
    expect(nativeChatToolRunHeader(runs.oneBash ?? [], false).fallbackLabel).toBe("countOne");
    expect(nativeChatToolRunHeader(runs.threeReads ?? [], false).fallbackLabel).toBe("countN");
  });
});

describe("tool line title and target", () => {
  test("Read: verb by state, basename target, full path kept", () => {
    const read = call("a", "Read", { file_path: "/repo/src/deep/file.ts" });
    expect(nativeChatToolLineLabel(read, result("a", "x"))).toMatchObject({ verb: "read", target: "file.ts", filePath: "/repo/src/deep/file.ts" });
    expect(nativeChatToolLineLabel(read, undefined, true).verb).toBe("reading");
    expect(nativeChatToolLineLabel(read, result("a", "ENOENT", { isError: true })).verb).toBe("triedRead");
  });
  test("Bash: a command row", () => {
    const label = nativeChatToolLineLabel(call("b", "Bash", { command: "ls -la" }), result("b", ""));
    expect([label.verb, label.command, label.target, label.fullCommand]).toEqual(["ran", true, "ls -la", "ls -la"]);
  });
  test("WebFetch drops the scheme; Task reads its description", () => {
    expect(nativeChatToolLineLabel(call("w", "WebFetch", { url: "https://example.com/a" }), result("w", "")).target).toBe("example.com/a");
    expect(nativeChatToolLineLabel(call("t", "Task", { description: "Find callers", prompt: "…" }), result("t", "")).target).toBe("Find callers");
  });
  test("MCP identity and icon", () => {
    expect(mcpToolIdentity("mcp__claude-in-chrome__read_page")).toEqual({ server: "Claude in chrome", tool: "read page" });
    expect(mcpToolIdentity("Read")).toBeNull();
    expect(nativeChatToolIconName("mcp__x__y")).toBe("plug");
    expect(nativeChatToolIconName("Bash")).toBe("square-terminal");
  });
  test("long paths keep their end", () => {
    const long = `/${"segment/".repeat(20)}file.ts`;
    const summary = summarizeToolPath(long);
    expect(summary.startsWith("…/")).toBe(true);
    expect(summary.endsWith("/file.ts")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(80);
  });
});

describe("task lists and run rows", () => {
  test("the diff against the previous list names what changed", () => {
    const before = normalizeNativeChatTaskList("TodoWrite", FIXTURE_PREVIOUS_TODO.input)!;
    const after = normalizeNativeChatTaskList("TodoWrite", runs.todoUpdate?.[0]?.type === "tool-call" ? runs.todoUpdate[0].input : null)!;
    expect(diffNativeChatTaskLists(before, after).map((change) => [change.kind, change.task.content])).toEqual([
      ["completed", "Write the adapter"],
      ["started", "Port the tool rows"],
    ]);
  });
  test("rows: task list, edit card, and paired lines without separate result rows", () => {
    const blocks = [...(runs.todoUpdate ?? []), ...(runs.oneEdit ?? []), ...(runs.oneBash ?? [])];
    const rows = buildNativeChatToolRunRows(blocks, FIXTURE_PREVIOUS_TODO);
    expect(rows.map((row) => row.kind)).toEqual(["tasks", "edit", "line"]);
    const tasks = rows[0];
    expect(tasks?.kind === "tasks" && tasks.taskList.previous !== undefined).toBe(true);
    const line = rows[2];
    expect(line?.kind === "line" && line.result?.output).toBe(" M package.json");
  });
  test("row keys stay the same when a poll rebuilds the blocks", () => {
    const keys = (blocks: NativeChatBlock[]) => buildNativeChatToolRunRows(blocks).map((row) => row.key);
    const copy = (runs.grepAndRead ?? []).map((block) => ({ ...block }));
    expect(keys(copy)).toEqual(keys(runs.grepAndRead ?? []));
  });
});
