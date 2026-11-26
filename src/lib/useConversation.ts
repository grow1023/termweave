// The conversation feed of one pane: the read loop, the paging and the scrollback fallback.
// Moved unchanged out of src/components/ChatView.tsx so the old chat and the Orca chat share it
// (SPEC-native-chat 5.2, risk 6: a behaviour fix lands here, never in either view).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";

import { ApiError } from "./api.ts";
import { useMachineApi } from "./machineContext.tsx";
import { statusEdgeRead } from "./status.ts";
import { toTranscriptMessages, type TranscriptMessage } from "./transcript.ts";
import type { AgentStatus, ConversationMetadata, ConversationTurn } from "../../shared/protocol.ts";

export const TRANSCRIPT_LINES = 400;
export const POLL_MS = 2000;

export interface ChatState {
  source: "conversation" | "scrollback";
  turns: ConversationTurn[];
  messages: TranscriptMessage[];
  truncated: boolean;
}

export const EMPTY_STATE: ChatState = { source: "conversation", turns: [], messages: [], truncated: false };

export interface UseConversationArgs {
  paneId: string;
  refreshKey: number;
  sentKey: number;
  agentStatus: AgentStatus | undefined;
  onMetadata?: (paneId: string, metadata: ConversationMetadata | null) => void;
  /** the page is visible: reads pause while it is hidden */
  visible: boolean;
  /** the transcript's scroller: an older page keeps the reader's place in it */
  scroller: RefObject<HTMLDivElement>;
  /** the reader is at the end: set back to true when the transcript is replaced */
  stickToBottom: MutableRefObject<boolean>;
  /** a pane switch: the view clears what it keeps beside the feed (the prompt) */
  onPaneChange?: () => void;
}

export function useConversation({ paneId, refreshKey, sentKey, agentStatus, onMetadata, visible, scroller, stickToBottom, onPaneChange }: UseConversationArgs) {
  const { fetchPaneConversation, fetchPaneTranscript } = useMachineApi();
  /** the answer last laid out: an unchanged poll (a 304) hands back this very object */
  const lastAnswer = useRef<unknown>(null);
  const [state, setState] = useState<ChatState>(EMPTY_STATE);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  /** scrolled up from the end: the way back is offered even when nothing new came */
  const [away, setAway] = useState(false);
  /** the first answer for this pane arrived (or failed): until then an empty chat is only loading */
  const [loaded, setLoaded] = useState(false);
  // turns the transcript holds on a path /tree walked away from: no page can reach them, so the
  // only way to say they exist is to be told, and to say it where the reader would look for them
  const [abandoned, setAbandoned] = useState<{ count: number; branches: number; summary: string | null } | null>(null);
  const signature = useRef("");
  // Older pages sit above the newest one. Once any shows, the newest page is
  // polled from its start at that moment, so the two always meet.
  const [older, setOlder] = useState<ConversationTurn[]>([]);
  /** the page before everything shown; null at the conversation's beginning, undefined when unknown */
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [olderState, setOlderState] = useState<"idle" | "loading" | "failed">("idle");
  const heldFrom = useRef<string | null>(null);
  const loadingOlder = useRef(false);
  /** bumped whenever the older pages are dropped: a load still in flight for them is ignored */
  const olderGeneration = useRef(0);
  const history = useRef<string | undefined>(undefined);
  const [historyId, setHistoryId] = useState<string | undefined>(undefined);
  const shownPane = useRef(paneId);
  const prepended = useRef<{ top: number; height: number } | null>(null);
  const [pollKey, setPollKey] = useState(0);
  /**
   * The assistant turn that was last when a message went out, with the turns it was read from.
   * It holds only while those turns are unchanged: once the transcript moves at all, the status
   * applies again (a slash command Claude logs as no user turn continues the very same turn).
   */
  const [sentOver, setSentOver] = useState<{ turn: ConversationTurn; page: ConversationTurn[] } | null>(null);
  /** the newest page as rendered: an earlier page loaded above it does not move the transcript */
  const heldPage = useRef<ConversationTurn[]>([]);
  const seenSent = useRef(sentKey);
  const seenStatus = useRef<{ pane: string; status: AgentStatus | undefined }>({ pane: paneId, status: agentStatus });

  const dropOlder = (): void => {
    olderGeneration.current += 1; loadingOlder.current = false;
    heldFrom.current = null; prepended.current = null; setOlder([]); setOlderCursor(undefined); setOlderState("idle");
  };

  useEffect(() => {
    shownPane.current = paneId;
    history.current = undefined; setHistoryId(undefined);
    stickToBottom.current = true; signature.current = ""; setState(EMPTY_STATE); setNewMessages(false); setAway(false); setLoaded(false); setError(null); setErrorStatus(null); onPaneChange?.(); setAbandoned(null);
    dropOlder();
    lastAnswer.current = null;
    setSentOver(null);
  }, [paneId]);

  useEffect(() => {
    if (seenSent.current === sentKey) return;
    seenSent.current = sentKey;
    // sent into a run (a queued message sent now): that turn is the one running, not one to finish
    const page = heldPage.current;
    const last = page[page.length - 1];
    setSentOver(last?.role === "assistant" && agentStatus !== "working" && agentStatus !== "blocked" ? { turn: last, page } : null);
  }, [sentKey, agentStatus]);

  // A turn starts or ends when the status enters or leaves `working`: read now, not at the next
  // poll. Bumping pollKey re-runs the read effect, whose cleanup cancels the loop that was
  // running (its answer is dropped, its timer cleared) before the single new loop starts.
  useEffect(() => {
    const seen = seenStatus.current;
    seenStatus.current = { pane: paneId, status: agentStatus };
    if (seen.pane === paneId && statusEdgeRead(seen.status, agentStatus)) setPollKey((key) => key + 1);
  }, [paneId, agentStatus]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let timer: number | undefined;
    /** The turns between the held start and where the newest page now starts, a page at a time; null when they cannot be joined. */
    const turnsBetween = async (held: string, start: string): Promise<ConversationTurn[] | null> => {
      const pages: ConversationTurn[][] = [];
      let before = start;
      try {
        for (let step = 0; step < 32 && before !== held; step++) {
          const page = await fetchPaneConversation(paneId, { before, since: held });
          if (typeof page.cursor !== "string") return null;
          pages.unshift(page.turns);
          before = page.cursor;
        }
      } catch {
        return null;
      }
      return before === held ? pages.flat() : null;
    };
    const read = async (): Promise<void> => {
      let generation = olderGeneration.current;
      try {
        let conversation;
        try {
          conversation = await fetchPaneConversation(paneId, heldFrom.current === null ? undefined : { from: heldFrom.current });
        } catch (cause) {
          // a new session or a Codex backtrack replaced the transcript the older pages came from
          if (heldFrom.current === null || !(cause instanceof ApiError) || cause.status !== 409) throw cause;
          if (cancelled || generation !== olderGeneration.current) return;
          dropOlder(); setState(EMPTY_STATE); signature.current = ""; lastAnswer.current = null;
          generation = olderGeneration.current;
          conversation = await fetchPaneConversation(paneId);
        }
        if (cancelled || generation !== olderGeneration.current) return;
        if (history.current !== conversation.history_id) {
          dropOlder(); generation = olderGeneration.current;
          history.current = conversation.history_id; setHistoryId(conversation.history_id);
          stickToBottom.current = true; setNewMessages(false); setAway(false);
        }
        // a 304 hands back the answer already shown: nothing to compare or lay out again
        if (conversation === lastAnswer.current) { setError(null); setErrorStatus(null); return; }
        // The newest page moved past the held start: the turns in between join the older
        // pages and the newest page is held from its new start, so no poll reads more than a page.
        const held = heldFrom.current;
        let moved: ConversationTurn[] = [];
        if (held !== null && conversation.source !== "scrollback" && typeof conversation.cursor === "string" && conversation.cursor !== held) {
          const between = await turnsBetween(held, conversation.cursor);
          if (cancelled || generation !== olderGeneration.current) return;
          if (between === null) {
            dropOlder(); setState(EMPTY_STATE); signature.current = ""; lastAnswer.current = null;
            setPollKey((key) => key + 1); return;
          }
          else { moved = between; heldFrom.current = conversation.cursor; }
        }
        if (moved.length > 0) setOlder((turns) => [...turns, ...moved]);
        if (heldFrom.current === null) setOlderCursor(conversation.source === "scrollback" ? undefined : conversation.cursor);
        onMetadata?.(paneId, conversation.source === "scrollback" ? null : conversation.metadata ?? null);
        setAbandoned(conversation.abandoned ?? null);
        let next: ChatState;
        if (conversation.source !== "scrollback") next = { source: "conversation", turns: conversation.turns, messages: [], truncated: false };
        else {
          const result = await fetchPaneTranscript(paneId, TRANSCRIPT_LINES);
          if (cancelled) return;
          next = { source: "scrollback", turns: [], messages: toTranscriptMessages(result.text).filter((message) => message.role !== "status"), truncated: result.truncated === true };
        }
        const nextSignature = JSON.stringify(next);
        if (nextSignature !== signature.current) {
          if (signature.current !== "" && !stickToBottom.current) setNewMessages(true);
          signature.current = nextSignature;
          setState(next);
        }
        setError(null); setErrorStatus(null); setLoaded(true);
        // only an answer laid out in full is skipped when it comes back unchanged: a read
        // cancelled mid-way (a pane switch, the page hidden during a gap fill) is redone
        lastAnswer.current = conversation;
      } catch (cause) {
        if (cancelled || generation !== olderGeneration.current) return;
        setLoaded(true);
        setError(cause instanceof Error ? cause.message : String(cause));
        setErrorStatus(cause instanceof ApiError ? cause.status : null);
      } finally {
        if (!cancelled) timer = window.setTimeout(() => void read(), POLL_MS);
      }
    };
    void read();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [paneId, refreshKey, onMetadata, pollKey, visible]);

  const loadOlder = useCallback(async (): Promise<void> => {
    const node = scroller.current;
    if (node === null || loadingOlder.current || typeof olderCursor !== "string") return;
    const before = olderCursor;
    const generation = olderGeneration.current;
    loadingOlder.current = true;
    setOlderState("loading");
    try {
      const page = await fetchPaneConversation(paneId, { before });
      if (shownPane.current !== paneId || olderGeneration.current !== generation) return;
      if (page.history_id !== history.current) {
        dropOlder(); setState(EMPTY_STATE); signature.current = ""; lastAnswer.current = null;
        setPollKey((key) => key + 1); return;
      }
      // a bridge without pages answers with its newest turns: nothing older to add
      if (page.source === "scrollback" || page.cursor === undefined) { setOlderCursor(undefined); setOlderState("idle"); return; }
      const first = heldFrom.current === null;
      heldFrom.current ??= before;
      prepended.current = { top: node.scrollTop, height: node.scrollHeight };
      setOlder((turns) => [...page.turns, ...turns]);
      setOlderCursor(page.cursor);
      setOlderState("idle");
      // the newest page may have slid since it was read: poll it from the held start now
      if (first) setPollKey((key) => key + 1);
    } catch (cause) {
      if (shownPane.current !== paneId || olderGeneration.current !== generation) return;
      if (cause instanceof ApiError && cause.status === 409) {
        dropOlder(); setState(EMPTY_STATE); signature.current = ""; lastAnswer.current = null;
        setPollKey((key) => key + 1);
      }
      else setOlderState("failed");
    } finally {
      if (olderGeneration.current === generation) loadingOlder.current = false;
    }
  }, [fetchPaneConversation, olderCursor, paneId]);

  // Older turns went in above the reader: keep the same turns under their eyes.
  useLayoutEffect(() => {
    const node = scroller.current;
    const anchor = prepended.current;
    if (node === null || anchor === null) return;
    prepended.current = null;
    node.scrollTop = anchor.top + (node.scrollHeight - anchor.height);
  }, [older]);

  heldPage.current = state.turns;

  return {
    state, error, errorStatus, newMessages, setNewMessages, away, setAway, loaded, abandoned,
    older, olderCursor, olderState, historyId, sentOver, loadOlder,
  };
}
