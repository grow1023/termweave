// TermWeave's own feed hook over the shared conversation reader (src/lib/useConversation.ts, moved out of
// src/components/ChatView.tsx); shaped as the chat contract after stablyai/orca (MIT, Copyright (c) 2026
// Lovecast Inc.), src/shared/native-chat/native-chat-types.ts.
import { useCallback, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";

import { useMachineId } from "../../../lib/machineContext.tsx";
import { useConversation } from "../../../lib/useConversation.ts";
import { usePageVisible } from "../../../lib/visibility.ts";
import type { AgentStatus, ConversationMetadata } from "../../../../shared/protocol.ts";
import type { ChatFeed, ChatFeedStatus, NativeChatMessage } from "../shared/index.ts";
import { turnsToMessages } from "./turns-to-messages.ts";

/**
 * The transcript's scroller and its "reader is at the end" flag. The feed needs both (an older page
 * keeps the reader's place; a replaced transcript sends the reader to the end), and so does the
 * transcript. Decision: the integrator makes one with `useChatScrollBinding()` and passes it to both.
 */
export interface ChatScrollBinding {
  scroller: RefObject<HTMLDivElement>;
  stickToBottom: MutableRefObject<boolean>;
}

export function useChatScrollBinding(): ChatScrollBinding {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  return useMemo(() => ({ scroller, stickToBottom }), []);
}

export interface UseConversationFeedArgs {
  paneId: string;
  refreshKey: number;
  sentKey: number;
  /** Kept for the SPEC signature; the reader does not depend on them (the view draws them). */
  connected: boolean;
  ended: boolean;
  /** Addition to SPEC 5.2: the reader reads at once when a turn starts or ends. */
  agentStatus?: AgentStatus;
  onMetadata?: (paneId: string, m: ConversationMetadata | null) => void;
  /** Addition to SPEC 5.2: see `ChatScrollBinding`. */
  scroll: ChatScrollBinding;
}

/** `ChatFeed.error` when the server asked to authenticate again; the transcript shows it translated. */
export const LOCKED_ERROR = "Locked — authenticate again";

/**
 * A message equal to the one shown under its id keeps that object, so memoized rows sit out a poll.
 * Decision: compared by JSON, as ChatView compares whole answers (`signature`).
 */
function keepUnchanged(previous: ReadonlyMap<string, { json: string; message: NativeChatMessage }>, next: NativeChatMessage[]) {
  const entries = next.map((message) => {
    const json = JSON.stringify(message);
    const old = previous.get(message.id);
    return { json, message: old !== undefined && old.json === json ? old.message : message };
  });
  return {
    messages: entries.map((entry) => entry.message),
    kept: new Map(entries.map((entry) => [entry.message.id, entry] as const)),
  };
}

function feedStatus(loaded: boolean, scrollback: boolean, count: number, error: string | null): ChatFeedStatus {
  if (!loaded) return "loading";
  if (scrollback) return "scrollback";
  if (count > 0) return "ready";
  return error !== null ? "error" : "empty";
}

/** One pane's conversation as chat messages, polled every 2s, with paging and the scrollback fallback. */
export function useConversationFeed(args: UseConversationFeedArgs): ChatFeed {
  const { paneId, refreshKey, sentKey, agentStatus, scroll } = args;
  const machineId = useMachineId();
  const visible = usePageVisible();
  const [metadata, setMetadata] = useState<ConversationMetadata | null>(null);
  // the reader's effect re-runs when onMetadata changes: keep one function for the feed's life
  const onMetadataRef = useRef(args.onMetadata);
  onMetadataRef.current = args.onMetadata;
  const onMetadata = useCallback((pane: string, next: ConversationMetadata | null) => {
    setMetadata(next);
    onMetadataRef.current?.(pane, next);
  }, []);
  const conversation = useConversation({
    paneId, refreshKey, sentKey, agentStatus, onMetadata, visible,
    scroller: scroll.scroller, stickToBottom: scroll.stickToBottom,
  });
  const { state, older, olderCursor, olderState, loadOlder, loaded, error, errorStatus, historyId, abandoned } = conversation;
  const kept = useRef<ReadonlyMap<string, { json: string; message: NativeChatMessage }>>(new Map());
  const messages = useMemo(() => {
    const next = turnsToMessages(older.length > 0 ? [...older, ...state.turns] : state.turns, { paneId, machineId, firstTurnIndex: -older.length });
    const stable = keepUnchanged(kept.current, next);
    kept.current = stable.kept;
    return stable.messages;
  }, [older, state.turns, paneId, machineId]);
  const scrollback = useMemo(
    () => (state.source === "scrollback" ? { text: state.messages.map((message) => message.text).join("\n\n"), truncated: state.truncated } : null),
    [state],
  );
  const load = useCallback(() => void loadOlder(), [loadOlder]);
  const shownError = errorStatus === 401 ? LOCKED_ERROR : error;
  return useMemo<ChatFeed>(() => ({
    status: feedStatus(loaded, state.source === "scrollback", messages.length, error),
    messages,
    scrollback,
    error: shownError,
    older: state.source === "conversation" && typeof olderCursor === "string" ? olderState : "none",
    loadOlder: load,
    metadata: state.source === "scrollback" ? null : metadata,
    historyId: historyId ?? null,
    beginning: state.source === "conversation" && olderCursor === null && older.length > 0,
    abandoned: state.source === "conversation" ? abandoned : null,
  }), [loaded, state.source, messages, error, scrollback, shownError, olderCursor, olderState, load, metadata, historyId, older.length, abandoned]);
}
