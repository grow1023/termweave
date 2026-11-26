// The head is adapted from stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), BotPanelHeader.tsx
// and BotActivityPanel.tsx: the bot's picture, name and one status line, then what needs the
// owner, its items by status and its automations.
import { useState } from "react";
import { ChevronDown, Settings, SquareTerminal } from "lucide-react";

import { BOT_ITEM_OPEN, type BotItemStatus } from "../../shared/bots/types.ts";
import { ACTIVE_WORKER, openLocalPane, reloadBots, useBotsView } from "../lib/bots.ts";
import { useT } from "../lib/i18n.ts";
import { ITEM_LABEL, ItemRow, WORKER_LABEL } from "./BotsPanel.tsx";
import { BotAvatar, BotItemStatusIcon } from "./BotVisuals.tsx";
import "./BotsPanel.css";

const GROUPS: readonly BotItemStatus[] = ["working", "waiting", "planned"];
/** rows a group shows before "Show N more", as in Orca */
const GROUP_ROWS = 5;

/**
 * Above a bot's chat: what waits on the owner (answered right here), its open items and its
 * running workers. Renders nothing for a pane that is no bot's chat.
 */
export function BotBar({ paneId, readOnly }: { paneId: string; readOnly: boolean }) {
  const t = useT();
  const view = useBotsView();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Planned starts folded, as in Orca: what runs and what waits is what the owner came to see
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set(["planned"]));
  const [all, setAll] = useState<ReadonlySet<string>>(() => new Set());
  const bot = view?.bots.find((entry) => entry.paneId === paneId);
  if (!view || !bot) return null;
  const items = view.items.filter((item) => item.botId === bot.id && BOT_ITEM_OPEN.has(item.status));
  const needs = items.filter((item) => item.status === "needs_you");
  const workers = view.workers.filter((worker) => worker.botId === bot.id && ACTIVE_WORKER.has(worker.status) && worker.paneId);
  const next = view.automations.filter((automation) => automation.botId === bot.id && automation.enabled && automation.nextRunAt)
    .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!))[0];
  const running = items.find((item) => item.status === "working");
  const status = bot.paused ? t("Paused")
    : running ? t("Running {what}", { what: running.title })
    : workers.length > 0 ? t("{items} open · {workers} working", { items: items.length, workers: workers.length })
    : next ? t("Idle · next {time} · {name}", { time: new Date(next.nextRunAt!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), name: next.name })
    : items.length === 0 ? t("Nothing open. Tell it what to do below.")
    : t("Idle");
  const answer = async (n: number, text: string): Promise<void> => {
    setBusy(true); setFailed(null);
    try {
      const response = await fetch(`/api/bots/${bot.id}/items/${n}`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: text }) });
      const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? String(response.status));
      await reloadBots();
    } catch (error) { setFailed(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };
  const toggle = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => { const copy = new Set(set); if (!copy.delete(key)) copy.add(key); return copy; };

  return <section className="bot-bar" aria-label={t("{name} bot", { name: bot.name })}>
    <header className="bot-head">
      <BotAvatar bot={bot} size={36} />
      <div className="bot-head-text">
        <strong className="bot-head-name">{bot.name}</strong>
        <span className="bot-head-status ko-text">{status}</span>
      </div>
      <button type="button" className="icon-button" aria-label={t("Bot settings")} title={t("Bot settings")}
        onClick={() => window.dispatchEvent(new CustomEvent("termweave:manage-bot", { detail: { botId: bot.id } }))}><Settings aria-hidden="true" /></button>
    </header>
    {failed && <p className="bots-notice ko-text" role="alert">{failed}</p>}
    {needs.length > 0 && <ul className="bots-list bot-bar-list">
      {needs.map((item) => <ItemRow key={item.n} item={item} locked={readOnly || busy} onAnswer={(text) => void answer(item.n, text)} />)}
    </ul>}
    {GROUPS.map((group) => {
      const rows = items.filter((item) => item.status === group);
      if (rows.length === 0) return null;
      const isFolded = folded.has(group);
      const shown = all.has(group) ? rows : rows.slice(0, GROUP_ROWS);
      return <section key={group} className="bot-group">
        <button type="button" className="bot-group-head" aria-expanded={!isFolded} onClick={() => setFolded(toggle(folded, group))}>
          <ChevronDown className="bot-row-chevron" data-folded={isFolded ? "true" : undefined} aria-hidden="true" />
          <BotItemStatusIcon status={group} />
          <span>{t(ITEM_LABEL[group])}</span>
          <span className="bot-group-count">{rows.length}</span>
        </button>
        {!isFolded && <ul className="bots-list bot-bar-list">
          {shown.map((item) => <ItemRow key={item.n} item={item} locked onAnswer={() => {}} live={workers.some((worker) => worker.itemN === item.n)} />)}
        </ul>}
        {!isFolded && rows.length > shown.length && <button type="button" className="btn btn-ghost bot-bar-more" onClick={() => setAll(toggle(all, group))}>{t("Show {n} more", { n: rows.length - shown.length })}</button>}
      </section>;
    })}
    {workers.length > 0 && <ul className="bot-bar-workers">
      {workers.map((worker) => {
        const item = worker.itemN === null ? null : view.items.find((entry) => entry.botId === bot.id && entry.n === worker.itemN);
        return <li key={worker.id}><button type="button" className="bot-bar-worker" onClick={() => openLocalPane(worker.paneId!)} title={t("Open terminal")}>
          <SquareTerminal aria-hidden="true" />
          <span className="bot-bar-worker-title">{item ? `#${item.n} ${item.title}` : worker.id}</span>
          <span className={`bots-label is-${worker.status}`}>{t(WORKER_LABEL[worker.status])}</span>
        </button></li>;
      })}
    </ul>}
  </section>;
}
