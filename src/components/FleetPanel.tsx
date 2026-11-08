import { X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Machine } from "../../shared/machines.ts";
import { fleetFromMachines, type FleetAgent, type FleetMachine } from "../lib/fleet.ts";
import { t, useLocale } from "../lib/i18n.ts";
import { AgentMark } from "./AgentMark.tsx";
import { FleetGraph, STATE_LABEL } from "./FleetGraph.tsx";
import { STATE_WORD } from "./MachineSidebar.tsx";
import "./FleetPanel.css";

interface Props {
  readonly machines: ReadonlyArray<Machine>;
  readonly onClose: () => void;
  readonly onOpen: (machineId: string, paneId: string) => void;
}

/** Every PC and the agents on it, as a graph and a list (after GOAT's Fleet page). */
export function FleetPanel({ machines, onClose, onOpen }: Props) {
  const id = useId();
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<string | null>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surface = dialog.current; surface?.showModal();
    return () => { surface?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  const fleet = fleetFromMachines(machines);
  const activeFilter = fleet.machines.some((machine) => machine.id === filter) ? filter : null;
  const shown = activeFilter === null ? fleet.machines : fleet.machines.filter((machine) => machine.id === activeFilter);
  const open = (agent: FleetAgent) => { onOpen(agent.machineId, agent.paneId); onClose(); };
  const filteredName = fleet.machines.find((machine) => machine.id === activeFilter)?.name;

  return createPortal(
    <dialog ref={dialog} className="fleet-dialog" lang={locale} aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="fleet-header">
        <div>
          <h2 id={`${id}-title`}>{t("Agent fleet")}</h2>
          <p>{t("Every PC and the agents running on it")}</p>
        </div>
        <button type="button" className="icon-button" aria-label={t("Close")} onClick={onClose} autoFocus><X aria-hidden="true" /></button>
      </header>
      <div className="fleet-body">
        <dl className="fleet-summary" aria-label={t("Fleet summary")}>
          <div data-state="running"><dt>{t("Working")}</dt><dd>{fleet.running}</dd></div>
          <div data-state="attention"><dt>{t("Needs you")}</dt><dd>{fleet.attention}</dd></div>
          <div><dt>{t("Agents")}</dt><dd>{fleet.agents}</dd></div>
          <div><dt>{t("PCs")}</dt><dd>{fleet.machines.length}</dd></div>
        </dl>
        {fleet.machines.length === 0 ? <p className="fleet-empty">{t("No PCs are connected yet.")}</p> : (
          <>
            <FleetGraph fleet={fleet} filter={activeFilter} onFilter={setFilter} onOpen={open} />
            {filteredName && (
              <p className="fleet-filter" role="status">
                {t("Showing {name} only", { name: filteredName })}
                <button type="button" className="btn" onClick={() => setFilter(null)}>{t("Show all PCs")}</button>
              </p>
            )}
            {fleet.agents === 0 && <p className="fleet-empty">{t("No agents are running. Start one from a new session.")}</p>}
            {shown.map((machine) => <MachineSection key={machine.id} machine={machine} onOpen={open} />)}
          </>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

function MachineSection({ machine, onOpen }: { machine: FleetMachine; onOpen: (agent: FleetAgent) => void }) {
  return (
    <section className="fleet-machine-section" aria-label={machine.name}>
      <h3>
        <span className="fleet-machine-title">{machine.name}</span>
        <span className="fleet-machine-state" data-online={machine.online || undefined}>{t(STATE_WORD[machine.state])}</span>
      </h3>
      {machine.online && machine.agents.length === 0 && <p className="fleet-empty">{t("No agents on this PC.")}</p>}
      {machine.agents.length > 0 && (
        <ul className="fleet-list">
          {machine.agents.map((agent) => (
            <li key={agent.key}>
              <button type="button" className="fleet-row" data-state={agent.state} onClick={() => onOpen(agent)}>
                <AgentMark agent={agent.agent} size={18} />
                <span className="fleet-row-number">{agent.number}</span>
                <span className="fleet-row-title">{agent.title}{agent.workspace && <small>{agent.workspace}</small>}</span>
                <span className="fleet-chip" data-state={agent.state}><span className="fleet-dot" aria-hidden="true" />{t(STATE_LABEL[agent.state])}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
