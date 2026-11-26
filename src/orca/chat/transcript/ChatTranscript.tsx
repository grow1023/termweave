// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/NativeChatTranscriptViewport.tsx,
// NativeChatTranscriptColumn.tsx and appearance/native-chat-appearance-style.ts (insets, column); adapted for TermWeave.
import { useMemo, type ReactNode } from "react";

import { AgentMark } from "../../../components/AgentMark.tsx";
import { Button } from "../../ui/button.tsx";
import { useT } from "../../../lib/i18n.ts";
import { Expandable, disclosureKey, useChatSlots, useDisclosure } from "../shared/index.ts";
import type { ChatFeed, ChatTimedRow, ChatTurnState, NativeChatMessage } from "../shared/index.ts";
import { LOCKED_ERROR, type ChatScrollBinding } from "../adapter/use-conversation-feed.ts";
import { ActivityLine } from "./ActivityLine.tsx";
import { JumpToLatest } from "./JumpToLatest.tsx";
import { OlderHistoryRow } from "./OlderHistoryRow.tsx";
import { TranscriptRow } from "./TranscriptRow.tsx";
import { messageMarkdown, previousTodoWrites, rowSlots } from "./transcript-model.ts";
import { useStickToBottom } from "./use-stick-to-bottom.ts";

const INSET_CLASS = "native-chat-transcript-inset pt-10 pb-[calc(var(--spacing)*5+var(--native-chat-worker-pill-room,0px))] px-3 sm:px-4";
const COLUMN_CLASS = "mx-auto flex w-full max-w-(--chat-content-max-width) flex-col gap-5 px-[5px]";
const STATE_CLASS = "text-sm text-chat-foreground-faint";

export interface ChatTranscriptProps {
  feed: ChatFeed;
  turn: ChatTurnState;
  agentName: string;
  timedRows?: ChatTimedRow[];
  renderTimedRow?: (row: ChatTimedRow) => ReactNode;
  loadFullOutput: (ref: string) => Promise<string>;
  /** "Show terminal output" in scrollback mode. */
  onShowTerminal?: () => void;
  /** Addition to SPEC 5.2: the same binding passed to `useConversationFeed`. */
  scroll: ChatScrollBinding;
}

/** The words of each assistant turn, keyed by turnIndex: Copy on the turn's last message copies them all. */
function turnWords(messages: NativeChatMessage[]): Map<number, string> {
  const words = new Map<number, string[]>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const text = messageMarkdown(message);
    if (text) words.set(message.turnIndex, [...(words.get(message.turnIndex) ?? []), text]);
  }
  return new Map([...words].map(([index, parts]) => [index, parts.join("\n\n")]));
}

function groupTimedRows(rows: ChatTimedRow[] | undefined, render: ((row: ChatTimedRow) => ReactNode) | undefined): Map<string, ReactNode[]> {
  if (!rows || !render) return new Map();
  const grouped = new Map<string, ReactNode[]>();
  for (const row of rows) grouped.set(row.afterMessageId, [...(grouped.get(row.afterMessageId) ?? []), render(row)]);
  return grouped;
}

/** TermWeave's "Conversation unavailable — show terminal output", in Orca's quiet type. */
function ScrollbackFallback({ feed, onShowTerminal }: { feed: ChatFeed; onShowTerminal?: () => void }) {
  const t = useT();
  const disclosure = useDisclosure(disclosureKey("scrollback", "terminal-output"), false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="xs" className="pointer-coarse:min-h-11" aria-expanded={disclosure.open} onClick={() => disclosure.setOpen(!disclosure.open)}>
          {t("Conversation unavailable — show terminal output")}
        </Button>
        {onShowTerminal ? (
          <Button variant="outline" size="xs" className="pointer-coarse:min-h-11" onClick={onShowTerminal}>{t("Open terminal")}</Button>
        ) : null}
      </div>
      <Expandable open={disclosure.open}>
        <pre className="scrollbar-sleek max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-chat-code-border bg-chat-code-surface p-3 font-mono text-xs text-chat-code">
          {feed.scrollback?.text ?? ""}
          {feed.scrollback?.truncated ? `\n${t("(earlier output cut)")}` : ""}
        </pre>
      </Expandable>
    </div>
  );
}

/** The top of what is shown: turns a `/tree` left behind, then the conversation's first turn reached by paging. */
function HistoryStart({ feed }: { feed: ChatFeed }) {
  const t = useT();
  const { Markdown } = useChatSlots();
  const abandoned = feed.abandoned;
  return (
    <>
      {abandoned && abandoned.count > 0 ? (
        <details className="rounded-md bg-chat-foreground/5 px-3 py-1.5 text-sm text-chat-foreground-faint">
          <summary className="cursor-pointer pointer-coarse:min-h-11">
            {abandoned.branches > 1
              ? abandoned.count === 1
                ? t("{n} earlier turn on {b} branches you navigated away from", { n: abandoned.count, b: abandoned.branches })
                : t("{n} earlier turns on {b} branches you navigated away from", { n: abandoned.count, b: abandoned.branches })
              : abandoned.count === 1
                ? t("{n} earlier turn on a branch you navigated away from", { n: abandoned.count, b: abandoned.branches })
                : t("{n} earlier turns on a branch you navigated away from", { n: abandoned.count, b: abandoned.branches })}
          </summary>
          {abandoned.summary !== null
            ? <Markdown content={abandoned.summary} tone="faint" className="mt-2" />
            : <p className="mt-2">{t("pi kept them in the session file but answers from the branch you chose. Use /tree in the terminal to go back.")}</p>}
        </details>
      ) : null}
      {feed.beginning ? <p className="text-center text-xs text-chat-foreground-faint">{t("beginning of conversation")}</p> : null}
    </>
  );
}

function EmptyState({ agentName }: { agentName: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <AgentMark agent={agentName} size={32} />
      <p className={STATE_CLASS}>{t("No conversation yet — say something below")}</p>
    </div>
  );
}

function Rows({ feed, turn, timedRows, renderTimedRow, loadFullOutput }: Omit<ChatTranscriptProps, "agentName" | "onShowTerminal" | "scroll">) {
  const messages = feed.messages;
  // While the turn runs, its trailing reasoning shows in the live line instead of a row.
  const liveReasoning = turn.working && messages.at(-1)?.role === "reasoning" ? messages.at(-1)! : null;
  const shown = useMemo(() => (liveReasoning ? messages.slice(0, -1) : messages), [messages, liveReasoning]);
  const slots = useMemo(() => rowSlots(shown, turn), [shown, turn]);
  const words = useMemo(() => turnWords(shown), [shown]);
  const todos = useMemo(() => previousTodoWrites(shown), [shown]);
  const timed = useMemo(() => groupTimedRows(timedRows, renderTimedRow), [timedRows, renderTimedRow]);
  return (
    <>
      {slots.map((slot) => (
        <TranscriptRow
          key={slot.message.id}
          slot={slot}
          turnMarkdown={slot.message.endsTurn ? (words.get(slot.message.turnIndex) ?? "") : ""}
          previousTodoWrite={todos.get(slot.message.id)}
          loadFullOutput={loadFullOutput}
          timedRows={timed.get(slot.message.id)}
        />
      ))}
      {turn.working ? <ActivityLine reasoning={liveReasoning ? { messageId: liveReasoning.id, markdown: messageMarkdown(liveReasoning) } : null} /> : null}
    </>
  );
}

/** The scroller, the older-history row, the rows, the live line, and Jump to latest. */
export function ChatTranscript(props: ChatTranscriptProps) {
  const t = useT();
  const { feed, turn, agentName, scroll } = props;
  const content = useMemo(() => [feed.messages, feed.status, turn.working], [feed.messages, feed.status, turn.working]);
  const { onScroll, showJump, jump } = useStickToBottom(scroll, feed, content);
  const error = feed.error === LOCKED_ERROR ? t("Locked — authenticate again") : feed.error;
  return (
    // TermWeave: the transcript keeps 40% of the chat column and never less than 160px, so the cards
    // docked above the composer can never squeeze the conversation to a strip (capped at 60% for a
    // very short window, where the composer needs its room too). 100cqh is ChatRoot's height.
    <div className="relative min-h-[min(max(160px,40cqh),60cqh)] flex-1">
      <div
        ref={scroll.scroller}
        onScroll={onScroll}
        data-native-chat-scroll
        aria-label={t("Conversation")}
        // Browser anchoring would add unattributed movement beside the follow policy's anchor.
        className="scrollbar-sleek relative h-full overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable_both-edges] focus-visible:outline-none"
      >
        <OlderHistoryRow older={feed.older} onRetry={feed.loadOlder} />
        <div className={INSET_CLASS}>
          <div data-native-chat-transcript-column className={COLUMN_CLASS}>
            <HistoryStart feed={feed} />
            {feed.status === "loading" ? <p role="status" className={STATE_CLASS}>{t("Loading conversation…")}</p> : null}
            {feed.status === "scrollback" ? <ScrollbackFallback feed={feed} onShowTerminal={props.onShowTerminal} /> : null}
            {feed.status === "empty" ? <EmptyState agentName={agentName} /> : null}
            {feed.status === "ready" ? <Rows {...props} /> : null}
            {error !== null ? <p role="alert" className="text-xs text-destructive [overflow-wrap:anywhere]">{error}</p> : null}
          </div>
        </div>
      </div>
      <JumpToLatest visible={showJump} onJump={jump} />
    </div>
  );
}
