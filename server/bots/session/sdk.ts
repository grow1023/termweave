/**
 * Loading the Claude Agent SDK, finding the user's own `claude`, the child's environment, and the
 * spawn the SDK runs it through. Follows Orca (src/main/claude/claude-stream-json-connection.ts,
 * child-process/claude-agent-sdk-process-spawn.ts, child-process/claude-child-process-environment.ts, MIT).
 * Nothing here prints an environment value.
 */
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions as NodeSpawnOptions } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import { BotError } from "../runtime.ts";

type ClaudeAgentSdk = typeof import("@anthropic-ai/claude-agent-sdk");
let sdk: Promise<ClaudeAgentSdk> | null = null;

/** Lazy, as Orca does: a missing package fails only the session path, and the SDK's module code runs only when a session opens. */
export function loadClaudeAgentSdk(): Promise<ClaudeAgentSdk> {
  sdk ??= import("@anthropic-ai/claude-agent-sdk").catch((error: unknown) => {
    sdk = null;
    throw new BotError("claude_sdk_missing", `the Claude Agent SDK could not be loaded; run \`bun install\` in TermWeave (${error instanceof Error ? error.name : "error"})`);
  });
  return sdk;
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The first executable file named `claude` on the PATH of `env`, through its symlinks. No shell:
 * on the owner's Mac `claude` in an interactive shell is a function, and the SDK's bundled binary is
 * not the one the owner logged in with. Relative PATH entries are skipped, as they depend on the cwd.
 */
export function resolveClaudeBinary(env: Readonly<Record<string, string | undefined>>): string {
  for (const dir of (env["PATH"] ?? "").split(delimiter)) {
    if (dir === "" || !isAbsolute(dir)) continue;
    const candidate = join(dir, "claude");
    if (isExecutableFile(candidate)) return realpathSync(candidate);
  }
  throw new BotError("claude_not_found", "Claude Code (`claude`) was not found on the PATH TermWeave starts agents with. Install Claude Code, or add the folder that holds `claude` to PATH in your login shell, then restart TermWeave.");
}

/** A launching Claude or Codex task's identity and messaging access do not belong to a bot (spec 1.4, 10). */
const PARENT_STAMPS = [
  "CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_BRIDGE_SESSION_ID",
  "CLAUDE_CODE_HOST_SESSION_ID", "CLAUDE_CODE_SESSION_ATTENDED", "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_EXECPATH", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_DESKTOP_APP_VERSION",
  "CLAUDE_EFFORT", "CLAUDE_PID", "CLAUDE_AGENT_SDK_VERSION", "CLAUDE_CODE_PLUGIN_DIRS", "CLAUDE_CODE_SSE_PORT",
  // the record picks the account, not an inherited value; see configDir
  "CLAUDE_CONFIG_DIR",
];

/** Ambient API auth. A non-interactive Claude bills even a key the user rejected; a bot runs on the TUI's login (spec R1). */
const AMBIENT_AUTH = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "AWS_BEARER_TOKEN_BEDROCK"];
const AUTH_HEADER = /(^|\n)\s*(authorization|x-api-key|proxy-authorization)\s*:/i;
const LOOPBACK = ["127.0.0.1", "localhost", "::1"];

export const CLAUDE_ENTRYPOINT = "termweave";

function stripped(name: string, value: string): boolean {
  if (PARENT_STAMPS.includes(name) || AMBIENT_AUTH.includes(name) || name.startsWith("CODEX_")) return true;
  return name === "ANTHROPIC_CUSTOM_HEADERS" && AUTH_HEADER.test(value);
}

/** tw-bot talks to this server on loopback: a proxy in the owner's environment must not carry it. */
function withLoopbackNoProxy(current: string | undefined): string {
  const hosts = (current ?? "").split(",").map((host) => host.trim()).filter((host) => host !== "");
  return [...hosts, ...LOOPBACK.filter((host) => !hosts.includes(host))].join(",");
}

/**
 * The child's environment: `base` without parent stamps and ambient auth, plus the session-state
 * frames the translator needs and TermWeave's entrypoint. `configDir` pins a non-default account only.
 */
export function buildClaudeEnv(input: { base: Readonly<Record<string, string | undefined>>; configDir?: string | null }): Record<string, string> {
  const kept = Object.entries(input.base).filter((entry): entry is [string, string] => entry[1] !== undefined && !stripped(entry[0], entry[1]));
  const env = Object.fromEntries(kept);
  const noProxy = withLoopbackNoProxy(env["NO_PROXY"] ?? env["no_proxy"]);
  return {
    ...env,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    ...(input.configDir ? { CLAUDE_CONFIG_DIR: input.configDir } : {}),
    // the turn translator relies on Claude's own idle frame when no result arrives
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1",
    CLAUDE_CODE_ENTRYPOINT: CLAUDE_ENTRYPOINT,
  };
}

export type SpawnFn = (command: string, args: readonly string[], options: NodeSpawnOptions) => ChildProcess;
export type KillGroupFn = (pid: number, signal: NodeJS.Signals) => void;

export interface SpawnDeps {
  spawn: SpawnFn;
  killGroup: KillGroupFn;
}

/** A group gone already (ESRCH) is the outcome we want. */
export const killProcessGroup: KillGroupFn = (pid, signal) => {
  try { process.kill(-pid, signal); } catch { /* no member left */ }
};

/** Groups still alive when the server exits: an abrupt exit must not leave a bot's `claude` running. */
const liveGroups = new Set<number>();
let exitHookInstalled = false;
function trackGroup(pid: number): void {
  liveGroups.add(pid);
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => { for (const group of liveGroups) killProcessGroup(group, "SIGKILL"); });
}

export interface ChildExit { code: number | null; signal: NodeJS.Signals | null; error: Error | null }

/** The one `claude` process a connection spawned. */
export interface ClaudeChild {
  readonly pid: number | undefined;
  readonly exited: Promise<ChildExit>;
  alive(): boolean;
  /** signals the whole group: Claude's own children (MCP servers, shells) go with it */
  killGroup(signal: NodeJS.Signals): void;
}

/**
 * The `spawnClaudeCodeProcess` hook. The child leads its own process group, so close can end the whole
 * tree. The SDK's abort signal is not handed to node: close does the stopping, with its own grace times.
 */
export function createClaudeSpawner(deps: SpawnDeps = { spawn: nodeSpawn, killGroup: killProcessGroup }): {
  spawn(options: SpawnOptions): SpawnedProcess;
  current(): ClaudeChild | null;
} {
  let child: ClaudeChild | null = null;
  return {
    current: () => child,
    spawn(options) {
      const proc = deps.spawn(options.command, options.args, { cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"], detached: true });
      // Claude writes progress to stderr; an undrained pipe would stall it
      proc.stderr?.resume();
      const pid = proc.pid;
      if (pid !== undefined) trackGroup(pid);
      let failed = false;
      const exited = new Promise<ChildExit>((settle) => {
        proc.once("exit", (code, signal) => settle({ code, signal, error: null }));
        proc.once("error", (error) => { failed = true; settle({ code: null, signal: null, error }); });
      });
      void exited.then(() => { if (pid !== undefined) liveGroups.delete(pid); });
      child = {
        pid,
        exited,
        alive: () => !failed && proc.exitCode === null && proc.signalCode === null,
        killGroup: (signal) => { if (pid !== undefined) deps.killGroup(pid, signal); },
      };
      if (proc.stdin === null || proc.stdout === null) throw new BotError("claude_spawn_failed", "Claude Code started without its pipes");
      // node types stdin and stdout as nullable; with stdio "pipe" they are set, checked above
      return proc as unknown as SpawnedProcess;
    },
  };
}
