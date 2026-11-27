import { afterEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions as NodeSpawnOptions } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { BotError } from "../runtime.ts";
import { buildClaudeEnv, CLAUDE_ENTRYPOINT, CLAUDE_SDK_ENTRYPOINT, codeModeResumeRefusal, createClaudeSpawner, ownerCodeMode, resolveClaudeBinary } from "./sdk.ts";
import { allowForSession, allowOnce, denyResult, permissionModeOptions, sdkPermissionMode, type PermissionRequest } from "./permission.ts";

let roots: string[] = [];
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots = []; });
function scratch(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tw-sdk-test-")));
  roots = [...roots, root];
  return root;
}
function executable(path: string): string {
  writeFileSync(path, "#!/bin/sh\n");
  chmodSync(path, 0o755);
  return path;
}

describe("resolveClaudeBinary", () => {
  test("takes the first executable named claude on PATH, through its symlink", () => {
    const root = scratch();
    for (const dir of ["a", "b", "c", "real"]) mkdirSync(join(root, dir));
    writeFileSync(join(root, "a", "claude"), "not executable");
    chmodSync(join(root, "a", "claude"), 0o644);
    mkdirSync(join(root, "b", "claude")); // a folder of that name is no binary
    const real = executable(join(root, "real", "claude-2.1"));
    symlinkSync(real, join(root, "c", "claude"));
    executable(join(root, "real", "claude"));
    const PATH = ["relative/bin", join(root, "a"), join(root, "b"), join(root, "c"), join(root, "real")].join(":");
    expect(resolveClaudeBinary({ PATH })).toBe(real);
  });

  test("a missing claude is a claude_not_found that names no PATH entry", () => {
    const root = scratch();
    const PATH = `${root}/secret-folder-name`;
    let caught: unknown;
    try { resolveClaudeBinary({ PATH }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(BotError);
    expect((caught as BotError).code).toBe("claude_not_found");
    expect((caught as BotError).message).not.toContain("secret-folder-name");
    expect(() => resolveClaudeBinary({})).toThrow(BotError);
  });
});

describe("Code Mode", () => {
  const settings = (env: Record<string, unknown>) => () => JSON.stringify({ env });
  test("on when the environment or the user settings turn it on", () => {
    expect(ownerCodeMode({ CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: "1" }, () => { throw new Error("not read"); })).toBe(true);
    expect(ownerCodeMode({ HOME: "/srv/owner" }, settings({ CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: "1" }))).toBe(true);
    expect(ownerCodeMode({ HOME: "/srv/owner" }, settings({ CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: true }))).toBe(true);
  });
  test("off without it, without a home, and when the settings cannot be read", () => {
    expect(ownerCodeMode({ HOME: "/srv/owner" }, settings({}))).toBe(false);
    expect(ownerCodeMode({ HOME: "/srv/owner" }, settings({ CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: "0" }))).toBe(false);
    expect(ownerCodeMode({}, settings({ CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: "1" }))).toBe(false);
    expect(ownerCodeMode({ HOME: "/srv/owner" }, () => { throw new Error("no file"); })).toBe(false);
    expect(ownerCodeMode({ HOME: "/srv/owner" }, () => "not json")).toBe(false);
  });
  test("the settings are read from the account's config folder when one is set", () => {
    let asked = "";
    ownerCodeMode({ HOME: "/srv/owner", CLAUDE_CONFIG_DIR: "/srv/acct" }, (path) => { asked = path; return "{}"; });
    expect(asked).toBe("/srv/acct/settings.json");
  });
  test("a session in Code Mode names itself an Agent SDK app; any other keeps TermWeave's name", () => {
    expect(buildClaudeEnv({ base: {}, codeMode: true })["CLAUDE_CODE_ENTRYPOINT"]).toBe(CLAUDE_SDK_ENTRYPOINT);
    expect(buildClaudeEnv({ base: {} })["CLAUDE_CODE_ENTRYPOINT"]).toBe(CLAUDE_ENTRYPOINT);
  });
  test("knows Claude's refusal to resume a Code Mode conversation", () => {
    expect(codeModeResumeRefusal("Failed to resume session: This session was started in Code Mode (experimental), which is off in this run")).toBe(true);
    expect(codeModeResumeRefusal("Failed to resume session: no conversation found")).toBe(false);
  });
});

describe("buildClaudeEnv", () => {
  const base = {
    PATH: "/usr/bin", HOME: "/h", KEEP_ME: "yes",
    CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "parent", CLAUDE_CODE_MESSAGING_TOKEN: "tok-value-123",
    CLAUDE_CODE_ENTRYPOINT: "cli", CLAUDE_CODE_PLUGIN_DIRS: "/p", CLAUDE_PID: "9", CLAUDE_CONFIG_DIR: "/inherited",
    CODEX_THREAD_ID: "x", ANTHROPIC_API_KEY: "sk-ant-secret-value", CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
    ANTHROPIC_CUSTOM_HEADERS: "Authorization: Bearer abc", NO_PROXY: "corp.example", UNSET: undefined,
  };

  test("strips parent stamps and ambient auth, adds session-state frames and the entrypoint", () => {
    const env = buildClaudeEnv({ base });
    for (const name of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_PLUGIN_DIRS", "CLAUDE_PID", "CLAUDE_CONFIG_DIR", "CODEX_THREAD_ID", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_CUSTOM_HEADERS", "UNSET"]) {
      expect(Object.keys(env)).not.toContain(name);
    }
    expect(env["KEEP_ME"]).toBe("yes");
    expect(env["PATH"]).toBe("/usr/bin");
    expect(env["CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS"]).toBe("1");
    expect(env["CLAUDE_CODE_ENTRYPOINT"]).toBe(CLAUDE_ENTRYPOINT);
    expect(env["NO_PROXY"]).toBe("corp.example,127.0.0.1,localhost,::1");
    expect(env["no_proxy"]).toBe(env["NO_PROXY"]);
  });

  test("keeps custom headers that carry no auth, and pins a given config dir only", () => {
    const env = buildClaudeEnv({ base: { ANTHROPIC_CUSTOM_HEADERS: "X-Trace: 1" }, configDir: "/acct" });
    expect(env["ANTHROPIC_CUSTOM_HEADERS"]).toBe("X-Trace: 1");
    expect(env["CLAUDE_CONFIG_DIR"]).toBe("/acct");
    expect(Object.keys(buildClaudeEnv({ base: {}, configDir: null }))).not.toContain("CLAUDE_CONFIG_DIR");
  });

  test("does not change its input", () => {
    const input = { ...base };
    buildClaudeEnv({ base: input });
    expect(input).toEqual(base);
  });
});

class FakeChild extends EventEmitter {
  readonly pid = 4242;
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  kill(): boolean { return true; }
}

describe("createClaudeSpawner", () => {
  test("spawns detached with pipes and the SDK's env, and signals the whole group", async () => {
    let seen: { command: string; args: readonly string[]; options: NodeSpawnOptions } | null = null;
    const fake = new FakeChild();
    const groups: Array<[number, string]> = [];
    const spawner = createClaudeSpawner({
      spawn: (command, args, options) => { seen = { command, args, options }; return fake as unknown as ChildProcess; },
      killGroup: (pid, signal) => { groups.push([pid, signal]); },
    });
    expect(spawner.current()).toBeNull();
    const proc = spawner.spawn({ command: "/bin/claude", args: ["--x"], cwd: "/w", env: { A: "1" }, signal: new AbortController().signal });
    expect(proc.stdin).toBe(fake.stdin);
    expect(seen!.options.detached).toBe(true);
    expect(seen!.options.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(seen!.options.env).toEqual({ A: "1" });
    const child = spawner.current()!;
    expect(child.pid).toBe(4242);
    expect(child.alive()).toBe(true);
    child.killGroup("SIGTERM");
    expect(groups).toEqual([[4242, "SIGTERM"]]);
    fake.exitCode = 0;
    fake.emit("exit", 0, null);
    expect(await child.exited).toEqual({ code: 0, signal: null, error: null });
    expect(child.alive()).toBe(false);
  });
});

describe("permission helpers", () => {
  const request: PermissionRequest = {
    toolName: "Write", input: { file_path: "a.txt" }, requestId: "r1", toolUseID: "t1", agentID: undefined,
    suggestions: [{ type: "addRules", rules: [{ toolName: "Write" }], behavior: "allow", destination: "localSettings" }],
    title: undefined, displayName: undefined, description: undefined, decisionReason: undefined, blockedPath: undefined,
    signal: new AbortController().signal,
  };

  test("modes map as in Orca; own leaves the user's default", () => {
    expect(permissionModeOptions("ask")).toEqual({ permissionMode: "default" });
    expect(permissionModeOptions("accept-edits")).toEqual({ permissionMode: "acceptEdits" });
    expect(permissionModeOptions("auto")).toEqual({ permissionMode: "auto" });
    expect(permissionModeOptions("own")).toEqual({});
    expect(sdkPermissionMode("own")).toBeNull();
  });

  test("allow for this session sends the suggestions back for the session only", () => {
    expect(allowOnce(request)).toEqual({ behavior: "allow", updatedInput: request.input, toolUseID: "t1" });
    const result = allowForSession(request);
    expect(result.behavior === "allow" && result.updatedPermissions).toEqual([{ type: "addRules", rules: [{ toolName: "Write" }], behavior: "allow", destination: "session" }]);
    expect(request.suggestions[0]?.destination).toBe("localSettings");
    expect(denyResult(request)).toEqual({ behavior: "deny", message: "User denied this action.", toolUseID: "t1" });
  });
});
