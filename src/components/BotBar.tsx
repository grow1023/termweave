import { useState } from "react";
import { Bot as BotIcon, SquareTerminal } from "lucide-react";

import { BOT_ITEM_OPEN } from "../../shared/bots/types.ts";
import { ACTIVE_WORKER, openLocalPane, reloadBots, useBotsView } from "../lib/bots.ts";
import { useT } from "../lib/i18n.ts";
import { ItemRow, WORKER_LABEL } from "./BotsPanel.tsx";
import "./BotsPanel.css";

/**
 * Above a bot's chat: what waits on the owner (answered right here), its open items and its
 * running workers. Renders nothing for a pane that is no bot's chat.
 */
export function BotBar({ paneId, readOnly }: { paneId: string; readOnly: boolean }) {
  const t = useT();
  const view = useBotsView();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const bot = view?.bots.find((entry) => entry.paneId === paneId);
  if (!view || !bot) return null;
  const items = view.items.filter((item) => item.botId === bot.id && BOT_ITEM_OPEN.has(item.status));
  const needs = items.filter((item) => item.status === "needs_you");
  const others = items.filter((item) => item.status !== "needs_you");
  const workers = view.workers.filter((worker) => worker.botId === bot.id && ACTIVE_WORKER.has(worker.status) && worker.paneId);
  const answer = async (n: number, text: string): Promise<void> => {
    setBusy(true); setFailed(null);
    try {
      const response = await fetch(`/api/bots/${bot.id}/items/${n}`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: text }) });
      const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? String(response.status));
      await reloadBots();
    } catch (error) { setFailed(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };

  return <section className="bot-bar" aria-label={t("{name} bot", { name: bot.name })}>
    <header className="bot-bar-head">
      <BotIcon aria-hidden="true" />
      <strong className="bot-bar-name">{bot.name}</strong>
      <span className="bot-bar-summary ko-text">{needs.length === 0 && items.length === 0 && workers.length === 0
        ? t("Nothing open. Tell it what to do below.")
        : t("{items} open · {workers} working", { items: items.length, workers: workers.length })}</span>
      {others.length > 0 && <button type="button" className="btn btn-ghost bot-bar-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{t(showAll ? "Hide items" : "Show items")}</button>}
    </header>
    {failed && <p className="bots-notice ko-text" role="alert">{failed}</p>}
    {needs.length > 0 && <ul className="bots-list bot-bar-list">
      {needs.map((item) => <ItemRow key={item.n} item={item} locked={readOnly || busy} onAnswer={(text) => void answer(item.n, text)} />)}
    </ul>}
    {showAll && others.length > 0 && <ul className="bots-list bot-bar-list">
      {others.map((item) => <ItemRow key={item.n} item={item} locked onAnswer={() => {}} />)}
    </ul>}
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
