// TermWeave's own glue for the bot parts of the chat, after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
// src/renderer/src/components/native-chat/worker-approvals/worker-approval-card-model.ts; adapted for TermWeave.
// Orca reads its worker prompts over runtime RPC; TermWeave reads the bot's items and workers from useBotsView().
import { useMemo } from "react";

import { APPROVE, DENY } from "../../../../shared/bots/types.ts";
import type { Translate } from "../../../lib/i18n.ts";
import { ACTIVE_WORKER, useBotsView, type BotItem, type BotPaneAction, type BotWorker } from "../../bots/data.ts";
import { approvalQuestion } from "../../bots/homepanel/BotItemQuestionStep.tsx";
import { splitWhere, type PaneWhere } from "../../bots/homepanel/pane-where.ts";
import type { ChatApproval, ChatBotContext } from "../shared/index.ts";

export { approvalQuestion };

/** Which bot's chat: the bot in a terminal pane (a pane bot), or the bot itself (a session bot has no pane). */
export type ChatBotTarget = { paneId: string } | { botId: string };

/** An approval with the terminal it acts on, so the card can show the pane id as a tooltip (BOT-28). */
export type BotChatApproval = ChatApproval & { where?: PaneWhere };

/** The context of SPEC 5.1 plus what the shared type has no field for (see the report). */
export interface ChatBotView extends ChatBotContext {
  /** Every item of the bot: item notes are read from their comments. */
  items: BotItem[];
  /** needs_you items without `action`: a question with options and a typed answer. */
  questions: BotItem[];
}

// Decision: a finished worker stays in the dock for an hour so its outcome is seen; TermWeave has no Clear.
const FINISHED_SHOWN_MS = 60 * 60 * 1000;

function shownWorker(worker: BotWorker, now: number): boolean {
  if (ACTIVE_WORKER.has(worker.status)) return true;
  const ended = worker.endedAt ? Date.parse(worker.endedAt) : Number.NaN;
  return Number.isFinite(ended) && now - ended < FINISHED_SHOWN_MS;
}

/** The bot whose chat this is, with its waiting items and workers; null for a pane that is no bot's.
 *  A plain string is a pane id, as the first callers pass it. */
export function useChatBot(target: string | ChatBotTarget, readOnly: boolean): ChatBotView | null {
  const view = useBotsView();
  const by = typeof target === "string" ? "pane" : "botId" in target ? "bot" : "pane";
  const id = typeof target === "string" ? target : "botId" in target ? target.botId : target.paneId;
  return useMemo(() => {
    const bot = view?.bots.find((each) => (by === "bot" ? each.id === id : each.paneId === id));
    if (!view || !bot) return null;
    const now = Date.now();
    const items = view.items.filter((item) => item.botId === bot.id);
    const waiting = items.filter((item) => item.status === "needs_you");
    return {
      bot,
      approvals: waiting.filter((item) => Boolean(item.action)),
      questions: waiting.filter((item) => !item.action),
      items,
      workers: view.workers.filter((worker) => worker.botId === bot.id && shownWorker(worker, now)),
      readOnly,
    };
  }, [view, by, id, readOnly]);
}

/** The server's answer for each option index of `toChatApproval`: exactly "Approve" and "Deny". */
export const APPROVAL_ANSWERS: readonly string[] = [APPROVE, DENY];

/** An approval item as the shared card shape; `readOnly` gives it no options, so no buttons draw. */
export function toChatApproval(item: BotItem & { action: BotPaneAction }, readOnly: boolean, t: Translate): BotChatApproval {
  return {
    title: approvalQuestion(item.action, t),
    // the question already says what it does (BOT-28): the item line is only its number
    description: `#${item.n}`,
    where: splitWhere(item.action.where),
    ...(item.action.kind === "send" ? { detail: item.action.text } : {}),
    options: readOnly
      ? []
      : [
          { label: t("Approve"), description: null, index: 0 },
          { label: t("Deny"), description: null, index: 1 },
        ],
  };
}

export function hasAction(item: BotItem): item is BotItem & { action: BotPaneAction } {
  return Boolean(item.action);
}
