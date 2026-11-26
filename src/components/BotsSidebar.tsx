// The row is adapted from stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), BotSidebarRow.tsx
// and BotRow.tsx: picture with a corner badge, name and age, one line of what the bot is at, and a
// fold strip over its running workers.
import { useState } from "react";
import { ChevronDown, Plus, Settings } from "lucide-react";

import type { SessionSnapshot } from "../../shared/protocol.ts";
import type { Bot, BotsView } from "../../shared/bots/types.ts";
import { ACTIVE_WORKER } from "../lib/bots.ts";
import { useT } from "../lib/i18n.ts";
import { BotAvatar, BotItemStatusIcon, BotSpinner, botAge, type BotBadge } from "./BotVisuals.tsx";

interface Props {
  view: BotsView;
  /** this PC's own session: the bots' panes and their agent status */
  snapshot: SessionSnapshot | null;
  selectedPaneId: string | null;
  onOpenPane: (paneId: string) => void;
  /** the bots page, on this bot, or on New bot with null */
  onManage: (botId: string | null) => void;
}

const FOLDED_KEY = "termweave.bots.folded";
function readFolded(): string[] {
  try { const value = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]") as unknown; return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}

/** The bots group at the top of the sidebar: each bot opens its chat, its running workers sit under it. */
export function BotsSidebar({ view, snapshot, selectedPaneId, onOpenPane, onManage }: Props) {
  const t = useT();
  const [failed, setFailed] = useState<string | null>(null);
  const [folded, setFolded] = useState<string[]>(readFolded);
  const panes = snapshot?.panes ?? [];
  const alive = (paneId: string | null): paneId is string => paneId !== null && panes.some((pane) => pane.pane_id === paneId);
  const toggleFold = (botId: string): void => {
    const next = folded.includes(botId) ? folded.filter((id) => id !== botId) : [...folded, botId];
    setFolded(next);
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify(next)); } catch { /* the fold lasts this visit */ }
  };
  const openChat = async (bot: Bot): Promise<void> => {
    if (alive(bot.paneId)) { onOpenPane(bot.paneId); return; }
    setFailed(null);
    try {
      const response = await fetch(`/api/bots/${bot.id}/open`, { method: "POST", cache: "no-store" });
      const result = await response.json().catch(() => ({})) as { pane_id?: string; error?: { message?: string } };
      if (!response.ok || !result.pane_id) throw new Error(result.error?.message ?? String(response.status));
      onOpenPane(result.pane_id);
    } catch (error) { setFailed(error instanceof Error ? error.message : String(error)); }
  };

  return <section className="bots-sidebar" aria-label={t("Bots")}>
    <header className="bots-sidebar-header">
      <span className="bots-sidebar-heading">{t("Bots")}</span>
      <button type="button" className="sidebar-row-action" aria-label={t("New bot")} title={t("New bot")} onClick={() => onManage(null)}><Plus aria-hidden="true" /></button>
    </header>
    {view.bots.length === 0 && <button type="button" className="bots-sidebar-empty ko-text" onClick={() => onManage(null)}>{t("No bots yet. Make one that takes jobs from its chat.")}</button>}
    <ul className="bots-sidebar-list">
      {view.bots.map((bot) => {
        const items = view.items.filter((item) => item.botId === bot.id);
        const needs = items.filter((item) => item.status === "needs_you");
        const workers = view.workers.filter((worker) => worker.botId === bot.id && ACTIVE_WORKER.has(worker.status) && alive(worker.paneId));
        const running = alive(bot.paneId);
        const status = panes.find((pane) => pane.pane_id === bot.paneId)?.agent_status;
        const working = running && status === "working";
        const atWork = items.filter((item) => item.status === "working").at(-1);
        const waiting = items.filter((item) => item.status === "waiting").at(-1);
        // one line, the most urgent thing first; the time beside the name is that thing's age
        const line: { text: string; at?: string; attention?: boolean } =
          bot.paused ? { text: t("Paused") }
            : needs.length > 1 ? { text: t("{n} questions wait for you", { n: needs.length }), at: needs.at(-1)!.updatedAt, attention: true }
            : needs.length === 1 ? { text: needs[0]!.title, at: needs[0]!.updatedAt, attention: true }
            : running && status === "blocked" ? { text: t("Waiting for you"), attention: true }
            : atWork ? { text: atWork.title, at: atWork.updatedAt }
            : working ? { text: t("Working") }
            : waiting?.waitingOn ? { text: t("Waiting on: {what}", { what: waiting.waitingOn }), at: waiting.updatedAt }
            : bot.purpose ? { text: bot.purpose }
            : { text: running ? (bot.agent === "claude" ? "Claude Code" : "Codex") : t("Starts on the next message") };
        const badge: BotBadge = bot.paused ? null : line.attention ? "blocked" : running ? null : "sleeping";
        const isFolded = folded.includes(bot.id);
        const mark = isFolded && workers.some((worker) => worker.status === "blocked") ? "blocked" : working || (isFolded && workers.length > 0) ? "working" : null;
        const active = bot.paneId !== null && bot.paneId === selectedPaneId;
        return <li key={bot.id}>
          <div className="bot-row" data-active={active ? "true" : undefined} data-dimmed={bot.paused ? "true" : undefined}>
            <button type="button" className="bot-row-open" aria-current={active ? "true" : undefined} title={t("Open chat with {name}", { name: bot.name })} onClick={() => void openChat(bot)}>
              <BotAvatar bot={bot} badge={badge} />
              <span className="bot-row-text">
                <span className="bot-row-top">
                  <span className="bot-row-name" data-unread={line.attention ? "true" : undefined}>{bot.name}</span>
                  {line.at && <span className="bot-row-age">{botAge(line.at)}</span>}
                </span>
                <span className="bot-row-line ko-text">{line.attention && <span className="bot-attention" aria-hidden="true" />}<span className="bot-row-line-text">{line.text}</span></span>
              </span>
            </button>
            <button type="button" className="sidebar-row-action bot-row-manage" aria-label={t("Manage {name}", { name: bot.name })} title={t("Manage {name}", { name: bot.name })} onClick={() => onManage(bot.id)}><Settings aria-hidden="true" /></button>
            {workers.length > 0
              ? <button type="button" className="bot-row-fold" aria-expanded={!isFolded} aria-label={t(isFolded ? "Unfold {name}" : "Fold {name}", { name: bot.name })} onClick={() => toggleFold(bot.id)}>
                {mark === "blocked" ? <span className="bot-glyph bot-dot is-question" aria-hidden="true" /> : mark === "working" ? <BotSpinner /> : null}
                <ChevronDown className="bot-row-chevron" data-folded={isFolded ? "true" : undefined} aria-hidden="true" />
              </button>
              : working && <span className="bot-row-working"><BotSpinner label={t("Working")} /></span>}
          </div>
          {workers.length > 0 && !isFolded && <ul className="bot-row-children">
            {workers.map((worker) => {
              const item = worker.itemN === null ? null : items.find((entry) => entry.n === worker.itemN);
              const label = item ? `#${item.n} ${item.title}` : worker.branch;
              return <li key={worker.id}><button type="button" className="bot-child" aria-current={worker.paneId === selectedPaneId ? "true" : undefined} title={label} onClick={() => onOpenPane(worker.paneId!)}>
                <BotItemStatusIcon status={worker.status === "blocked" ? "needs_you" : worker.status === "starting" ? "planned" : "working"} live />
                <span className="bot-child-title">{label}</span>
                <span className="bot-row-age">{botAge(worker.startedAt)}</span>
              </button></li>;
            })}
          </ul>}
        </li>;
      })}
    </ul>
    {failed && <p className="sidebar-inline-error" role="alert">{failed}</p>}
  </section>;
}
