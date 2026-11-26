// TermWeave's own feed hook for a session bot: the journal (use-session-journal.ts) as the chat
// contract shaped after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
// src/shared/native-chat/native-chat-types.ts, plus the bot's status, prompts, queue and actions.
import { useCallback, useMemo, useRef, useState } from "react";

import type { BotChatStatus, JournalApproval, JournalQuestion, JournalRow, PromptAnswer } from "../../../../shared/bots/chat.ts";
import { useT } from "../../../lib/i18n.ts";
import { botErrorText, botsApi } from "../../bots/data.ts";
import type { ChatScrollBinding } from "../adapter/use-conversation-feed.ts";
import type { ChatFeed, ChatFeedStatus, NativeChatMessage } from "../shared/index.ts";
import { queueEntries, type QueueEntry } from "./queue-entries.ts";
import { currentHold, pendingPromptRows, rowsToMessages, type ChatHold } from "./rows-to-messages.ts";
import { useSessionJournal } from "./use-session-journal.ts";

export type SessionPromptRow = JournalRow & { body: JournalApproval | JournalQuestion };

export interface SessionFeed {
  feed: ChatFeed;
  /** null until the first page; `offline` means the session is closed and starts on the next message */
  status: BotChatStatus | null;
  /** approval and question rows waiting for the owner, oldest first */
  prompts: SessionPromptRow[];
  /** why the bot is not answering (a waiting slot, a stop after failed starts), when that still stands */
  hold: ChatHold | null;
  /** the owner's messages not in the chat yet, with their state */
  queue: QueueEntry[];
  /** true: sent (clear the box); a string: refused, keep the text and show why (the composer's contract) */
  send: (text: string) => Promise<true | string>;
  stop: () => void;
  stopping: boolean;
  /** why the last Stop failed */
  stopError: string | null;
  /** throws the refusal, in the owner's words, for the card to show */
  answer: (itemId: string, answer: PromptAnswer) => Promise<void>;
}

/** A message equal to the one shown under its id keeps that object, so memoized rows sit out a push. */
function useStableMessages(messages: NativeChatMessage[]): NativeChatMessage[] {
  const kept = useRef<ReadonlyMap<string, { json: string; message: NativeChatMessage }>>(new Map());
  return useMemo(() => {
    const entries = messages.map((message) => {
      const json = JSON.stringify(message);
      const old = kept.current.get(message.id);
      return { json, message: old !== undefined && old.json === json ? old.message : message };
    });
    kept.current = new Map(entries.map((entry) => [entry.message.id, entry] as const));
    return entries.map((entry) => entry.message);
  }, [messages]);
}

function feedStatus(loaded: boolean, count: number, error: string | null): ChatFeedStatus {
  if (!loaded) return "loading";
  if (count > 0) return "ready";
  return error !== null ? "error" : "empty";
}

/** Sends, with the request in flight listed until it answers; a refusal comes back as the composer's note. */
function useSend(botId: string, catchUp: () => void) {
  const t = useT();
  const [sending, setSending] = useState<ReadonlyMap<string, string>>(new Map());
  const send = useCallback(async (text: string): Promise<true | string> => {
    const id = crypto.randomUUID();
    setSending((current) => new Map([...current, [id, text]]));
    try {
      await botsApi.sendMessage(botId, text, id);
      return true;
    } catch (cause) {
      return botErrorText(cause, t);
    } finally {
      setSending((current) => new Map([...current].filter(([key]) => key !== id)));
      catchUp();
    }
  }, [botId, catchUp, t]);
  return { sending, send };
}

function useStop(botId: string, catchUp: () => void) {
  const t = useT();
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const stop = useCallback((): void => {
    if (stopping) return;
    setStopping(true);
    setStopError(null);
    void botsApi.stop(botId)
      .catch((cause: unknown) => setStopError(botErrorText(cause, t)))
      .finally(() => { setStopping(false); catchUp(); });
  }, [botId, catchUp, stopping, t]);
  return { stop, stopping, stopError };
}

/** One session bot's chat: the feed for ChatTranscript, and everything around it. */
export function useSessionFeed(botId: string, scroll: ChatScrollBinding): SessionFeed {
  const t = useT();
  const reader = useSessionJournal(botId, scroll);
  const { journal, loaded, error, catchUp } = reader;
  const messages = useStableMessages(useMemo(() => rowsToMessages(journal.rows.values(), t), [journal.rows, t]));
  const prompts = useMemo(() => pendingPromptRows(journal.rows.values()), [journal.rows]);
  const hold = useMemo(() => currentHold(journal.rows.values()), [journal.rows]);
  const { sending, send } = useSend(botId, catchUp);
  const { stop, stopping, stopError } = useStop(botId, catchUp);
  const queue = useMemo(
    () => queueEntries({ queued: reader.queued, submissions: reader.submissions, sending, rows: journal.rows, now: Date.now() }),
    [reader.queued, reader.submissions, sending, journal.rows],
  );
  const answer = useCallback(async (itemId: string, given: PromptAnswer): Promise<void> => {
    try {
      await botsApi.answerPrompt(botId, itemId, given);
    } catch (cause) {
      throw new Error(botErrorText(cause, t));
    } finally {
      catchUp();
    }
  }, [botId, catchUp, t]);
  const { loadOlder, older, reachedStart } = reader;
  const feed = useMemo<ChatFeed>(() => ({
    status: feedStatus(loaded, messages.length, error),
    messages,
    scrollback: null,
    error,
    older: journal.olderCursor === null ? "none" : older,
    loadOlder,
    metadata: null,
    historyId: journal.epoch,
    beginning: reachedStart && messages.length > 0,
    abandoned: null,
  }), [loaded, messages, error, journal.olderCursor, journal.epoch, older, loadOlder, reachedStart]);
  return { feed, status: reader.status, prompts, hold, queue, send, stop, stopping, stopError, answer };
}
