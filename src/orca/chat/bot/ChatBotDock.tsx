// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/subagents/NativeChatStructuredDock.tsx; adapted for TermWeave.
// The one entry the integrator mounts: the dock above the composer (worker pill and the cards that
// wait on the owner) and the item notes between messages. Each part draws nothing outside a bot pane.
import { useCallback, useMemo, type ReactNode } from "react";

import type { ChatTimedRow, NativeChatMessage } from "../shared/index.ts";
import { ItemNoteRow } from "./ItemNoteRow.tsx";
import { itemTimedRows } from "./item-timed-rows.ts";
import { useChatBot, type ChatBotTarget, type ChatBotView } from "./use-chat-bot.ts";
import { WorkerApprovals, type RenderApproval } from "./WorkerApprovals.tsx";
import { WorkerDock } from "./WorkerDock.tsx";
import { WorkerDockFrame } from "./WorkerDockFrame.tsx";

/** The dock above the composer: the worker pill floats over the transcript's end, the waiting cards
 *  stack under it. Hidden (by its own `:has` rule) while neither has anything to show. */
export function ChatBotDock({ context, renderApproval }: { context: ChatBotView | null; renderApproval?: RenderApproval }) {
  if (!context) return null;
  return (
    <WorkerDockFrame>
      <WorkerDock context={context} />
      <WorkerApprovals context={context} renderApproval={renderApproval} />
    </WorkerDockFrame>
  );
}

export interface ChatBotParts {
  /** null: this pane is not a bot's chat; every part below is then empty. */
  context: ChatBotView | null;
  /** Mount directly above the composer (and above the prompt card or queue). */
  dock: ReactNode;
  /** Pass to ChatTranscript's `timedRows`. */
  timedRows: ChatTimedRow[];
  /** Pass to ChatTranscript's `renderTimedRow`. */
  renderTimedRow: (row: ChatTimedRow) => ReactNode;
}

/** Everything the chat needs from the bot layer, in one call. The bot is found by its terminal pane
 *  (`paneId`, a pane bot's chat) or by its id (`botId`, a session bot's chat, which has no pane). */
export function useChatBotParts(args: ChatBotTarget & {
  readOnly: boolean;
  messages: readonly NativeChatMessage[];
  renderApproval?: RenderApproval;
}): ChatBotParts {
  const { readOnly, messages, renderApproval } = args;
  const context = useChatBot("botId" in args ? { botId: args.botId } : { paneId: args.paneId }, readOnly);
  const timedRows = useMemo(() => (context ? itemTimedRows(context, messages) : []), [context, messages]);
  const botName = context?.bot.name ?? "";
  const renderTimedRow = useCallback((row: ChatTimedRow) => <ItemNoteRow row={row} botName={botName} />, [botName]);
  const dock = context ? <ChatBotDock context={context} renderApproval={renderApproval} /> : null;
  return { context, dock, timedRows, renderTimedRow };
}
