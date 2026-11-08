import { describe, expect, it } from "bun:test";
import type { Machine } from "../../shared/machines.ts";
import type { PaneInfo, WorkspaceInfo } from "../../shared/protocol.ts";
import { fleetFromMachines } from "./fleet.ts";

const workspace = (id: string, number: number, label = id): WorkspaceInfo => ({
  active_tab_id: "t", agent_status: "idle", focused: false, label, number, pane_count: 1, tab_count: 1, workspace_id: id,
});

const pane = (id: string, workspaceId: string, agent: string | null, status: string, extra: Partial<PaneInfo> = {}): PaneInfo => ({
  agent, agent_status: status, focused: false, pane_id: id, revision: 1, tab_id: "t", terminal_id: `term-${id}`, workspace_id: workspaceId, ...extra,
});

const machine = (id: string, state: Machine["state"], panes: PaneInfo[], workspaces: WorkspaceInfo[]): Machine => ({
  id, name: id.toUpperCase(), kind: id === "local" ? "local" : "ssh", enabled: true, state, error: null,
  snapshot: { agents: [], layouts: [], panes, protocol: 1, tabs: [], version: "0.9.1", workspaces },
});

describe("fleetFromMachines", () => {
  it("keeps agent panes only and maps herdr status to fleet work", () => {
    const fleet = fleetFromMachines([machine("local", "connected", [
      pane("p1", "w1", "claude", "working"),
      pane("p2", "w1", null, "idle"),
      pane("p3", "w1", "codex", "blocked"),
      pane("p4", "w1", "claude", "done"),
      pane("p5", "w1", "pi", "idle"),
    ], [workspace("w1", 1)])]);
    const [local] = fleet.machines;
    expect(local!.agents.map((agent) => agent.paneId)).toEqual(["p1", "p3", "p4", "p5"]);
    expect(local!.agents.map((agent) => agent.state)).toEqual(["running", "attention", "reported", "idle"]);
    expect({ running: local!.running, attention: local!.attention, reported: local!.reported }).toEqual({ running: 1, attention: 1, reported: 1 });
    expect({ running: fleet.running, attention: fleet.attention, agents: fleet.agents }).toEqual({ running: 1, attention: 1, agents: 4 });
  });

  it("shows a machine that is not connected without its cached agents", () => {
    const fleet = fleetFromMachines([machine("box", "reconnecting", [pane("p1", "w1", "claude", "blocked")], [workspace("w1", 1)])]);
    expect(fleet.machines[0]!.agents).toEqual([]);
    expect(fleet.machines[0]!.online).toBe(false);
    expect(fleet.attention).toBe(0);
  });

  it("orders agents by workspace number and keys them by machine and pane", () => {
    const fleet = fleetFromMachines([
      machine("local", "connected", [pane("a", "w2", "claude", "idle"), pane("b", "w1", "codex", "idle")], [workspace("w2", 2), workspace("w1", 1)]),
      machine("box", "connected", [pane("a", "w9", "claude", "idle")], [workspace("w9", 1)]),
    ]);
    expect(fleet.machines[0]!.agents.map((agent) => agent.key)).toEqual(["local:b", "local:a"]);
    expect(fleet.machines[1]!.agents[0]!.key).toBe("box:a");
  });

  it("names an agent by its label, then its title, then its agent kind", () => {
    const fleet = fleetFromMachines([machine("local", "connected", [
      pane("p1", "w1", "claude", "idle", { label: "api", title: "ignored" }),
      pane("p2", "w1", "codex", "idle", { title: "fix tests" }),
      pane("p3", "w1", null, "idle", { display_agent: "gemini" }),
    ], [workspace("w1", 1, "voidnews")])]);
    expect(fleet.machines[0]!.agents.map((agent) => [agent.title, agent.agent, agent.workspace])).toEqual([
      ["api", "claude", "voidnews"], ["fix tests", "codex", "voidnews"], ["gemini", "gemini", "voidnews"],
    ]);
  });
});
