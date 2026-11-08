import { Orbit } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Fleet, FleetAgent, FleetAgentState, FleetMachine } from "../lib/fleet.ts";
import { compactGraphHeight, compactGraphLimits, layoutFleet, orbitEdge } from "../lib/fleetLayout.ts";
import { t } from "../lib/i18n.ts";
import { AgentMark } from "./AgentMark.tsx";
import { STATE_WORD } from "./MachineSidebar.tsx";

/** Moving dots are capped; every running agent still counts in the summary. */
const MAX_PARTICLES = 24;
const PARTICLE_SECONDS = 2.6;
/**
 * Dots jump along the edge in five steps instead of gliding: like the app's stepped pulse
 * (src/motion.test.ts), an endless smooth motion redraws every frame and stutters video beside it.
 */
const PARTICLE_STEPS = "0;0.25;0.5;0.75;1";
const PARTICLE_TIMES = "0;0.2;0.4;0.6;0.8";
const MACHINE_RADIUS = 18;
const AGENT_RADIUS = 12;
const DESKTOP_HEIGHT = 400;
/** A label baseline above this is clipped by the graph's top edge (11px text). */
const LABEL_MIN_Y = 12;

export const STATE_LABEL: Readonly<Record<FleetAgentState, string>> = {
  running: "Working",
  attention: "Needs you",
  reported: "Done",
  idle: "Idle",
};

interface Props {
  readonly fleet: Fleet;
  readonly filter: string | null;
  readonly onFilter: (machineId: string | null) => void;
  readonly onOpen: (agent: FleetAgent) => void;
}

const initials = (name: string) => [...name.trim()].slice(0, 2).join("").toUpperCase() || "PC";

/** The P number sits outside the orbit, unless the graph's top edge would cut it: then below the node. */
function numberY(spot: { readonly y: number; readonly labelBelow: boolean }): number {
  const above = spot.y - AGENT_RADIUS - 6;
  return spot.labelBelow || above < LABEL_MIN_Y ? spot.y + AGENT_RADIUS + 13 : above;
}

function activate(event: KeyboardEvent, run: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  run();
}

/** An orbit graph of every PC and its agents (layout from GOAT's fleetLayout.ts). */
export function FleetGraph({ fleet, filter, onFilter, onOpen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const compact = width > 0 && width < 600;
  const height = compact ? compactGraphHeight(width) : DESKTOP_HEIGHT;
  const layout = width > 0 ? layoutFleet(fleet.machines, width, height, compact ? compactGraphLimits(width) : undefined) : null;
  const byId = new Map(fleet.machines.map((machine) => [machine.id, machine]));
  const agentsByKey = new Map(fleet.machines.flatMap((machine) => machine.agents.map((agent) => [agent.key, agent] as const)));
  const moving = new Map(fleet.machines.flatMap((machine) => machine.agents)
    .filter((agent) => agent.state === "running").slice(0, MAX_PARTICLES).map((agent, index) => [agent.key, index] as const));

  return (
    <div ref={box} className="fleet-graph" style={{ height }}>
      {layout && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t("Agent map")}>
          <ellipse className="fleet-orbit" cx={layout.center.x} cy={layout.center.y} rx={layout.inner.rx} ry={layout.inner.ry} />
          {layout.machines.map((node) => {
            const machine = node.id === null ? null : byId.get(node.id) ?? null;
            const dimmed = filter !== null && node.id !== filter;
            return (
              <g key={node.id ?? "more"} className="fleet-machine-group" data-dimmed={dimmed || undefined}>
                <path className="fleet-edge" d={node.edge} data-offline={machine && !machine.online ? "true" : undefined} />
                {node.agents.map((spot) => {
                  const edge = orbitEdge(node, spot);
                  const order = moving.get(spot.key);
                  return (
                    <g key={spot.key}>
                      <path className="fleet-edge fleet-edge-agent" d={edge} />
                      {order !== undefined && (
                        <circle className="fleet-particle" r={2.5}>
                          <animateMotion dur={`${PARTICLE_SECONDS}s`} begin={`${(order * 0.37) % PARTICLE_SECONDS}s`} repeatCount="indefinite" path={edge} calcMode="discrete" keyPoints={PARTICLE_STEPS} keyTimes={PARTICLE_TIMES} />
                        </circle>
                      )}
                    </g>
                  );
                })}
                {node.agents.map((spot) => {
                  const agent = agentsByKey.get(spot.key);
                  if (spot.aggregate || !agent) {
                    const more = spot.aggregate?.count ?? 0;
                    return (
                      <g key={`${spot.key}-node`} className="fleet-node fleet-node-more" role="button" tabIndex={0}
                        aria-label={t("{n} more agents on {name}", { n: more, name: machine?.name ?? "" })}
                        onClick={() => onFilter(node.id)} onKeyDown={(event) => activate(event, () => onFilter(node.id))}>
                        <circle className="fleet-ring" cx={spot.x} cy={spot.y} r={AGENT_RADIUS} />
                        <text className="fleet-count" x={spot.x} y={spot.y} dy="0.35em">+{more}</text>
                      </g>
                    );
                  }
                  const label = `${agent.number} ${agent.title} · ${t(STATE_LABEL[agent.state])}`;
                  return (
                    <g key={`${spot.key}-node`} className="fleet-node fleet-agent" data-state={agent.state} role="button" tabIndex={0}
                      aria-label={label} onClick={() => onOpen(agent)} onKeyDown={(event) => activate(event, () => onOpen(agent))}>
                      <title>{label}</title>
                      <circle className="fleet-halo" cx={spot.x} cy={spot.y} r={AGENT_RADIUS + 5} />
                      <circle className="fleet-ring" cx={spot.x} cy={spot.y} r={AGENT_RADIUS} />
                      {/* AgentMark is HTML (a span around the mark), so it needs a foreignObject inside SVG */}
                      <foreignObject className="fleet-mark" x={spot.x - 8} y={spot.y - 8} width={16} height={16} aria-hidden="true"><AgentMark agent={agent.agent} size={16} /></foreignObject>
                      <text className="fleet-label fleet-number" x={spot.x} y={numberY(spot)}>{agent.number}</text>
                    </g>
                  );
                })}
                {machine ? <MachineNode machine={machine} x={node.x} y={node.y} selected={filter === machine.id} onFilter={onFilter} />
                  : (
                    // a count only: the folded PCs are in the list below, so there is nothing to select
                    <g className="fleet-node-more" role="img" aria-label={t("{n} more PCs", { n: node.aggregate?.count ?? 0 })}>
                      <circle className="fleet-ring" cx={node.x} cy={node.y} r={MACHINE_RADIUS} />
                      <text className="fleet-count" x={node.x} y={node.y} dy="0.35em">+{node.aggregate?.count ?? 0}</text>
                    </g>
                  )}
              </g>
            );
          })}
          <g className="fleet-center">
            <title>TermWeave</title>
            <circle cx={layout.center.x} cy={layout.center.y} r={MACHINE_RADIUS + 4} />
            <g transform={`translate(${layout.center.x - 9} ${layout.center.y - 9})`}><Orbit size={18} aria-hidden="true" /></g>
          </g>
        </svg>
      )}
    </div>
  );
}

function MachineNode({ machine, x, y, selected, onFilter }: { machine: FleetMachine; x: number; y: number; selected: boolean; onFilter: (id: string | null) => void }) {
  const toggle = () => onFilter(selected ? null : machine.id);
  const counts = t("{running} working · {attention} need you", { running: machine.running, attention: machine.attention });
  const status = machine.online ? counts : t(STATE_WORD[machine.state]);
  return (
    <g className="fleet-node fleet-machine" data-online={machine.online || undefined} data-selected={selected || undefined} data-attention={machine.attention > 0 || undefined}
      role="button" tabIndex={0} aria-pressed={selected} aria-label={`${machine.name} · ${status}`} onClick={toggle} onKeyDown={(event) => activate(event, toggle)}>
      <title>{`${machine.name} · ${status}`}</title>
      <circle className="fleet-ring" cx={x} cy={y} r={MACHINE_RADIUS} />
      <text className="fleet-initials" x={x} y={y} dy="0.35em">{initials(machine.name)}</text>
      {machine.attention > 0 && <circle className="fleet-presence" cx={x + 13} cy={y + 13} r={4.5} />}
      <text className="fleet-label fleet-machine-name" x={x} y={y + MACHINE_RADIUS + 14}>{machine.name}</text>
    </g>
  );
}
