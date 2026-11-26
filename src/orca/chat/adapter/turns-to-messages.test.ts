// Synthetic turns only: no real transcript or personal data.
import { describe, expect, it } from "bun:test";

import type { ConversationTurn } from "../../../../shared/protocol.ts";
import type { NativeChatToolCallBlock, NativeChatToolResultBlock } from "../shared/types.ts";
import { mcpIdentity, turnsToMessages } from "./turns-to-messages.ts";

const ctx = { paneId: "w1:p1", machineId: "local", firstTurnIndex: 0 };
const TS = "2026-11-27T01:00:00.000Z";
const END = "2026-11-27T01:00:12.000Z";

function tool(name: string, input: string, extra: Partial<Extract<ConversationTurn["parts"][number], { kind: "tool" }>> = {}) {
  return { kind: "tool" as const, name, summary: `${name} summary`, input, output: "ok", ...extra };
}

describe("turnsToMessages", () => {
  it("maps user text to one user message with the turn's time", () => {
    const [message, ...rest] = turnsToMessages([{ role: "user", ts: TS, parts: [{ kind: "text", text: "hello" }] }], ctx);
    expect(rest).toHaveLength(0);
    expect(message).toEqual({
      id: `${TS}:user:0`, role: "user", blocks: [{ type: "text", text: "hello" }],
      timestamp: Date.parse(TS), source: "transcript", turnIndex: 0, endsTurn: false,
    });
  });

  it("keeps a pasted image and the text in one user message, the image as a URL", () => {
    const messages = turnsToMessages([{ role: "user", ts: TS, parts: [
      { kind: "image", media_type: "image/png", ref: "u1:0" },
      { kind: "text", text: "what is this" },
    ] }], ctx);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.blocks).toEqual([
      { type: "image-ref", url: "/api/pane/conversation/image?pane_id=w1%3Ap1&ref=u1%3A0", mediaType: "image/png" },
      { type: "text", text: "what is this" },
    ]);
  });

  it("keeps the order text → thinking → tool → text in an assistant turn", () => {
    const messages = turnsToMessages([{ role: "assistant", ts: TS, end_ts: END, parts: [
      { kind: "text", text: "Let me look." },
      { kind: "thinking", text: "plan" },
      tool("Read", "{\"file_path\":\"a.ts\"}"),
      { kind: "text", text: "Done." },
    ] }], ctx);
    expect(messages.map((message) => message.role)).toEqual(["assistant", "reasoning", "assistant", "assistant"]);
    expect(messages.map((message) => message.blocks.map((block) => block.type))).toEqual([
      ["text"], ["text"], ["tool-call", "tool-result"], ["text"],
    ]);
    expect(messages.map((message) => message.endsTurn)).toEqual([false, false, false, true]);
    expect(messages[3]!.timestamp).toBe(Date.parse(END));
    expect(messages[0]!.timestamp).toBe(Date.parse(TS));
  });

  it("puts a tool on the assistant message before it, and pairs call and result", () => {
    const [message] = turnsToMessages([{ role: "assistant", ts: TS, parts: [
      { kind: "text", text: "Reading." },
      tool("Read", "{}"),
      tool("Grep", "{}"),
    ] }], ctx);
    const calls = message!.blocks.filter((block): block is NativeChatToolCallBlock => block.type === "tool-call");
    const results = message!.blocks.filter((block): block is NativeChatToolResultBlock => block.type === "tool-result");
    expect(calls.map((call) => call.callId)).toEqual([`${TS}:assistant:0:t1`, `${TS}:assistant:0:t2`]);
    expect(results.map((result) => result.callId)).toEqual(calls.map((call) => call.callId));
  });

  it("carries a cut output's ref and size, an error and tool images", () => {
    const [message] = turnsToMessages([{ role: "assistant", ts: TS, parts: [
      tool("Bash", "{\"command\":\"ls\"}", { output_ref: "call-7", output_size: 90000, error: true, images: [{ media_type: "image/jpeg", ref: "r9" }] }),
    ] }], ctx);
    const result = message!.blocks[1] as NativeChatToolResultBlock;
    expect(result.fullOutputRef).toBe("call-7");
    expect(result.outputSize).toBe(90000);
    expect(result.isError).toBe(true);
    expect(result.images?.[0]?.url).toBe("/api/pane/conversation/image?pane_id=w1%3Ap1&ref=r9");
  });

  it("parses an Edit input back to an object", () => {
    const input = JSON.stringify({ file_path: "a.ts", old_string: "x", new_string: "y" }, null, 2);
    const [message] = turnsToMessages([{ role: "assistant", ts: TS, parts: [tool("Edit", input)] }], ctx);
    expect((message!.blocks[0] as NativeChatToolCallBlock).input).toEqual({ file_path: "a.ts", old_string: "x", new_string: "y" });
  });

  it("turns input JSON that does not parse into {}", () => {
    const [message] = turnsToMessages([{ role: "assistant", ts: TS, parts: [tool("Bash", "{not json")] }], ctx);
    const call = message!.blocks[0] as NativeChatToolCallBlock;
    expect(call.input).toEqual({});
    expect(call.summary).toBe("Bash summary");
  });

  it("maps a compaction and a notice to system messages", () => {
    const messages = turnsToMessages([
      { role: "user", ts: TS, parts: [{ kind: "compact", text: "summary" }] },
      { role: "user", ts: END, parts: [{ kind: "notice", text: "job done" }] },
    ], ctx);
    expect(messages.map((message) => [message.role, message.blocks[0]])).toEqual([
      ["system", { type: "text", text: "summary", presentation: "compact" }],
      ["system", { type: "text", text: "job done", presentation: "notice" }],
    ]);
  });

  it("maps the interrupted user text to a system message", () => {
    const [message] = turnsToMessages([{ role: "user", ts: TS, parts: [{ kind: "text", text: "[Request interrupted by user for tool use]" }] }], ctx);
    expect(message!.role).toBe("system");
    expect(message!.blocks[0]).toEqual({ type: "text", text: "[Request interrupted by user for tool use]", presentation: "interrupted" });
  });

  it("draws a skill the agent used as a Skill tool line, and one the user invoked as a system row", () => {
    const skill = { name: "plan", evidence: "invocation" as const, status: "loaded" as const };
    const [agent] = turnsToMessages([{ role: "assistant", ts: TS, parts: [{ kind: "skill", skill }] }], ctx);
    expect(agent!.blocks[0]).toMatchObject({ type: "tool-call", name: "Skill", summary: "plan", skill });
    expect(agent!.blocks[1]).toMatchObject({ type: "tool-result", output: "" });
    const [user] = turnsToMessages([{ role: "user", ts: TS, parts: [{ kind: "skill", skill }] }], ctx);
    expect(user!.blocks[0]).toEqual({ type: "text", text: "plan", presentation: "skill" });
  });

  it("drops an empty turn and blank text", () => {
    const messages = turnsToMessages([
      { role: "assistant", ts: TS, parts: [] },
      { role: "user", ts: END, parts: [{ kind: "text", text: "  " }] },
    ], ctx);
    expect(messages).toHaveLength(0);
  });

  it("keeps ids while a turn grows at its end", () => {
    const parts: ConversationTurn["parts"] = [{ kind: "text", text: "a" }, { kind: "thinking", text: "t" }, tool("Read", "{}")];
    const before = turnsToMessages([{ role: "assistant", ts: TS, parts }], ctx);
    const after = turnsToMessages([{ role: "assistant", ts: TS, parts: [...parts, tool("Grep", "{}"), { kind: "text", text: "b" }] }], ctx);
    expect(after.slice(0, before.length).map((message) => message.id)).toEqual(before.map((message) => message.id));
    expect(before.at(-1)!.endsTurn).toBe(true);
  });

  it("numbers turns from firstTurnIndex and keeps ids unique when two turns share a time", () => {
    const messages = turnsToMessages([
      { role: "user", ts: TS, parts: [{ kind: "text", text: "one" }] },
      { role: "user", ts: TS, parts: [{ kind: "text", text: "two" }] },
      { role: "user", ts: null, parts: [{ kind: "text", text: "three" }] },
    ], { ...ctx, firstTurnIndex: -3 });
    expect(messages.map((message) => message.turnIndex)).toEqual([-3, -2, -1]);
    expect(messages.map((message) => message.id)).toEqual([`${TS}:user:0`, `${TS}:user:0#1`, "x-1:user:0"]);
    expect(messages[2]!.timestamp).toBeNull();
  });

  it("names an MCP tool by server and tool", () => {
    expect(mcpIdentity("mcp__plugin_vercel_vercel__authenticate")).toEqual({ server: "plugin_vercel_vercel", tool: "authenticate" });
    expect(mcpIdentity("Read")).toBeUndefined();
    const [message] = turnsToMessages([{ role: "assistant", ts: TS, parts: [tool("mcp__github__create_issue", "{}")] }], ctx);
    expect((message!.blocks[0] as NativeChatToolCallBlock).mcpIdentity).toEqual({ server: "github", tool: "create_issue" });
  });
});
