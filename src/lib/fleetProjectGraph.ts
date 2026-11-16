/**
 * Layout for the project graph: one PC at the hub, its projects (workspaces) around it, and every
 * agent session of a project fanned out behind the project node, like a knowledge graph.
 * Sessions sit on an outer ellipse at even arc distances, so a wide or tall graph uses its whole
 * rim; a project's sessions stay close together and the spare rim goes between projects.
 */
import type { FleetPoint } from "./fleetLayout.ts";

/**
 * The least distance along the rim between two session nodes: a 22 px node, its 14 px number and
 * a gap. Where the rim runs straight down, a number then stays clear of the next node.
 */
export const SESSION_PITCH = 40;
/** Sessions of one project stay closer than this, so a project reads as one cluster. */
const MAX_STEP = 58;
/** Empty rim between two projects, in session places. */
const PROJECT_GAP = 0.8;
/** Room around the rim for a node and its label. */
const PAD = 36;
const SAMPLES = 360;

/** Node radii as drawn; FleetProjectGraph.tsx draws with the same numbers. */
export const PROJECT_RADIUS = 15;
export const SESSION_RADIUS = 11;
/** The hub's core, with room for its orbit ring. */
const HUB_CLEAR = 26;
const LABEL_FONT = 10;
/** A session's number ("P128") is at most this wide. */
const SESSION_LABEL = 24;
/** Air between a project's name and any other node. */
const LABEL_GAP = 2;
/** What a session draws outside its body: the attention ring, the subagent badge. */
const SESSION_EXTRA = 6;

/** A label's text baseline from its node's center: under the node, or over it. */
export const labelBaseline = (radius: number, below: boolean) => below ? radius + 12 : -(radius + 6);

interface Box { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
const labelBox = (at: FleetPoint, radius: number, below: boolean, width: number): Box => {
  const baseline = at.y + labelBaseline(radius, below);
  return { left: at.x - width / 2, right: at.x + width / 2, top: baseline - LABEL_FONT, bottom: baseline + 3 };
};
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const covers = (box: Box, center: FleetPoint, radius: number) =>
  Math.hypot(center.x - Math.max(box.left, Math.min(center.x, box.right)), center.y - Math.max(box.top, Math.min(center.y, box.bottom))) < radius;

export interface ProjectGraphNode extends FleetPoint {
  readonly labelBelow: boolean;
}

export interface ProjectGraphProject extends ProjectGraphNode {
  readonly key: string;
  /** places for the project's first sessions, in input order */
  readonly sessions: ReadonlyArray<ProjectGraphNode>;
  /** the "+N" node for sessions that did not fit, or null */
  readonly more: (ProjectGraphNode & { readonly count: number }) | null;
  /** the name as drawn, cut to fit; null when none was given or no side of the node is clear */
  readonly label: string | null;
}

export interface ProjectGraphLayout {
  readonly width: number;
  readonly height: number;
  readonly center: FleetPoint;
  readonly projects: ReadonlyArray<ProjectGraphProject>;
}

/** An ellipse measured by arc length, clockwise from the top. */
function rim(center: FleetPoint, rx: number, ry: number) {
  const point = (turn: number): FleetPoint => {
    const angle = -Math.PI / 2 + 2 * Math.PI * turn;
    return { x: center.x + rx * Math.cos(angle), y: center.y + ry * Math.sin(angle) };
  };
  const lengths = new Float64Array(SAMPLES + 1);
  for (let i = 1; i <= SAMPLES; i++) {
    const a = point((i - 1) / SAMPLES);
    const b = point(i / SAMPLES);
    lengths[i] = lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = lengths[SAMPLES]!;
  const at = (distance: number): FleetPoint => {
    const d = ((distance % total) + total) % total;
    let i = 1;
    while (i < SAMPLES && lengths[i]! < d) i++;
    const span = lengths[i]! - lengths[i - 1]!;
    return point((i - 1 + (span === 0 ? 0 : (d - lengths[i - 1]!) / span)) / SAMPLES);
  };
  return { total, at };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** East Asian wide characters fill the em box; Latin text averages 0.56 em at label sizes. */
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;
export const labelWidth = (text: string, fontPx: number) => [...text].reduce((sum, char) => sum + (WIDE.test(char) ? 1 : 0.56), 0) * fontPx;

/** `text` cut to `maxPx` with an ellipsis. A Korean name is nearly twice as wide as a Latin name of the same length, so a character count cannot bound it. */
export function fitLabel(text: string, maxPx: number, fontPx: number): string {
  if (labelWidth(text, fontPx) <= maxPx) return text;
  const chars = [...text];
  while (chars.length > 1 && labelWidth(chars.join("") + "…", fontPx) > maxPx) chars.pop();
  return chars.join("").trimEnd() + "…";
}

export function layoutProjectGraph(projects: ReadonlyArray<{ readonly key: string; readonly sessions: number; readonly label?: string | null }>, width: number): ProjectGraphLayout {
  const compact = width < 600;
  // a phone gives the rim the room a desktop keeps for wide labels
  const rx = Math.max(70, width / 2 - (compact ? 24 : PAD));
  // room for two depths of project nodes between the hub and the rim
  const ryMin = compact ? 130 : 170;
  // a phone grows tall instead of wide; a desktop graph stays within one screen
  const ryMax = compact ? Math.max(ryMin, Math.round(width * 0.95)) : 260;
  const origin = { x: 0, y: 0 };
  const nodesAt = (cap: number) => projects.reduce((sum, project) => sum + Math.min(project.sessions, cap), 0);
  const need = (cap: number) => (nodesAt(cap) + projects.length * PROJECT_GAP) * SESSION_PITCH;
  // ponytail: sessions fold into "+N" per project, projects never fold. A phone holds about 20
  // projects before nodes touch; fold projects too if a PC ever has more.
  let cap = Math.max(1, ...projects.map((project) => project.sessions));
  const room = rim(origin, rx, ryMax).total;
  while (cap > 1 && need(cap) > room) cap--;
  let ry = ryMin;
  while (ry < ryMax && rim(origin, rx, ry).total < need(cap)) ry = Math.min(ryMax, ry + 10);

  const center = { x: round(width / 2), y: PAD + ry };
  const { total, at } = rim(center, rx, ry);
  const nodes = nodesAt(cap);
  const step = Math.min(MAX_STEP, total / Math.max(1, nodes + projects.length * PROJECT_GAP));
  const gap = projects.length === 0 ? 0 : (total - nodes * step) / projects.length;
  const node = (point: FleetPoint): ProjectGraphNode => ({ x: round(point.x), y: round(point.y), labelBelow: point.y >= center.y - 4 });
  // each project starts where the one before it ended
  const starts = projects.reduce<number[]>((list, project, index) => [...list, index === 0 ? gap / 2 : list[index - 1]! + Math.min(projects[index - 1]!.sessions, cap) * step + gap], []);

  const placed = projects.map((project, index): ProjectGraphProject => {
    const start = starts[index]!;
    const drawn = Math.min(project.sessions, cap);
    const folded = project.sessions > drawn;
    const spots = Array.from({ length: drawn }, (_, i) => node(at(start + (i + 0.5) * step)));
    const middle = at(start + (drawn * step) / 2);
    // neighbors alternate between two depths; the inner one's label faces the hub and the
    // outer one's faces the rim, so two neighbors' labels never share a line
    const inner = projects.length > 4 && index % 2 === 0;
    const reach = projects.length <= 4 ? 0.55 : inner ? (compact ? 0.48 : 0.46) : (compact ? 0.7 : 0.74);
    const spot = node({ x: center.x + (middle.x - center.x) * reach, y: center.y + (middle.y - center.y) * reach });
    return {
      key: project.key,
      ...spot,
      labelBelow: inner ? !spot.labelBelow : spot.labelBelow,
      sessions: folded ? spots.slice(0, -1) : spots,
      more: folded ? { ...spots[drawn - 1]!, count: project.sessions - drawn + 1 } : null,
      label: null,
    };
  });

  // A name goes under or over its node, on the first side that covers no other node, session
  // number or earlier name. Sessions fan out toward the rim and the hub sits the other way, so
  // on a small graph one side is often taken; with neither side clear the node keeps its number.
  const circles = [
    { ...center, r: HUB_CLEAR },
    ...placed.flatMap((project) => [{ x: project.x, y: project.y, r: PROJECT_RADIUS }, ...[...project.sessions, ...(project.more ? [project.more] : [])].map((spot) => ({ x: spot.x, y: spot.y, r: SESSION_RADIUS + SESSION_EXTRA }))]),
  ];
  const numbers = placed.flatMap((project) => project.sessions.map((spot) => labelBox(spot, SESSION_RADIUS, spot.labelBelow, SESSION_LABEL)));
  const named = placed.reduce<{ readonly taken: ReadonlyArray<Box>; readonly projects: ReadonlyArray<ProjectGraphProject> }>((done, project, index) => {
    const name = projects[index]!.label;
    if (!name) return { taken: done.taken, projects: [...done.projects, project] };
    const label = fitLabel(name, compact ? 60 : 104, LABEL_FONT);
    const textWidth = labelWidth(label, LABEL_FONT);
    const sides = [project.labelBelow, !project.labelBelow].map((below) => ({ below, box: labelBox(project, PROJECT_RADIUS, below, textWidth) }));
    const side = sides.find(({ box }) => box.left >= 0 && box.right <= width
      && !circles.some((circle) => (circle.x !== project.x || circle.y !== project.y) && covers(box, circle, circle.r + LABEL_GAP))
      && !done.taken.some((other) => overlaps(box, other)));
    if (!side) return { taken: done.taken, projects: [...done.projects, project] };
    return { taken: [...done.taken, side.box], projects: [...done.projects, { ...project, labelBelow: side.below, label }] };
  }, { taken: numbers, projects: [] });

  return { width, height: 2 * (ry + PAD), center, projects: named.projects };
}
