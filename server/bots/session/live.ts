/**
 * One bot's chat while the server runs: its connection, the translator for that connection, the
 * prompts that wait on the owner, and the queue state. Memory only; the journal is the record.
 */
import type { BotChatStatus } from "../../../shared/bots/chat.ts";
import type { ClaudeConnection } from "./connection.ts";
import type { PermissionRequest, PermissionResult } from "./permission.ts";
import type { Translator, TranslatorClock } from "./translate.ts";

export interface WaitingPrompt {
  readonly request: PermissionRequest;
  /** settles the SDK's permission callback once; null: write no answer (the request is gone) */
  settle(result: PermissionResult | null): void;
}

export interface Live {
  readonly botId: string;
  /** the journal's session for this bot, not Claude's */
  readonly sessionId: string;
  conn: ClaudeConnection | null;
  opening: Promise<ClaudeConnection> | null;
  translator: Translator | null;
  /** bumped per connection: a late exit of an old one changes nothing */
  generation: number;
  prompts: ReadonlyMap<string, WaitingPrompt>;
  /** a message was sent and Claude has not started its turn yet */
  awaiting: boolean;
  /** Claude said `running` since that send: an `idle` after it means the send produced no turn */
  sawRunning: boolean;
  draining: boolean;
  lastUsed: number;
  idleTimer: unknown;
  status: BotChatStatus;
}

export function newLive(botId: string, sessionId: string, at: number): Live {
  return {
    botId, sessionId, conn: null, opening: null, translator: null, generation: 0, prompts: new Map(),
    awaiting: false, sawRunning: false, draining: false, lastUsed: at, idleTimer: null, status: "offline",
  };
}

/** A turn runs, or a sent message has not started its turn yet: the next message waits. */
export function busy(live: Live): boolean {
  return live.awaiting || (live.translator?.currentTurnId ?? null) !== null || live.prompts.size > 0;
}

/**
 * The chat status by Orca's lead-state rules (spec 4), from what this process holds: a prompt
 * from an ended process cannot be answered, so only live prompts count.
 */
export function liveStatus(live: Live | undefined): BotChatStatus {
  if (live === undefined || live.conn === null) return "offline";
  const prompts = [...live.prompts.values()];
  if (prompts.some((prompt) => prompt.request.toolName !== "AskUserQuestion")) return "blocked";
  if (prompts.length > 0) return "waiting";
  const state = live.translator?.liveState ?? null;
  if (busy(live) || state === "running" || state === "requires_action") return "working";
  return "done";
}

export const withPrompt = (prompts: ReadonlyMap<string, WaitingPrompt>, key: string, prompt: WaitingPrompt): ReadonlyMap<string, WaitingPrompt> =>
  new Map([...prompts, [key, prompt]]);

export const withoutPrompt = (prompts: ReadonlyMap<string, WaitingPrompt>, key: string): ReadonlyMap<string, WaitingPrompt> =>
  new Map([...prompts].filter(([other]) => other !== key));

export function clearIdle(live: Live, clock: TranslatorClock): void {
  if (live.idleTimer !== null) clock.clearTimer(live.idleTimer);
  live.idleTimer = null;
}
