// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/bots/bot-row-line.ts; adapted for TermWeave:
// the line kinds come from TermWeave's items, workers and the pane's agent status.
import type { SessionSnapshot } from "../../../../shared/protocol.ts";
import type { Bot, BotItem, BotsView, BotWorker } from "../data.ts";
import { ACTIVE_WORKER } from "../data.ts";
import type { BotChatStatus } from "../../../../shared/bots/chat.ts";
import type { Translate } from "../../../lib/i18n.ts";

type Pane = SessionSnapshot["panes"][number];

/** Everything one row reads about its bot. */
export interface BotFacts {
  bot: Bot;
  items: BotItem[];
  /** items that wait on the owner */
  needs: BotItem[];
  /** workers still at work whose pane is open */
  workers: BotWorker[];
  /** its chat runs */
  running: boolean;
  agentStatus: string | undefined;
  /** its chat is working now */
  working: boolean;
  /** it runs as a chat session with no terminal: its state is the server's chat status, never "not running" */
  session: boolean;
}

/** A session bot's chat status as the row reads it: working, waiting on the owner, or at rest. */
function sessionAgentStatus(status: BotChatStatus | undefined): string {
  if (status === "working") return "working";
  if (status === "waiting" || status === "blocked") return "blocked";
  return "idle";
}

export function botFacts(bot: Bot, view: BotsView, panes: readonly Pane[]): BotFacts {
  const alive = (paneId: string | null): paneId is string => paneId !== null && panes.some((pane) => pane.pane_id === paneId);
  const items = view.items.filter((item) => item.botId === bot.id);
  const session = bot.runtime === "session";
  // a session bot's chat is always there to talk to: it starts on the next message by itself
  const running = session || alive(bot.paneId);
  const agentStatus = session ? sessionAgentStatus(view.chatStatus?.[bot.id]) : panes.find((pane) => pane.pane_id === bot.paneId)?.agent_status;
  return {
    bot,
    items,
    needs: items.filter((item) => item.status === "needs_you"),
    workers: view.workers.filter((worker) => worker.botId === bot.id && ACTIVE_WORKER.has(worker.status) && alive(worker.paneId)),
    running,
    agentStatus,
    working: running && agentStatus === "working",
    session,
  };
}

/** The second line: its text and, when it has one, the time of what it says. */
export interface BotRowLine { text: string; at?: string; attention: boolean }

/** One line, the most urgent thing first; the time beside the name is that thing's age. */
export function botRowLine(facts: BotFacts, t: Translate): BotRowLine {
  const { bot, items, needs, running, agentStatus, working } = facts;
  const atWork = items.filter((item) => item.status === "working").at(-1);
  const waiting = items.filter((item) => item.status === "waiting").at(-1);
  // A paused bot's open question still waits on the owner: it is said before "Paused", or the owner forgets it.
  if (needs.length > 1) return { text: t("{n} questions wait for you", { n: needs.length }), at: needs.at(-1)!.updatedAt, attention: true };
  if (needs.length === 1) return { text: needs[0]!.title, at: needs[0]!.updatedAt, attention: true };
  if (bot.paused) return { text: t("Paused"), attention: false };
  if (running && agentStatus === "blocked") return { text: t("Waiting for you"), attention: true };
  if (atWork) return { text: atWork.title, at: atWork.updatedAt, attention: false };
  if (working) return { text: t("Working"), attention: false };
  if (waiting?.waitingOn) return { text: t("Waiting on: {what}", { what: waiting.waitingOn }), at: waiting.updatedAt, attention: false };
  if (bot.purpose) return { text: bot.purpose, attention: false };
  return { text: running ? (bot.agent === "claude" ? "Claude Code" : "Codex") : t("Starts on the next message"), attention: false };
}

/**
 * What sits on the picture's corner: the question mark, the moon (a terminal bot's chat is not
 * running, or a session bot is paused), or nothing.
 */
export type BotBadge = "needs-you" | "sleeping" | "paused" | null;

export function botBadge(facts: BotFacts, line: BotRowLine): BotBadge {
  if (facts.needs.length > 0) return "needs-you";
  if (facts.bot.paused) return facts.session ? "paused" : null;
  if (line.attention) return "needs-you";
  return facts.running ? null : "sleeping";
}

/** The most urgent child state of its workers: a blocked worker asks, any other one works. */
export function workerMark(workers: readonly BotWorker[]): "permission" | "working" | null {
  if (workers.some((worker) => worker.status === "blocked")) return "permission";
  return workers.length > 0 ? "working" : null;
}

/** 45s, 3m, 1h 05m: seconds only in the first minute, so the sidebar does not tick all day (BOT-30). */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** How often a worker's elapsed time is redrawn: every second in its first minute, then once a minute. */
export function elapsedTick(seconds: number): number {
  return seconds < 60 ? 1_000 : 60_000;
}

/** Needs the owner now: an open question (paused or not), or a running chat that waits on a prompt. */
export function botNeedsOwner(facts: BotFacts): boolean {
  return facts.needs.length > 0 || (!facts.bot.paused && facts.running && facts.agentStatus === "blocked");
}
