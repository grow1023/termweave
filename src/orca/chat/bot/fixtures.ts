// Dev-only sample data for WP5 review screenshots (SPEC 5.0); TermWeave's own, shaped after stablyai/orca
// (MIT, Copyright (c) 2026 Lovecast Inc.) fixtures. Synthetic names only.
import type { Bot, BotItem, BotWorker } from "../../bots/data.ts";
import type { NativeChatMessage } from "../shared/index.ts";
import type { ChatBotView } from "./use-chat-bot.ts";

const AT = Date.parse("2026-11-27T09:00:00Z");
const iso = (minutes: number): string => new Date(AT + minutes * 60_000).toISOString();

export const fixtureBot: Bot = {
  id: "bot-demo", name: "Demo bot", agent: "claude", home: "/tmp/demo-bot", repo: null,
  paused: false, paneId: "pane-demo", createdAt: iso(-600), avatar: null, purpose: "A sample bot",
};

function item(n: number, over: Partial<BotItem>): BotItem {
  return {
    botId: fixtureBot.id, n, title: `Sample item ${n}`, doneMeans: null, status: "needs_you", ask: null,
    options: [], waitingOn: null, comments: [], action: null, createdAt: iso(n), updatedAt: iso(n), ...over,
  };
}

export const fixtureItems: BotItem[] = [
  item(1, { action: { kind: "send", paneId: "pane-x", where: "build terminal", text: "bun run build" }, ask: "ignored: wording comes from action" }),
  item(2, { action: { kind: "keys", paneId: "pane-y", where: "test terminal", keys: ["C-c"] } }),
  item(3, { action: { kind: "close", paneId: "pane-z", where: "old terminal" } }),
  item(4, { ask: "Which branch should the fix go to?", options: ["main", "release"] }),
  item(5, {
    status: "working",
    comments: [
      { at: iso(-30), by: "bot", text: "Started on the parser; the first test fails as expected." },
      { at: iso(5), by: "owner", text: "Keep the old flag working." },
    ],
  }),
];

function worker(id: string, status: BotWorker["status"], minutes: number): BotWorker {
  return {
    id, botId: fixtureBot.id, itemN: 5, agent: "claude", repo: "/tmp/repo", worktree: `/tmp/wt-${id}`,
    branch: `bot/${id}`, paneId: status === "done" ? null : `pane-${id}`, spec: `Task for ${id}\nmore detail`,
    status, result: status === "failed" ? "tests failed" : null, startedAt: iso(minutes),
    endedAt: status === "done" || status === "failed" ? iso(minutes + 5) : null,
  };
}

export const fixtureWorkers: BotWorker[] = [
  worker("w1", "working", -20), worker("w2", "blocked", -15), worker("w3", "failed", -40), worker("w4", "done", -50),
];

export const fixtureContext: ChatBotView = {
  bot: fixtureBot,
  approvals: fixtureItems.filter((each) => each.status === "needs_you" && each.action),
  questions: fixtureItems.filter((each) => each.status === "needs_you" && !each.action),
  items: fixtureItems,
  workers: fixtureWorkers,
  readOnly: false,
};

export const fixtureMessages: NativeChatMessage[] = [
  { id: "m1", role: "user", blocks: [{ type: "text", text: "Fix the parser" }], timestamp: AT - 60 * 60_000, source: "transcript", turnIndex: 0, endsTurn: false },
  { id: "m2", role: "assistant", blocks: [{ type: "text", text: "On it." }], timestamp: AT, source: "transcript", turnIndex: 1, endsTurn: true },
];
