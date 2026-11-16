/**
 * The project graph: each connected PC is a hub, its projects (workspaces) ring it, and every
 * agent session of a project hangs off the project node, like a knowledge graph of who works
 * where. Idle sessions are drawn too; the orbit graph (FleetGraph) counts only work in progress.
 */
import { Orbit } from "lucide-react";
import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import type { Machine } from "../../shared/machines.ts";
import { orbitEdge } from "../lib/fleetLayout.ts";
import { buildFleetMap, type FleetMapMachine, type FleetMapPane } from "../lib/fleetMap.ts";
import { labelBaseline, layoutProjectGraph, PROJECT_RADIUS, SESSION_RADIUS, type ProjectGraphNode } from "../lib/fleetProjectGraph.ts";
import { t } from "../lib/i18n.ts";
import { autoSessionColor } from "../lib/sessionColor.ts";
import { AgentMark } from "./AgentMark.tsx";
import { fitLabelX, useElementWidth, usePauseWhileHidden, useReducedMotion } from "./FleetGraph.tsx";
import { FLEET_MAP_STATE } from "./FleetMap.tsx";

/** Half of the session's pointer target: 32 px across, inside the 40 px pitch. */
const SESSION_HIT = 16;

interface Props {
  readonly machines: ReadonlyArray<Machine>;
  readonly onOpen: (machineId: string, paneId: string) => void;
}

export function FleetProjectGraph({ machines, onOpen }: Props) {
  const map = buildFleetMap(machines);
  const [ref, width] = useElementWidth();
  const reduced = useReducedMotion();
  return (
    <div ref={ref} className="fleet-graph fleet-project-graph">
      {map.length === 0 ? <p className="fleet-project-empty">{t("No agent sessions are open.")}</p> : null}
      {width > 0 ? map.map((machine) => <PcGraph key={machine.id} machine={machine} width={width} reduced={reduced} named={map.length > 1} onOpen={onOpen} />) : null}
    </div>
  );
}

function PcGraph(props: { readonly machine: FleetMapMachine; readonly width: number; readonly reduced: boolean; readonly named: boolean; readonly onOpen: Props["onOpen"] }) {
  const { machine, width, reduced, onOpen } = props;
  const svg = useRef<SVGSVGElement>(null);
  usePauseWhileHidden(svg);
  // the layout draws a name only where it covers nothing: on a phone a few nodes keep just
  // their numbers, which the agent map below the graph lists with the names
  const layout = layoutProjectGraph(machine.projects.map((project) => ({ key: project.key, sessions: project.panes.length, label: project.label })), width);
  const agents = machine.projects.reduce((sum, project) => sum + project.panes.length, 0);
  // ponytail: the workspace's automatic color. A color picked in the workspace menu is stored
  // per browser or on the server (Sidebar.tsx); read it here if the two must always match.
  const tint = (workspaceId: string) => ({ "--ws-color": autoSessionColor(workspaceId) }) as CSSProperties;
  return (
    <div className="fleet-project-pc">
      {props.named ? <span className="fleet-map-pc-name">{machine.label}</span> : null}
      <svg ref={svg} viewBox={`0 0 ${layout.width} ${layout.height}`} className="fleet-graph-svg" role="group"
        aria-label={`${machine.label}: ${t("{agents} agents in {projects} projects", { agents, projects: machine.projects.length })}`}>
        {layout.projects.map((spot, index) => {
          const project = machine.projects[index]!;
          const busy = project.panes.some((pane) => pane.state === "running" || pane.state === "attention");
          const edge = orbitEdge(layout.center, spot);
          return (
            <g key={"links:" + project.key} style={tint(project.workspaceId)}>
              <path d={edge} className="fleet-link fleet-project-link" strokeWidth={busy ? 1.8 : 1.3} strokeDasharray={busy ? undefined : "3 5"} />
              {busy && !reduced ? <path d={edge} className="fleet-link fleet-flow" data-tone="info-solid" strokeWidth={1.6} strokeDasharray="2 12" /> : null}
              {spot.sessions.map((at, i) => {
                const live = project.panes[i]!.state === "running" || project.panes[i]!.state === "attention";
                return <line key={project.panes[i]!.key} x1={spot.x} y1={spot.y} x2={at.x} y2={at.y} className="fleet-spoke" data-busy={live || undefined} strokeDasharray={live ? undefined : "2 4"} />;
              })}
              {spot.more ? <line x1={spot.x} y1={spot.y} x2={spot.more.x} y2={spot.more.y} className="fleet-spoke" strokeDasharray="2 4" /> : null}
            </g>
          );
        })}

        {layout.projects.map((spot, index) => {
          const project = machine.projects[index]!;
          return (
            <g key={project.key}>
              {spot.sessions.map((at, i) => <SessionNode key={project.panes[i]!.key} at={at} pane={project.panes[i]!} project={project.label} width={width} reduced={reduced} onOpen={() => onOpen(machine.id, project.panes[i]!.paneId)} />)}
              {spot.more ? (
                <g transform={`translate(${spot.more.x} ${spot.more.y})`}>
                  <title>{`${project.label} · ${t("{n} more", { n: spot.more.count })}`}</title>
                  <circle r={SESSION_RADIUS} className="fleet-agent-body" strokeWidth={1.4} strokeDasharray="3 3" />
                  <text y={3.5} className="fleet-count">{"+" + spot.more.count}</text>
                </g>
              ) : null}
              <g transform={`translate(${spot.x} ${spot.y})`} style={tint(project.workspaceId)}>
                <title>{`${project.label} · ${t("{n} agents", { n: project.panes.length })}`}</title>
                <circle r={PROJECT_RADIUS} className="fleet-project-body" strokeWidth={1.8} />
                <text y={3.5} className="fleet-count">{project.number}</text>
                {spot.label ? <text y={labelBaseline(PROJECT_RADIUS, spot.labelBelow)} className="fleet-project-label">{spot.label}</text> : null}
              </g>
            </g>
          );
        })}

        <g transform={`translate(${layout.center.x} ${layout.center.y})`} className="fleet-hub">
          <title>{machine.label}</title>
          <circle r={29} className={reduced ? "fleet-hub-orbit" : "fleet-hub-orbit fleet-spin"} strokeDasharray="3 7" />
          <circle r={22} className="fleet-hub-core" />
          <Orbit x={-12} y={-12} width={24} height={24} className="fleet-hub-mark" aria-hidden="true" />
        </g>
      </svg>
    </div>
  );
}

function SessionNode(props: { readonly at: ProjectGraphNode; readonly pane: FleetMapPane; readonly project: string; readonly width: number; readonly reduced: boolean; readonly onOpen: () => void }) {
  const { at, pane, onOpen } = props;
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };
  const facts = [pane.number, pane.agentLabel, pane.title, props.project, t(FLEET_MAP_STATE[pane.state]), pane.subagents > 0 ? (pane.subagents === 1 ? t("1 subagent") : t("{n} subagents", { n: pane.subagents })) : null].filter(Boolean);
  const tone = pane.state === "attention" ? "attention" : pane.state === "running" ? "info" : "muted";
  return (
    <g role="button" tabIndex={0} aria-label={facts.join(", ")} className="fleet-session" data-state={pane.state} transform={`translate(${at.x} ${at.y})`} onClick={onOpen} onKeyDown={onKeyDown}>
      <title>{facts.join(" · ")}</title>
      <circle r={SESSION_HIT} className="fleet-session-hit" />
      {pane.state === "attention" ? <circle r={SESSION_RADIUS + 6} className={props.reduced ? "fleet-attention-ring" : "fleet-attention-ring fleet-ring"} strokeWidth={1.5} /> : null}
      {/* each state has its own outline, so it reads without color: thick, ringed, dashed, thin */}
      <circle r={SESSION_RADIUS} className="fleet-agent-body" data-tone={tone} strokeWidth={pane.state === "running" ? 2 : 1.3} strokeDasharray={pane.state === "reported" ? "2 3" : undefined} />
      {/* AgentMark is HTML, so it needs a foreignObject inside SVG */}
      <foreignObject className="fleet-mark" x={-7} y={-7} width={14} height={14} aria-hidden="true"><AgentMark agent={pane.agent} size={14} /></foreignObject>
      {pane.subagents > 0 ? (
        <g transform="translate(9 -9)" aria-hidden="true">
          <circle r={6} className="fleet-badge" />
          <text y={3} className="fleet-badge-text">{pane.subagents > 9 ? "9+" : pane.subagents}</text>
        </g>
      ) : null}
      <text x={fitLabelX(at.x, pane.number, props.width, 10)} y={labelBaseline(SESSION_RADIUS, at.labelBelow)} className="fleet-agent-label">{pane.number}</text>
    </g>
  );
}
