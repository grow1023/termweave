// TermWeave's own reader of a session bot's journal: the tail page, older pages, pushed rows from the
// `termweave:bot-chat` window event, and a catch-up poll. The merge rules are journal-merge.ts.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { BotChatStatus, JournalRow, QueuedMessage, Submission } from "../../../../shared/bots/chat.ts";
import type { ServerMessage } from "../../../../shared/protocol.ts";
import { usePageVisible } from "../../../lib/visibility.ts";
import { botsApi, type BotChatPage } from "../../bots/data.ts";
import type { ChatScrollBinding } from "../adapter/use-conversation-feed.ts";
import { EMPTY_JOURNAL, applyPage, applyPush, type JournalState } from "./journal-merge.ts";

/** The window event engineer SHELL dispatches from src/App.tsx; `detail` is the WebSocket message as received. */
export const BOT_CHAT_EVENT = "termweave:bot-chat";
type BotChatMessage = Extract<ServerMessage, { type: "bot-chat" }>;

// Decision: the push is the live path; this poll only closes a push the socket missed, so 5 s is enough.
const POLL_MS = 5_000;
const PAGE_LIMIT = 200;
/** `after` pages one catch-up may walk before it waits for the next push or poll */
const CATCH_UP_PAGES = 10;
/** a push that adds the owner's message or a turn changes the queue, which the push does not carry */
const QUEUE_REFRESH_MS = 300;

export interface SessionJournal {
  journal: JournalState;
  loaded: boolean;
  /** the last read failed; the rows already shown stay */
  error: string | null;
  status: BotChatStatus | null;
  queued: QueuedMessage[];
  submissions: Submission[];
  older: "idle" | "loading" | "failed";
  /** an older page was loaded and none is left: the reader is at the beginning */
  reachedStart: boolean;
  loadOlder: () => void;
  /** reads every change since the newest one held: after a send, an answer or a stop */
  catchUp: () => void;
}

const isBotChat = (value: unknown): value is BotChatMessage =>
  value !== null && typeof value === "object" && (value as { type?: unknown }).type === "bot-chat";

const errorText = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

const queueChanging = (rows: readonly JournalRow[]): boolean =>
  rows.some((row) => row.body.kind === "turn" || (row.body.kind === "message" && row.body.role === "user"));

/** Older pages keep the reader's place: the scroller moves by what was added above. */
function useOlderAnchor(scroll: ChatScrollBinding, rows: JournalState["rows"]) {
  const anchor = useRef<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = scroll.scroller.current;
    const held = anchor.current;
    anchor.current = null;
    if (node === null || held === null) return;
    node.scrollTop = held.top + (node.scrollHeight - held.height);
  }, [rows, scroll.scroller]);
  return useCallback(() => {
    const node = scroll.scroller.current;
    anchor.current = node === null ? null : { top: node.scrollTop, height: node.scrollHeight };
  }, [scroll.scroller]);
}

/** One session bot's journal, kept current. A new `botId` starts over. */
export function useSessionJournal(botId: string, scroll: ChatScrollBinding): SessionJournal {
  const visible = usePageVisible();
  const [journal, setJournal] = useState<JournalState>(EMPTY_JOURNAL);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BotChatStatus | null>(null);
  const [queued, setQueued] = useState<QueuedMessage[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [older, setOlder] = useState<"idle" | "loading" | "failed">("idle");
  const [reachedStart, setReachedStart] = useState(false);
  // the newest state for async work; every write goes through `commit`
  const state = useRef<JournalState>(EMPTY_JOURNAL);
  // bumped when the bot changes: an answer for the bot before is dropped
  const generation = useRef(0);
  const catching = useRef<{ running: boolean; again: boolean }>({ running: false, again: false });
  const holdPlace = useOlderAnchor(scroll, journal.rows);

  const commit = useCallback((next: JournalState) => { state.current = next; setJournal(next); }, []);
  const takeExtras = useCallback((page: BotChatPage) => {
    setStatus(page.status);
    setQueued(page.queued);
    setSubmissions(page.submissions);
    setError(null);
  }, []);

  const loadTail = useCallback(async (): Promise<void> => {
    const mine = generation.current;
    try {
      const page = await botsApi.chat(botId, { direction: "tail", limit: PAGE_LIMIT });
      if (mine !== generation.current) return;
      commit(applyPage(state.current, page).state);
      takeExtras(page);
      setReachedStart(false);
      setOlder("idle");
    } catch (cause) {
      if (mine === generation.current) setError(errorText(cause));
    } finally {
      if (mine === generation.current) setLoaded(true);
    }
  }, [botId, commit, takeExtras]);

  const walkAfter = useCallback(async (mine: number): Promise<void> => {
    for (let pages = 0; pages < CATCH_UP_PAGES; pages += 1) {
      const page = await botsApi.chat(botId, { direction: "after", cursor: state.current.head, limit: PAGE_LIMIT });
      if (mine !== generation.current) return;
      const result = applyPage(state.current, page);
      if (result.stale) { await loadTail(); return; }
      commit(result.state);
      takeExtras(page);
      if (!page.hasNewer) return;
    }
  }, [botId, commit, loadTail, takeExtras]);

  const catchUp = useCallback((): void => {
    // one catch-up at a time; a call while one runs asks for one more pass after it
    if (catching.current.running) { catching.current.again = true; return; }
    if (state.current.epoch === null) return;
    const mine = generation.current;
    catching.current = { running: true, again: false };
    void walkAfter(mine)
      .catch((cause: unknown) => { if (mine === generation.current) setError(errorText(cause)); })
      .finally(() => {
        if (mine !== generation.current) return;
        const again = catching.current.again;
        catching.current = { running: false, again: false };
        if (again) catchUp();
      });
  }, [walkAfter]);

  const loadOlder = useCallback((): void => {
    const cursor = state.current.olderCursor;
    if (cursor === null || older === "loading") return;
    const mine = generation.current;
    setOlder("loading");
    void botsApi.chat(botId, { direction: "before", cursor, limit: PAGE_LIMIT })
      .then(async (page) => {
        if (mine !== generation.current) return;
        const result = applyPage(state.current, page);
        if (result.stale) { await loadTail(); return; }
        holdPlace();
        commit(result.state);
        setOlder("idle");
        if (result.state.olderCursor === null) setReachedStart(true);
      })
      .catch(() => { if (mine === generation.current) setOlder("failed"); });
  }, [botId, commit, holdPlace, loadTail, older]);

  // a new bot: forget the old one's chat and read the new one's tail
  useEffect(() => {
    generation.current += 1;
    catching.current = { running: false, again: false };
    commit(EMPTY_JOURNAL);
    setLoaded(false); setError(null); setStatus(null); setQueued([]); setSubmissions([]); setOlder("idle"); setReachedStart(false);
    void loadTail();
  }, [botId, commit, loadTail]);

  usePushedRows(botId, { state, commit, setStatus, loadTail, catchUp });

  // the fallback poll, only while someone can see the tab; coming back catches up at once
  useEffect(() => {
    if (!visible || !loaded) return;
    catchUp();
    const timer = window.setInterval(catchUp, POLL_MS);
    return () => window.clearInterval(timer);
  }, [visible, loaded, catchUp]);

  return { journal, loaded, error, status, queued, submissions, older, reachedStart, loadOlder, catchUp };
}

interface PushDeps {
  state: { current: JournalState };
  commit: (next: JournalState) => void;
  setStatus: (status: BotChatStatus) => void;
  loadTail: () => Promise<void>;
  catchUp: () => void;
}

/** Rows the server pushes for this bot: merged at once; a new epoch reloads, a gap catches up. */
function usePushedRows(botId: string, deps: PushDeps): void {
  const latest = useRef(deps);
  latest.current = deps;
  useEffect(() => {
    let queueTimer: number | undefined;
    const onPush = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isBotChat(detail) || detail.bot_id !== botId) return;
      const { state, commit, setStatus, loadTail, catchUp } = latest.current;
      setStatus(detail.status);
      const result = applyPush(state.current, { epoch: detail.epoch, rows: detail.rows });
      // before the first page lands there is nothing to merge into; the page and a catch-up cover it
      if (state.current.epoch === null) return;
      commit(result.state);
      if (result.action === "reload") { void loadTail(); return; }
      if (result.action === "catch-up") { catchUp(); return; }
      if (queueChanging(detail.rows)) {
        window.clearTimeout(queueTimer);
        queueTimer = window.setTimeout(catchUp, QUEUE_REFRESH_MS);
      }
    };
    window.addEventListener(BOT_CHAT_EVENT, onPush);
    return () => { window.removeEventListener(BOT_CHAT_EVENT, onPush); window.clearTimeout(queueTimer); };
  }, [botId]);
}
