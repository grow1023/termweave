// TermWeave's own placement of item notes, after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
// src/renderer/src/components/native-chat/conversation/slots/native-chat-timed-rows.ts (rows placed by time).
import type { BotItem } from "../../bots/data.ts";
import type { ChatBotContext, ChatTimedRow, NativeChatMessage } from "../shared/index.ts";

/** The message a row at `at` follows: the last one with a time at or before it; before the first, the first. */
function anchorFor(messages: readonly NativeChatMessage[], at: number): string | null {
  let anchor: string | null = null;
  for (const message of messages) {
    if (message.timestamp !== null && message.timestamp <= at) anchor = message.id;
  }
  return anchor ?? messages[0]?.id ?? null;
}

function itemsOf(context: ChatBotContext & { items?: readonly BotItem[] }): readonly BotItem[] {
  return context.items ?? context.approvals;
}

/**
 * Each item comment as a timed row, oldest first. Decision: with no messages there is nothing to
 * place a row after, so none is returned; a comment without a valid time is left out.
 */
export function itemTimedRows(context: ChatBotContext & { items?: readonly BotItem[] }, messages: readonly NativeChatMessage[]): ChatTimedRow[] {
  if (messages.length === 0) return [];
  const rows = itemsOf(context).flatMap((item) =>
    item.comments.flatMap((comment, commentIndex): ChatTimedRow[] => {
      const at = Date.parse(comment.at);
      if (!Number.isFinite(at)) return [];
      const afterMessageId = anchorFor(messages, at);
      if (afterMessageId === null) return [];
      return [{ afterMessageId, key: `item-note:${item.botId}:${item.n}:${commentIndex}`, at, item, commentIndex }];
    }),
  );
  return [...rows].sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
