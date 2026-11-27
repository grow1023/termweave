// What Orca's bot screens read and call, on TermWeave's own server (server/bots/api.ts). The
// screens themselves are Orca's; this file stands where Orca's store and runtime RPC stood.
import type { BotChatStatus, BotEffort, BotModelOption, BotPermissionMode, JournalDirection, JournalPage, PromptAnswer, QueuedMessage } from "../../../shared/bots/chat.ts";
import type { Bot, BotAgent, BotAutomation, BotItem, BotRuntimeKind } from "../../../shared/bots/types.ts";
import { reloadBots } from "../../lib/bots.ts";
import type { Translate } from "../../lib/i18n.ts";

export { ACTIVE_WORKER, openLocalPane, reloadBots, useBotsView } from "../../lib/bots.ts";
export type { Bot, BotAgent, BotAutomation, BotItem, BotItemStatus, BotPaneAction, BotsView, BotWorker, BotWorkerStatus } from "../../../shared/bots/types.ts";
export { BOT_ITEM_OPEN } from "../../../shared/bots/types.ts";

/** A refusal from the bots API: the server's own text, and its code (server/bots/runtime.ts BotError). */
export class BotApiError extends Error {
  constructor(readonly code: string | null, message: string) { super(message); }
}

/**
 * The owner's words for a refusal. The server's text is English and written for the bot; the refusals
 * an owner meets on these screens get the owner's language. Any other one shows as it came.
 */
export function botErrorText(failure: unknown, t: Translate): string {
  const message = failure instanceof Error ? failure.message : String(failure);
  switch (failure instanceof BotApiError ? failure.code : null) {
    case "invalid_repo": return t("This folder is not a git repository.");
    case "name_taken": return t("Another bot has this name.");
    case "invalid_name": return t("A name is 1 to 40 letters, digits, spaces, dots, dashes or underscores.");
    case "already_answered":
    case "prompt_already_answered": return t("This was already answered.");
    case "prompt_gone": return t("The chat that asked this has ended. Ask the bot again.");
    case "note_too_long": return t("The text is too long (40,000 characters at most).");
    case "action_failed": return t("The terminal action failed: {why}", { why: message });
    case "read_only": return t("This device can only watch.");
    case "sessions_unavailable": return t("This server cannot run chat bots. Create the bot as a terminal bot, or start the app's server with chat sessions turned on.");
    default: return message;
  }
}

/** One call to the bots API: a refusal is a BotApiError, and every change reloads the shared view. */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/bots${path}`, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } };
  if (!response.ok) throw new BotApiError(result.error?.code ?? null, result.error?.message ?? String(response.status));
  if (method !== "GET") await reloadBots();
  return result;
}

export type BotNote = "soul" | "memory";

/** GET /api/bots/:id/chat (server/bots/session/host-types.ts ChatPage): a journal page, the chat status and the queue. */
export interface BotChatPage extends JournalPage {
  status: BotChatStatus;
  queued: QueuedMessage[];
}

/** `tail` and `before` page by ordinal; `after` catches up by sequence (shared/bots/chat.ts JournalPage). */
export interface BotChatPageQuery { direction: JournalDirection; cursor?: number; limit?: number }

/** POST /api/bots/:id/message on a session bot: taken now, or held until the running turn ends. */
export interface BotSendResult { clientMessageId: string; state: "accepted" | "queued" }

function chatQuery(page: BotChatPageQuery): string {
  const params = new URLSearchParams({ direction: page.direction });
  if (page.cursor !== undefined) params.set("cursor", String(page.cursor));
  if (page.limit !== undefined) params.set("limit", String(page.limit));
  return params.toString();
}

/** The body the prompts route reads: `{ optionId }`, `{ answers }` or `{ dismiss: true }` (server/bots/api.ts promptAnswer). */
function promptBody(answer: PromptAnswer): Record<string, unknown> {
  switch (answer.kind) {
    case "option": return { optionId: answer.optionId };
    case "answers": return { answers: answer.answers };
    case "dismiss": return { dismiss: true };
  }
}

export const botsApi = {
  /** `runtime` absent is a pane bot; `session` runs it with no terminal (Claude only) */
  create: (input: { name: string; agent: BotAgent; purpose: string; repo: string | null; runtime?: BotRuntimeKind }) => call<Bot>("POST", "", input),
  /** name, paused, repo, avatar (`mascot:<id>`) */
  update: (botId: string, change: Partial<Pick<Bot, "name" | "paused" | "repo" | "avatar">>) => call<Bot>("PATCH", `/${botId}`, change),
  /** its home folder, memory and worktrees stay on disk */
  remove: (botId: string) => call<unknown>("DELETE", `/${botId}`),
  /** starts the bot's chat if it is not running; answers the pane to open */
  open: (botId: string) => call<{ pane_id: string }>("POST", `/${botId}/open`),
  message: (botId: string, text: string) => call<unknown>("POST", `/${botId}/message`, { text }),
  /** the owner's answer to a needs-you item; an approval takes exactly "Approve" or "Deny" */
  answerItem: (botId: string, n: number, answer: string) => call<unknown>("POST", `/${botId}/items/${n}`, { answer }),
  /** done, canceled or planned (reopen), and/or a comment; the bot is told */
  ownerItem: (botId: string, n: number, change: { status?: "planned" | "done" | "canceled"; comment?: string }) => call<BotItem>("PATCH", `/${botId}/items/${n}`, change),
  /** schedule is five-field cron: minute hour day month weekday */
  addAutomation: (botId: string, input: { name: string; prompt: string; schedule: string; timezone: string; once: boolean }) => call<BotAutomation>("POST", `/${botId}/automations`, input),
  setAutomation: (botId: string, id: string, enabled: boolean) => call<BotAutomation>("PATCH", `/${botId}/automations/${id}`, { enabled }),
  removeAutomation: (botId: string, id: string) => call<unknown>("DELETE", `/${botId}/automations/${id}`),
  runAutomation: (botId: string, id: string) => call<unknown>("POST", `/${botId}/automations/${id}/run`),
  /** SOUL.md (who the bot is) or MEMORY.md (its notes) */
  readNote: async (botId: string, note: BotNote) => (await call<{ text: string }>("GET", `/${botId}/notes/${note}`)).text,
  writeNote: (botId: string, note: BotNote, text: string) => call<unknown>("PUT", `/${botId}/notes/${note}`, { text }),
  /** a session bot's chat: one journal page with its status and queue */
  chat: (botId: string, page: BotChatPageQuery) => call<BotChatPage>("GET", `/${botId}/chat?${chatQuery(page)}`),
  /** stops a session bot's running turn */
  stop: (botId: string) => call<{ cancelled: boolean }>("POST", `/${botId}/stop`),
  /** the owner's answer to an approval or question row; a second answer is refused (409, already answered) */
  answerPrompt: (botId: string, itemId: string, answer: PromptAnswer) => call<unknown>("POST", `/${botId}/prompts/${encodeURIComponent(itemId)}`, promptBody(answer)),
  /** a message into a session bot's chat; the id (a UUID) makes a retry the same message */
  sendMessage: (botId: string, text: string, clientMessageId?: string) =>
    call<BotSendResult>("POST", `/${botId}/message`, clientMessageId === undefined ? { text } : { text, clientMessageId }),
  /** pane to session needs the bot's terminal running; the server can refuse with its reason */
  setRuntime: (botId: string, runtime: BotRuntimeKind) => call<Bot>("PATCH", `/${botId}`, { runtime }),
  setPermissionMode: (botId: string, mode: BotPermissionMode) => call<Bot>("PATCH", `/${botId}`, { permissionMode: mode }),
  /** the models the bot can run on */
  models: async (botId: string) => (await call<{ models: BotModelOption[] }>("GET", `/${botId}/models`)).models,
  /** null: back to the default; the bots view is read again so the chip shows the new choice */
  setModel: async (botId: string, patch: { model?: string | null; effort?: BotEffort | null }) => { const bot = await call<Bot>("PATCH", `/${botId}`, patch); await reloadBots(); return bot; },
};
