import type { Machine, MachineState } from "../../shared/machines.ts";
import type { AgentStatus, PaneInfo } from "../../shared/protocol.ts";
import type { FleetWork, LayoutMachineInput } from "./fleetLayout.ts";
import { paneNumber } from "./paneNumber.ts";

/** One agent's place in the fleet: herdr's status folded into the four states the graph draws. */
export type FleetAgentState = "running" | "attention" | "reported" | "idle";

export interface FleetAgent extends FleetWork {
  readonly key: string;
  readonly machineId: string;
  readonly paneId: string;
  readonly agent: string;
  readonly state: FleetAgentState;
  readonly number: string;
  readonly title: string;
  readonly workspace: string;
}

export interface FleetMachine extends LayoutMachineInput {
  readonly name: string;
  readonly state: MachineState;
  readonly online: boolean;
  readonly agents: ReadonlyArray<FleetAgent>;
}

export interface Fleet {
  readonly machines: ReadonlyArray<FleetMachine>;
  readonly running: number;
  readonly attention: number;
  readonly agents: number;
}

function stateOf(status: AgentStatus): FleetAgentState {
  if (status === "working") return "running";
  if (status === "blocked") return "attention";
  if (status === "done") return "reported";
  return "idle";
}

const WORK: Record<FleetAgentState, FleetWork> = {
  running: { running: 1, attention: 0, reported: 0 },
  attention: { running: 0, attention: 1, reported: 0 },
  reported: { running: 0, attention: 0, reported: 1 },
  idle: { running: 0, attention: 0, reported: 0 },
};

const agentOf = (pane: PaneInfo): string | null => pane.agent || pane.display_agent || null;

const sum = (items: ReadonlyArray<FleetWork>, field: keyof FleetWork): number =>
  items.reduce((total, item) => total + item[field], 0);

/**
 * Only a connected PC can say what its agents are doing: an offline roster is a cache
 * (see needsInput.ts), so a machine that is not connected shows with no agents.
 */
function machineFleet(machine: Machine): FleetMachine {
  const online = machine.state === "connected" && machine.snapshot !== null;
  const snapshot = online ? machine.snapshot : null;
  const workspaces = new Map((snapshot?.workspaces ?? []).map((workspace) => [workspace.workspace_id, workspace]));
  const agents = (snapshot?.panes ?? [])
    .map((pane, order) => ({ pane, order, agent: agentOf(pane), workspace: workspaces.get(pane.workspace_id) }))
    .filter((entry): entry is typeof entry & { agent: string } => entry.agent !== null)
    .sort((a, b) => (a.workspace?.number ?? Number.MAX_SAFE_INTEGER) - (b.workspace?.number ?? Number.MAX_SAFE_INTEGER) || a.order - b.order)
    .map(({ pane, agent, workspace }): FleetAgent => {
      const state = stateOf(pane.agent_status);
      return {
        ...WORK[state],
        key: `${machine.id}:${pane.pane_id}`,
        machineId: machine.id,
        paneId: pane.pane_id,
        agent,
        state,
        number: paneNumber(pane),
        title: pane.label || pane.title || agent,
        workspace: workspace?.label ?? "",
      };
    });
  return {
    id: machine.id,
    name: machine.name,
    state: machine.state,
    online,
    agents,
    running: sum(agents, "running"),
    attention: sum(agents, "attention"),
    reported: sum(agents, "reported"),
  };
}

export function fleetFromMachines(machines: ReadonlyArray<Machine>): Fleet {
  const fleet = machines.map(machineFleet);
  return {
    machines: fleet,
    running: sum(fleet, "running"),
    attention: sum(fleet, "attention"),
    agents: fleet.reduce((total, machine) => total + machine.agents.length, 0),
  };
}
