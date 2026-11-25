import { useState } from "react";
import { Bot as BotIcon, Plus, SlidersHorizontal } from "lucide-react";

import type { SessionSnapshot } from "../../shared/protocol.ts";
import type { Bot, BotsView, BotWorkerStatus } from "../../shared/bots/types.ts";
import { ACTIVE_WORKER } from "../lib/bots.ts";
import { useT } from "../lib/i18n.ts";
import { StatusBadge } from "./Sidebar.tsx";

const WORKER_WORD: Record<BotWorkerStatus, string> = {
  starting: "Starting",
  working: "Working",
  blocked: "Waiting for you",
  done: "Done",
  failed: "Stopped",
};

interface Props {
  view: BotsView;
  /** this PC's own session: the bots' panes and their agent status */
  snapshot: SessionSnapshot | null;
  selectedPaneId: string | null;
  onOpenPane: (paneId: string) => void;
  /** the bots page, on this bot, or on New bot with null */
  onManage: (botId: string | null) => void;
}

/** The bots group at the top of the sidebar: each bot opens its chat, its running workers sit under it. */
export function BotsSidebar({ view, snapshot, selectedPaneId, onOpenPane, onManage }: Props) {
  const t = useT();
  const [failed, setFailed] = useState<string | null>(null);
  const panes = snapshot?.panes ?? [];
  const alive = (paneId: string | null): paneId is string => paneId !== null && panes.some((pane) => pane.pane_id === paneId);
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
        const needs = view.items.filter((item) => item.botId === bot.id && item.status === "needs_you").length;
        const workers = view.workers.filter((worker) => worker.botId === bot.id && ACTIVE_WORKER.has(worker.status) && alive(worker.paneId));
        const status = panes.find((pane) => pane.pane_id === bot.paneId)?.agent_status;
        return <li key={bot.id}>
          <div className="bots-sidebar-row">
            <button type="button" className="bots-sidebar-open" aria-current={bot.paneId !== null && bot.paneId === selectedPaneId ? "true" : undefined}
              title={t("Open chat with {name}", { name: bot.name })} onClick={() => void openChat(bot)}>
              <BotIcon className="bots-sidebar-icon" aria-hidden="true" />
              <span className="bots-sidebar-name">{bot.name}</span>
              {bot.paused ? <span className="bots-sidebar-word">{t("Paused")}</span> : alive(bot.paneId) && <StatusBadge status={status} />}
            </button>
            {needs > 0 && <button type="button" className="badge badge-blocked bots-sidebar-needs" title={t("{n} questions wait for you", { n: needs })}
              aria-label={t("{n} questions wait for you", { n: needs })} onClick={() => onManage(bot.id)}>{t("Needs you")} <span className="workspace-status-count">{needs}</span></button>}
            <button type="button" className="sidebar-row-action" aria-label={t("Manage {name}", { name: bot.name })} title={t("Manage {name}", { name: bot.name })} onClick={() => onManage(bot.id)}><SlidersHorizontal aria-hidden="true" /></button>
          </div>
          {workers.length > 0 && <ul className="bots-sidebar-workers">
            {workers.map((worker) => {
              const item = worker.itemN === null ? null : view.items.find((entry) => entry.botId === bot.id && entry.n === worker.itemN);
              const label = item ? `#${item.n} ${item.title}` : worker.id;
              return <li key={worker.id}><button type="button" className="bots-sidebar-worker" aria-current={worker.paneId === selectedPaneId ? "true" : undefined}
                title={label} onClick={() => onOpenPane(worker.paneId!)}>
                <span className="bots-sidebar-worker-title">{label}</span>
                <span className={`bots-sidebar-word is-${worker.status}`}>{t(WORKER_WORD[worker.status])}</span>
              </button></li>;
            })}
          </ul>}
        </li>;
      })}
    </ul>
    {failed && <p className="sidebar-inline-error" role="alert">{failed}</p>}
  </section>;
}
