// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/transcript/turns/native-chat-turn-status.ts,
// src/shared/native-chat/transcript/folding/native-chat-user-message-fold.ts and
// src/shared/native-chat/transcript/messages/native-chat-message-time.ts; adapted for TermWeave.
// Pure helpers: no React.
import { isImageRefBlock, isTextBlock, isToolBlock, isToolCallBlock } from "../shared/index.ts";
import type { ChatTurnState, NativeChatMessage, NativeChatToolCallBlock } from "../shared/index.ts";

/** Near the end = within 48px (Orca's NATIVE_CHAT_BOTTOM_THRESHOLD_PX; TermWeave's ChatView uses the same). */
export const BOTTOM_THRESHOLD_PX = 48;
/** Scrolling this close to the top asks for the page before it (TermWeave's LOAD_OLDER_PX). */
export const LOAD_OLDER_PX = 400;

/**
 * Jump to latest: Orca's rule (native-chat-autoscroll.ts shouldShowJumpToLatest) offers it to a reader
 * who left the end with more than 48px below. TermWeave's change: more than one screen of the
 * transcript's own height must lie below. The pill floats over the transcript's lowest lines; in a
 * short transcript (a phone, or cards docked above the composer) those are the lines being read, and
 * less than a screen below is one flick away.
 */
export function jumpToLatestShown(stuckToBottom: boolean, geometry: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  if (stuckToBottom) return false;
  const below = Math.max(0, geometry.scrollHeight - geometry.clientHeight - geometry.scrollTop);
  return below > Math.max(BOTTOM_THRESHOLD_PX, geometry.clientHeight);
}

/** How long after a wheel, touch, key or pointer press a scroll counts as the reader's own. */
export const READER_GESTURE_MS = 1_000;

/**
 * Whether the transcript still follows its end after a scroll event. At the end it follows. Away from
 * the end it stops only when the reader moved it: a layout change (the composer resizing, a card
 * appearing over it) also moves the scroll position, and that must not read as the reader leaving.
 * Measured 2026-11-27: after a send the composer's resize left the view 96px short of the end, and the
 * rest of a long reply ran below the fold.
 */
export function followsEnd(atEnd: boolean, followed: boolean, sinceGestureMs: number): boolean {
  if (atEnd) return true;
  return followed && sinceGestureMs > READER_GESTURE_MS;
}

const MAX_UNFOLDED_LINES = 8;
const MAX_UNFOLDED_LENGTH = 600;

/** Decided from the text alone, so the row's first layout is already its folded one. */
export function userMessageFolds(text: string): boolean {
  return text.length > MAX_UNFOLDED_LENGTH || text.split("\n").length > MAX_UNFOLDED_LINES;
}

export function formatDuration(seconds: number): string {
  const totalSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ${remainingSeconds}s`;
}

/** The words of a message: its plain text blocks (not compaction or notice presentations), joined. */
export function messageMarkdown(message: NativeChatMessage): string {
  return message.blocks
    .filter(isTextBlock)
    .filter((block) => block.presentation === undefined)
    .map((block) => block.text)
    .join("\n\n");
}

/** TermWeave's TXT copy (ChatView.tsx `plainText`): markdown marks taken out. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, "$1")
    .replace(/(?:\*\*|__|~~|`)(.*?)(?:\*\*|__|~~|`)/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s?/gm, "");
}

export function hasImages(message: NativeChatMessage): boolean {
  return message.blocks.some(isImageRefBlock);
}

export function hasTools(message: NativeChatMessage): boolean {
  return message.blocks.some(isToolBlock);
}

/** The turn bar under a user message: the running clock, or how long the answer took. */
export type TurnBar = { kind: "active"; startedAt: number | null } | { kind: "settled"; workedSeconds: number };

/** What the rows of one message need from the messages around it. */
export interface RowSlot {
  message: NativeChatMessage;
  bar: TurnBar | null;
  /** The message belongs to the running turn. */
  activeTurn: boolean;
  /** The last message of the transcript (the live frontier). */
  trailing: boolean;
  /** The newest turn's answer: its controls stay visible; older ones show on hover. */
  latestResponse: boolean;
  /** The next message is the same turn's agent row: the rows sit closer (`-mb-3`). */
  continuesTurn: boolean;
}

function lastTurnIndex(messages: NativeChatMessage[]): number | null {
  return messages.at(-1)?.turnIndex ?? null;
}

function barFor(messages: NativeChatMessage[], index: number, turn: ChatTurnState, lastUser: number): TurnBar | null {
  const message = messages[index]!;
  if (message.role !== "user") return null;
  if (turn.working && index === lastUser) return { kind: "active", startedAt: turn.startedAt ?? message.timestamp };
  const next = messages.slice(index + 1);
  const nextUser = next.findIndex((other) => other.role === "user");
  const answer = (nextUser < 0 ? next : next.slice(0, nextUser)).filter((other) => other.endsTurn).at(-1);
  if (answer?.timestamp == null || message.timestamp === null || answer.timestamp < message.timestamp) return null;
  return { kind: "settled", workedSeconds: (answer.timestamp - message.timestamp) / 1000 };
}

/** One slot per message, in order. */
export function rowSlots(messages: NativeChatMessage[], turn: ChatTurnState): RowSlot[] {
  const lastUser = messages.map((message) => message.role).lastIndexOf("user");
  const lastTurn = lastTurnIndex(messages);
  const latestEnd = messages.map((message) => message.endsTurn).lastIndexOf(true);
  return messages.map((message, index) => {
    const next = messages[index + 1];
    const agentRow = (role: string | undefined) => role === "assistant" || role === "reasoning";
    return {
      message,
      bar: barFor(messages, index, turn, lastUser),
      activeTurn: turn.working && lastUser >= 0 ? index > lastUser : turn.working && message.turnIndex === lastTurn,
      trailing: index === messages.length - 1,
      latestResponse: index === latestEnd,
      continuesTurn: agentRow(message.role) && next !== undefined && agentRow(next.role) && next.turnIndex === message.turnIndex,
    };
  });
}

/** The newest TodoWrite call before each message, for the task list's diff. */
export function previousTodoWrites(messages: NativeChatMessage[]): Map<string, NativeChatToolCallBlock> {
  const found = new Map<string, NativeChatToolCallBlock>();
  let last: NativeChatToolCallBlock | undefined;
  for (const message of messages) {
    if (last) found.set(message.id, last);
    const own = message.blocks.filter(isToolCallBlock).filter((block) => block.name === "TodoWrite").at(-1);
    if (own) last = own;
  }
  return found;
}

// ---- time (Orca's native-chat-message-time.ts, trimmed) ----

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

export interface MessageTime { text: string; full: string; iso: string }

/** Today: the time. Yesterday: `yesterday(time)`. Else the date, with the year when it differs. */
export function formatMessageTime(timestamp: number, locale: string, now: Date, yesterday: (time: string) => string): MessageTime | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const time = new Intl.DateTimeFormat(locale, TIME).format(date);
  const full = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "long" }).format(date);
  const dayBefore = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const text = date.toDateString() === now.toDateString()
    ? time
    : date.toDateString() === dayBefore.toDateString()
      ? yesterday(time)
      : new Intl.DateTimeFormat(locale, { ...TIME, month: "short", day: "numeric", ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) }).format(date);
  return { text, full, iso: date.toISOString() };
}
