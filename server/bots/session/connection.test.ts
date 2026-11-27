import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";

import type { CanUseTool, Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildQueryOptions, openClaudeConnection, type ClaudeHandlers, type ClaudeLaunch, type ConnectionDeps, type QueryFn } from "./connection.ts";
import { NO_ANSWER_MESSAGE, allowOnce, type PermissionRequest } from "./permission.ts";

const SESSION = "11111111-2222-4333-8444-555555555555";
const UUID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const UUID_B = "aaaaaaaa-0000-4000-8000-000000000002";

const launch = (over: Partial<ClaudeLaunch> = {}): ClaudeLaunch => ({
  cwd: "/bots/b1", env: { PATH: "/usr/bin" }, binary: "/opt/claude", sessionId: SESSION, resume: false,
  appendSystemPrompt: "You are b1.", permissionMode: "ask", ...over,
});

class FakeChild extends EventEmitter {
  readonly pid = 777;
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  kill(): boolean { return true; }
  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

/** A stand-in for the SDK: spawns through the hook, reads the input, yields pushed frames until the child exits. */
function fakeSdk(behavior: { ignoreEndOfInput?: boolean; exitCodeOnEnd?: number; dieOn?: "SIGTERM" | "SIGKILL" } = {}) {
  const child = new FakeChild();
  const state = {
    child, options: null as Options | null, sent: [] as SDKUserMessage[], interrupts: 0, modes: [] as string[],
    signals: [] as string[], inputEnded: false,
    frames: [] as SDKMessage[], wake: null as (() => void) | null,
    push(frame: Record<string, unknown>) { state.frames = [...state.frames, frame as unknown as SDKMessage]; state.wake?.(); },
  };
  child.on("exit", () => state.wake?.());
  const query: QueryFn = ({ prompt, options }) => {
    state.options = options;
    options.spawnClaudeCodeProcess!({ command: "/opt/claude", args: [], cwd: options.cwd, env: options.env ?? {}, signal: new AbortController().signal });
    void (async () => {
      for await (const message of prompt) state.sent = [...state.sent, message];
      state.inputEnded = true;
      if (!behavior.ignoreEndOfInput) child.exit(behavior.exitCodeOnEnd ?? 0);
    })();
    async function* frames(): AsyncGenerator<SDKMessage> {
      for (;;) {
        const [next, ...rest] = state.frames;
        if (next !== undefined) { state.frames = rest; yield next; continue; }
        if (child.exitCode !== null || child.signalCode !== null) {
          if (child.exitCode !== 0) throw new Error(`Claude Code process exited with code ${String(child.exitCode)}`);
          return;
        }
        await new Promise<void>((resolve) => { state.wake = resolve; });
      }
    }
    return Object.assign(frames(), {
      interrupt: async () => { state.interrupts += 1; return { still_queued: [] }; },
      setPermissionMode: async (mode: string) => { state.modes = [...state.modes, mode]; },
      setModel: async () => {}, applyFlagSettings: async () => {}, supportedModels: async () => [],
    });
  };
  const deps: Partial<ConnectionDeps> = {
    loadSdk: async () => ({ query }),
    spawn: () => child as unknown as ChildProcess,
    killGroup: (_pid, signal) => {
      state.signals = [...state.signals, signal];
      if (signal === behavior.dieOn || signal === "SIGKILL") child.exit(null, signal);
    },
    timing: { closeGraceMs: 30, termGraceMs: 30, settleMs: 50 },
  };
  return { state, deps };
}

function recorder(onPermission: ClaudeHandlers["onPermission"] = async () => null) {
  const seen = { frames: [] as Array<Record<string, unknown>>, exits: [] as Array<{ error: Error; expected: boolean }> };
  const handlers: ClaudeHandlers = {
    onFrame: (frame) => { seen.frames = [...seen.frames, frame]; },
    onPermission,
    onExit: (error, expected) => { seen.exits = [...seen.exits, { error, expected }]; },
  };
  return { seen, handlers };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
const fakeCanUseOptions = (signal: AbortSignal): Parameters<CanUseTool>[2] => ({ signal, toolUseID: "tu1", requestId: "rq1", suggestions: [] });

describe("buildQueryOptions", () => {
  const hooks = { spawn: () => { throw new Error("unused"); }, canUseTool: async () => null };

  test("a new session names its id; streaming, replay, preset prompt with append, ask mode", () => {
    const options = buildQueryOptions(launch(), hooks);
    expect(options.sessionId).toBe(SESSION);
    expect(options.resume).toBeUndefined();
    expect(options.pathToClaudeCodeExecutable).toBe("/opt/claude");
    expect(options.cwd).toBe("/bots/b1");
    expect(options.includePartialMessages).toBe(true);
    expect(options.systemPrompt).toEqual({ type: "preset", preset: "claude_code", append: "You are b1." });
    expect(options.settingSources).toEqual(["user", "project", "local"]);
    expect(options.supportedDialogKinds).toEqual([]);
    expect(options.extraArgs).toEqual({ "replay-user-messages": null });
    expect(options.permissionMode).toBe("default");
  });

  test("a resume passes --resume and no session id; own mode and an empty append add nothing", () => {
    const options = buildQueryOptions(launch({ resume: true, permissionMode: "own", appendSystemPrompt: "" }), hooks);
    expect(options.resume).toBe(SESSION);
    expect(options.sessionId).toBeUndefined();
    expect("permissionMode" in options).toBe(false);
    expect(options.systemPrompt).toEqual({ type: "preset", preset: "claude_code" });
    expect(buildQueryOptions(launch({ permissionMode: "accept-edits" }), hooks).permissionMode).toBe("acceptEdits");
  });
});

describe("openClaudeConnection", () => {
  test("frames reach the host unchanged, in order", async () => {
    const { state, deps } = fakeSdk();
    const { seen, handlers } = recorder();
    const connection = await openClaudeConnection(launch(), handlers, deps);
    const init = { type: "system", subtype: "init", session_id: SESSION, tools: ["Read"] };
    const result = { type: "result", subtype: "success" };
    state.push(init);
    state.push(result);
    await tick();
    expect(seen.frames).toEqual([init, result]);
    expect(seen.frames[0]).toBe(init);
    expect(connection.pid).toBe(777);
    await connection.close();
  });

  test("sends are written in order with their uuid, and resolve once the SDK took them", async () => {
    const { state, deps } = fakeSdk();
    const connection = await openClaudeConnection(launch(), recorder().handlers, deps);
    await connection.send("first", { uuid: UUID_A });
    await connection.send("steer", { uuid: UUID_B, priority: "now" });
    expect(state.sent.map((message) => [message.uuid, message.message.content, message.priority])).toEqual([[UUID_A, "first", undefined], [UUID_B, "steer", "now"]]);
    expect(state.sent[0]?.session_id).toBe(SESSION);
    expect(state.sent[0]?.parent_tool_use_id).toBeNull();
    expect(connection.send("x", { uuid: "not-a-uuid" })).rejects.toMatchObject({ code: "invalid_uuid" });
    await connection.close();
    expect(connection.send("late", { uuid: UUID_A })).rejects.toMatchObject({ code: "session_closed" });
  });

  test("permissions go to the host; null denies with a message; a withdrawn request takes no response", async () => {
    let asked: PermissionRequest | null = null;
    const { state, deps } = fakeSdk();
    let answer: "allow" | "none" | "throw" = "allow";
    const { handlers } = recorder(async (request) => {
      asked = request;
      if (answer === "throw") throw new Error("host broke");
      return answer === "allow" ? allowOnce(request) : null;
    });
    const connection = await openClaudeConnection(launch(), handlers, deps);
    const canUseTool = state.options!.canUseTool!;
    const live = new AbortController().signal;
    expect(await canUseTool("Write", { file_path: "a" }, fakeCanUseOptions(live))).toEqual({ behavior: "allow", updatedInput: { file_path: "a" }, toolUseID: "tu1" });
    expect(asked!.requestId).toBe("rq1");
    answer = "none";
    expect(await canUseTool("Write", {}, fakeCanUseOptions(live))).toEqual({ behavior: "deny", message: NO_ANSWER_MESSAGE, toolUseID: "tu1" });
    answer = "throw";
    const errors = console.error;
    console.error = () => {};
    try { expect(await canUseTool("Write", {}, fakeCanUseOptions(live))).toMatchObject({ behavior: "deny" }); } finally { console.error = errors; }
    answer = "none";
    const withdrawn = new AbortController();
    withdrawn.abort();
    expect(await canUseTool("Write", {}, fakeCanUseOptions(withdrawn.signal))).toBeNull();
    await connection.close();
  });

  test("interrupt and setPermissionMode wrap the SDK calls", async () => {
    const { state, deps } = fakeSdk();
    const connection = await openClaudeConnection(launch(), recorder().handlers, deps);
    expect(await connection.interrupt()).toEqual({ cancelled: true });
    await connection.setPermissionMode("acceptEdits");
    expect(state.interrupts).toBe(1);
    expect(state.modes).toEqual(["acceptEdits"]);
    await connection.close();
    expect(await connection.interrupt()).toEqual({ cancelled: false });
  });

  test("after an interrupt, close ends with exit code 1 and an iterator throw: an expected exit", async () => {
    const { state, deps } = fakeSdk({ exitCodeOnEnd: 1 });
    const { seen, handlers } = recorder();
    const connection = await openClaudeConnection(launch(), handlers, deps);
    await connection.interrupt();
    await connection.close();
    expect(state.inputEnded).toBe(true);
    expect(state.signals).toEqual(["SIGTERM"]); // the leftover sweep after the root exited
    expect(seen.exits).toHaveLength(1);
    expect(seen.exits[0]?.expected).toBe(true);
    expect(seen.exits[0]?.error.message).toBe("Claude Code exited with code 1");
    expect(await connection.exited).toBe(seen.exits[0]!.error);
  });

  test("a child that exits by itself is an unexpected exit; pending sends fail", async () => {
    const { state, deps } = fakeSdk({ ignoreEndOfInput: true });
    const { seen, handlers } = recorder();
    const connection = await openClaudeConnection(launch(), handlers, deps);
    state.child.exit(null, "SIGSEGV");
    const error = await connection.exited;
    expect(error.message).toBe("Claude Code stopped by SIGSEGV");
    expect(seen.exits).toEqual([{ error, expected: false }]);
    expect(connection.send("x", { uuid: UUID_A })).rejects.toMatchObject({ code: "session_closed" });
    await connection.close();
    expect(seen.exits).toHaveLength(1);
  });

  test("close escalates to SIGTERM, then SIGKILL, for a child that ignores the end of input", async () => {
    const { state, deps } = fakeSdk({ ignoreEndOfInput: true });
    const { seen, handlers } = recorder();
    const connection = await openClaudeConnection(launch(), handlers, deps);
    await connection.close();
    expect(state.inputEnded).toBe(true);
    expect(state.signals.slice(0, 2)).toEqual(["SIGTERM", "SIGKILL"]);
    expect(state.child.signalCode).toBe("SIGKILL");
    expect(seen.exits).toHaveLength(1);
    expect(seen.exits[0]?.expected).toBe(true);
    await connection.close(); // a second close is the same close
    expect(seen.exits).toHaveLength(1);
  });

  test("a child that dies on SIGTERM gets no SIGKILL", async () => {
    const { state, deps } = fakeSdk({ ignoreEndOfInput: true, dieOn: "SIGTERM" });
    const connection = await openClaudeConnection(launch(), recorder().handlers, deps);
    await connection.close();
    expect(state.signals).not.toContain("SIGKILL");
    expect(state.child.signalCode).toBe("SIGTERM");
  });
});
