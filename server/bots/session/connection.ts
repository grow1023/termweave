/**
 * One live Claude Code session through the Agent SDK, with no terminal: one streaming-input `query()`
 * for the life of the connection (spec 1.2, 8.2). Frames go to the host unchanged; translation and
 * storage are journal.ts and translate.ts. The input queue follows Orca's
 * sdk-transport/claude-agent-sdk-user-message-queue.ts (MIT).
 */
import { spawn as nodeSpawn } from "node:child_process";
import type { UUID } from "node:crypto";

import type { BotEffort, BotModelOption } from "../../../shared/bots/chat.ts";

import type { CanUseTool, McpServerConfig, Options, PermissionMode, SDKControlInterruptResponse, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { BotError } from "../runtime.ts";
import { NO_ANSWER_MESSAGE, denyResult, permissionModeOptions, toPermissionRequest, type BotPermissionMode, type PermissionRequest, type PermissionResult, type SessionPermissionMode } from "./permission.ts";
import { CODE_MODE_ENV, createClaudeSpawner, killProcessGroup, loadClaudeAgentSdk, type ChildExit, type ClaudeChild, type SpawnDeps } from "./sdk.ts";

export interface ClaudeConnection {
  /** Claude's session id: the one given, for a new session and a resume alike */
  readonly sessionId: string;
  readonly pid: number | undefined;
  /** resolves once the SDK wrote the message to Claude's stdin */
  send(text: string, opts: { uuid: string; priority?: "now" }): Promise<void>;
  interrupt(): Promise<{ cancelled: boolean }>;
  setPermissionMode(mode: SessionPermissionMode): Promise<void>;
  /** null: Claude Code's default model */
  setModel(model: string | null): Promise<void>;
  /** null: the model's default effort */
  setEffort(effort: BotEffort | null): Promise<void>;
  /** the models this account can use, as Claude lists them */
  models(): Promise<BotModelOption[]>;
  /** ends the input, then stops the process group; resolves once no child is left */
  close(): Promise<void>;
  readonly exited: Promise<Error>;
}

export interface ClaudeLaunch {
  cwd: string;
  env: Record<string, string>;
  binary: string;
  sessionId: string;
  /** true: `--resume` an existing transcript; false: a new session under `sessionId` */
  resume: boolean;
  appendSystemPrompt: string;
  permissionMode: BotPermissionMode;
  mcpServers?: Record<string, McpServerConfig>;
  /** start in Claude Code's Code Mode (sdk.ts ownerCodeMode) */
  codeMode?: boolean;
  model?: string | null;
  effort?: BotEffort | null;
}

export interface ClaudeHandlers {
  onFrame(frame: Record<string, unknown>): void;
  /** null: nobody answers; the tool is denied with a message the model can act on */
  onPermission(request: PermissionRequest): Promise<PermissionResult | null>;
  /** once per connection; `expected` is true after close() */
  onExit(error: Error, expected: boolean): void;
}

/** The part of the SDK's `Query` a connection uses: a fake in tests. */
export interface QueryHandle extends AsyncIterable<SDKMessage> {
  interrupt(): Promise<SDKControlInterruptResponse | undefined>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  applyFlagSettings(settings: { effortLevel?: BotEffort | null }): Promise<void>;
  supportedModels(): Promise<{ value: string; displayName: string; description: string; supportedEffortLevels?: BotEffort[] }[]>;
}
export type QueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => QueryHandle;

export interface ConnectionTiming {
  /** after the input ends, how long Claude gets to exit by itself (it takes about 1.3 s) */
  closeGraceMs: number;
  /** after SIGTERM to the group, before SIGKILL */
  termGraceMs: number;
  /** after SIGKILL, and for the SDK iterator to finish */
  settleMs: number;
}

export interface ConnectionDeps extends SpawnDeps {
  loadSdk(): Promise<{ query: QueryFn }>;
  timing: ConnectionTiming;
}

export const DEFAULT_TIMING: ConnectionTiming = { closeGraceMs: 5_000, termGraceMs: 2_000, settleMs: 2_000 };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string): value is UUID => UUID_PATTERN.test(value);

interface Pending { message: SDKUserMessage; written(): void; failed(error: Error): void }

/**
 * User messages for the SDK's input iterable. A send resolves when the SDK pulls the next one,
 * which it does after it wrote this one; at the end, unwritten sends and the one in flight fail.
 */
export function createInbox(): { messages: AsyncIterable<SDKUserMessage>; push(message: SDKUserMessage): Promise<void>; end(): void } {
  let queue: readonly Pending[] = [];
  let inFlight: Pending | null = null;
  let ended = false;
  let wake: (() => void) | null = null;
  const failAll = (): void => {
    inFlight?.failed(new BotError("send_outcome_unknown", "the session ended while this message was being written"));
    inFlight = null;
    for (const pending of queue) pending.failed(new BotError("send_unwritten", "the session ended before this message was sent"));
    queue = [];
  };
  async function* messages(): AsyncGenerator<SDKUserMessage> {
    try {
      for (;;) {
        inFlight?.written();
        inFlight = null;
        const [next, ...rest] = queue;
        if (next !== undefined && !ended) {
          queue = rest;
          inFlight = next;
          yield next.message;
          continue;
        }
        if (ended) return;
        await new Promise<void>((resolve) => { wake = resolve; });
        wake = null;
      }
    } finally {
      failAll();
    }
  }
  return {
    messages: messages(),
    push(message) {
      if (ended) return Promise.reject(new BotError("session_closed", "this chat session has ended"));
      return new Promise<void>((written, failed) => {
        queue = [...queue, { message, written, failed }];
        wake?.();
      });
    },
    end() {
      if (ended) return;
      ended = true;
      wake?.();
      // the SDK may never pull again (a crashed child): nothing may wait on it
      failAll();
    },
  };
}

/** The options of spec 1.2. The SDK's bundled binary is never used: the owner's `claude` carries the login. */
export function buildQueryOptions(launch: ClaudeLaunch, hooks: { spawn: NonNullable<Options["spawnClaudeCodeProcess"]>; canUseTool: CanUseTool }): Options {
  return {
    cwd: launch.cwd,
    env: launch.env,
    pathToClaudeCodeExecutable: launch.binary,
    includePartialMessages: true,
    systemPrompt: { type: "preset", preset: "claude_code", ...(launch.appendSystemPrompt === "" ? {} : { append: launch.appendSystemPrompt }) },
    settingSources: ["user", "project", "local"],
    // Code Mode is taken from the SDK's settings option only, not from the environment
    ...(launch.codeMode ? { settings: { env: { [CODE_MODE_ENV]: "1" } } } : {}),
    // no request_user_dialog: TermWeave renders none
    supportedDialogKinds: [],
    // Claude echoes each user message when it takes it: the host learns a queued message started
    extraArgs: { "replay-user-messages": null },
    ...(launch.model ? { model: launch.model } : {}),
    ...(launch.effort ? { effort: launch.effort } : {}),
    ...permissionModeOptions(launch.permissionMode),
    ...(launch.mcpServers === undefined ? {} : { mcpServers: launch.mcpServers }),
    // --resume fails without a transcript; --session-id collides with an existing one
    ...(launch.resume ? { resume: launch.sessionId } : { sessionId: launch.sessionId }),
    spawnClaudeCodeProcess: hooks.spawn,
    canUseTool: hooks.canUseTool,
  };
}

/** Every request reaches the host; no answer, or a failing host, is a deny the model can read. */
export function routePermissions(onPermission: ClaudeHandlers["onPermission"]): CanUseTool {
  return async (toolName, input, options) => {
    const request = toPermissionRequest(toolName, input, options);
    let answer: PermissionResult | null = null;
    try {
      answer = await onPermission(request);
    } catch (error) {
      console.error(`bot session: permission handler failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (answer !== null) return answer;
    // a withdrawn request takes no response: null tells the SDK to write none
    if (options.signal.aborted) return null;
    return denyResult(request, NO_ANSWER_MESSAGE);
  };
}

async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer); }
}

/** End of input first; then SIGTERM, then SIGKILL, to the whole group. */
async function stopChild(child: ClaudeChild, timing: ConnectionTiming): Promise<void> {
  if (await within(child.exited, timing.closeGraceMs) !== undefined) return;
  child.killGroup("SIGTERM");
  if (await within(child.exited, timing.termGraceMs) !== undefined) return;
  child.killGroup("SIGKILL");
  await within(child.exited, timing.settleMs);
}

function exitError(exit: ChildExit | undefined, thrown: unknown): BotError {
  const reason = exit === undefined ? "did not exit"
    : exit.error !== null ? "could not start"
    : exit.signal !== null ? `stopped by ${exit.signal}`
    : `exited with code ${String(exit.code)}`;
  const error = new BotError("claude_exited", `Claude Code ${reason}`);
  // the SDK's own error stays reachable for a developer, out of the message a person sees
  if (thrown !== undefined) error.cause = thrown;
  return error;
}

export async function openClaudeConnection(launch: ClaudeLaunch, handlers: ClaudeHandlers, deps: Partial<ConnectionDeps> = {}): Promise<ClaudeConnection> {
  const timing = deps.timing ?? DEFAULT_TIMING;
  const { query } = await (deps.loadSdk ?? loadClaudeAgentSdk)();
  const spawner = createClaudeSpawner({ spawn: deps.spawn ?? nodeSpawn, killGroup: deps.killGroup ?? killProcessGroup });
  const inbox = createInbox();
  const q = query({ prompt: inbox.messages, options: buildQueryOptions(launch, { spawn: spawner.spawn, canUseTool: routePermissions(handlers.onPermission) }) });

  let closeRequested = false;
  let finished = false;
  let settleExited: (error: Error) => void = () => {};
  const exited = new Promise<Error>((resolve) => { settleExited = resolve; });

  const finish = async (thrown: unknown): Promise<void> => {
    if (finished) return;
    finished = true;
    inbox.end();
    const child = spawner.current();
    const exit = child === null ? undefined : await within(child.exited, timing.settleMs);
    // Claude's own children can outlive it: they belong to this session and go with it
    child?.killGroup("SIGTERM");
    const error = exitError(exit, thrown);
    settleExited(error);
    try { handlers.onExit(error, closeRequested); } catch (handlerError) {
      console.error(`bot session: exit handler failed: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`);
    }
  };

  const reader = (async () => {
    let thrown: unknown;
    try {
      for await (const frame of q) {
        try { handlers.onFrame(frame); } catch (error) {
          console.error(`bot session: frame handler failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      thrown = error;
    }
    await finish(thrown);
  })();

  let closing: Promise<void> | null = null;
  return {
    sessionId: launch.sessionId,
    get pid() { return spawner.current()?.pid; },
    exited,
    send(text, opts) {
      if (finished || closeRequested) return Promise.reject(new BotError("session_closed", "this chat session has ended"));
      if (!isUuid(opts.uuid)) return Promise.reject(new BotError("invalid_uuid", "a message id must be a UUID"));
      return inbox.push({
        type: "user",
        uuid: opts.uuid,
        message: { role: "user", content: text },
        parent_tool_use_id: null,
        session_id: launch.sessionId,
        // `now` ends the running step at once; its open turn carries on with this message
        ...(opts.priority === undefined ? {} : { priority: opts.priority }),
      });
    },
    async interrupt() {
      if (finished) return { cancelled: false };
      await q.interrupt();
      return { cancelled: true };
    },
    async setPermissionMode(mode) {
      if (finished) throw new BotError("session_closed", "this chat session has ended");
      await q.setPermissionMode(mode);
    },
    async setModel(model) {
      if (finished) throw new BotError("session_closed", "this chat session has ended");
      await q.setModel(model ?? undefined);
    },
    async setEffort(effort) {
      if (finished) throw new BotError("session_closed", "this chat session has ended");
      await q.applyFlagSettings({ effortLevel: effort });
    },
    async models() {
      if (finished) throw new BotError("session_closed", "this chat session has ended");
      return (await q.supportedModels()).map((model) => ({
        value: model.value, label: model.displayName, description: model.description,
        ...(model.supportedEffortLevels ? { efforts: model.supportedEffortLevels } : {}),
      }));
    },
    close() {
      closing ??= (async () => {
        closeRequested = true;
        inbox.end();
        const child = spawner.current();
        if (child !== null) await stopChild(child, timing);
        // an iterator that never ends (no child ever spawned) must not hold close open
        if (await within(reader, timing.settleMs) === undefined) await finish(undefined);
      })();
      return closing;
    },
  };
}
