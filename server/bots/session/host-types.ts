/** The session host's settings and what it needs from the server; session.ts is the host itself. */
import type { BotChatStatus, JournalPage, JournalRow, PromptRequest, QueuedMessage } from "../../../shared/bots/chat.ts";
import type { Bot } from "../../../shared/bots/types.ts";
import type { BotStore } from "../store.ts";
import type { ClaudeConnection, ClaudeHandlers, ClaudeLaunch } from "./connection.ts";
import type { BotJournal } from "./journal.ts";
import type { PermissionRequest } from "./permission.ts";
import type { TranslatorClock } from "./translate.ts";

export interface HostLimits {
  /** a session with no turn and no prompt closes after this long; it resumes on the next message */
  idleMs: number;
  /** live sessions at once: each is a `claude` process */
  maxLive: number;
  /** a prompt nobody answered is pushed once more after this long */
  repushMs: number;
  /** this many failed starts within `failWindowMs` stop the retries */
  failLimit: number;
  failWindowMs: number;
}

export const HOST_LIMITS: HostLimits = { idleMs: 20 * 60_000, maxLive: 4, repushMs: 30 * 60_000, failLimit: 2, failWindowMs: 60_000 };

export type OpenConnection = (launch: ClaudeLaunch, handlers: ClaudeHandlers) => Promise<ClaudeConnection>;

export interface SessionHostDeps {
  journal: BotJournal;
  store: BotStore;
  /** the environment agents start with (process.env in the server); buildClaudeEnv cleans it */
  env(): Promise<Readonly<Record<string, string | undefined>>>;
  /** rows written to a bot's chat, for the `bot-chat` push */
  changed(botId: string, rows: JournalRow[], status: BotChatStatus): void;
  /** a bot's chat status moved, for the `bots-changed` push */
  statusChanged(botId: string): void;
  notify(title: string, body: string, paneId: string | null, tag: string): Promise<void>;
  /** whether the bot's terminal still runs: one Claude session must never run in two places (R6) */
  paneLive(bot: Bot): Promise<boolean>;
  open?: OpenConnection;
  resolveBinary?: (env: Readonly<Record<string, string | undefined>>) => string;
  /** whether the owner's Claude Code starts in Code Mode (sdk.ts ownerCodeMode); a test passes its own */
  ownerCodeMode?: (env: Readonly<Record<string, string | undefined>>) => boolean;
  clock?: TranslatorClock;
  limits?: Partial<HostLimits>;
  /** more for a session's launch (its tools, settings files, readable folders, system prompt); a bot's host gives none */
  launch?(bot: Bot): Partial<ClaudeLaunch> | Promise<Partial<ClaudeLaunch>>;
  /** a say over each permission request before its card; a bot's host has none */
  gate?(bot: Bot, request: PermissionRequest): Promise<PromptGate | undefined>;
}

/** What a host's gate decides: refuse outright, or shape the card and hear of an approval. */
export interface PromptGate {
  /** refused with this message for the model; no card is shown */
  deny?: string;
  card?: PromptRequest["card"];
  /** the owner pressed Allow on this request's card */
  allowed?(): void;
}

export type SendState = "accepted" | "queued";

export interface ChatPage extends JournalPage {
  status: BotChatStatus;
  queued: QueuedMessage[];
}
