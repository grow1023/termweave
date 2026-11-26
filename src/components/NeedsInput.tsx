import { paneNumber } from "../lib/paneNumber.ts";
import type { Machine } from "../../shared/machines.ts";
import { paneStorageId } from "../../shared/machines.ts";
import type { BotsView } from "../../shared/bots/types.ts";
import { useT } from "../lib/i18n.ts";
import { AgentMark } from "./AgentMark.tsx";
import { displayPaneTitle, StatusBadge } from "./Sidebar.tsx";
import { needsYou, type BotQuestion } from "./navModel.ts";
import "./NeedsInput.css";

export function NeedsInput({ machines, bots, selectedMachineId, selectedPaneId, onSelect, onOpenBot }: {
  machines: Machine[];
  /** the bots of this app's PC: their open questions wait here too, not only on the bots page */
  bots: BotsView | null;
  selectedMachineId: string;
  selectedPaneId: string | null;
  onSelect(machineId: string, paneId: string): void;
  onOpenBot(bot: { id: string; paneId: string | null }): void;
}) {
  const t = useT();
  const waiting = needsYou(machines, bots);
  // more than one PC repeats P-numbers: the PC name leads the title then, not only the subtitle
  const manyPcs = machines.length > 1;
  return <>
    <p className="visually-hidden" role="status">{t("Panes waiting for input: {n}", { n: waiting.total })}</p>
    {waiting.total > 0 && <section className="needs-input" aria-label={t("Needs you")}>
    <h2 className="needs-input-heading">{t("Needs you")} <span className="pill needs-input-count">{waiting.total}</span></h2>
    <ul className="pane-list">
      {waiting.bots.map((bot) => <BotRow key={`bot:${bot.botId}`} bot={bot} selected={selectedMachineId === "local" && bot.paneId !== null && bot.paneId === selectedPaneId} onOpen={onOpenBot} />)}
      {waiting.panes.map(({ machine, pane, workspace }) => {
        const selected = machine.id === selectedMachineId && pane.pane_id === selectedPaneId;
        return <li className={`needs-input-item${selected ? " is-selected" : ""}`} key={paneStorageId(machine.id, pane.pane_id)}>
          <button type="button" className="pane-select needs-input-select" aria-current={selected ? "true" : undefined} onClick={() => onSelect(machine.id, pane.pane_id)}>
            <span className="agent-mark-holder"><AgentMark agent={pane.agent ?? ""} size={22} /></span>
            <span className="pane-copy">
              <span className="pane-title">{manyPcs && <span className="needs-input-pc">{machine.name} · </span>}<span className="pane-number">{paneNumber(pane)}</span> {displayPaneTitle(pane)}</span>
              <span className="pane-meta"><StatusBadge status={pane.agent_status} /><span className="pane-subtitle">{manyPcs ? workspace.label : `${machine.name} · ${workspace.label}`}</span></span>
            </span>
          </button>
        </li>;
      })}
    </ul>
    </section>}
  </>;
}

function BotRow({ bot, selected, onOpen }: { bot: BotQuestion; selected: boolean; onOpen(bot: { id: string; paneId: string | null }): void }) {
  const t = useT();
  return <li className={`needs-input-item${selected ? " is-selected" : ""}`}>
    <button type="button" className="pane-select needs-input-select" aria-current={selected ? "true" : undefined} onClick={() => onOpen({ id: bot.botId, paneId: bot.paneId })}>
      <span className="agent-mark-holder"><AgentMark agent={bot.agent} size={22} /></span>
      <span className="pane-copy">
        <span className="pane-title">{bot.name}</span>
        <span className="pane-meta"><StatusBadge status="blocked" /><span className="pane-subtitle">{bot.count === 1 ? t("Bot · 1 question") : t("Bot · {n} questions", { n: bot.count })}</span></span>
      </span>
    </button>
  </li>;
}
