/**
 * What the companion points out without being asked (SPEC F25 to F27): it only marks the orb. The checks
 * here are plain comparisons of what the terminals report, so watching costs no model call; a model
 * answers only when the owner opens a notice. Kinds: an agent waits for the owner, an agent has just
 * started (a moment to look for what could break), an agent has just finished (a moment to look back),
 * and the same error shows twice on the viewed terminal.
 */
import type { CompanionNotice } from "../shared/companion.ts";

export interface WatchedPane { pane_id: string; terminal: string; status: string }

const ERROR_LINE = /\b(error|failed|failure|exception|traceback|panic|cannot find|not found|denied)\b/i;
const KEPT_DISMISSALS = 200;

/** An error line without what changes between two runs of the same failure (numbers, hex, times). */
export function errorShape(line: string): string {
  return line.replace(/0x[0-9a-f]+|\d+/gi, "#").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** The first error line that shows at least twice in the text, in the shape it repeats in; null when none does. */
export function repeatedError(screen: string): { shape: string; line: string } | null {
  const seen = new Map<string, number>();
  for (const raw of screen.split("\n")) {
    const line = raw.trim();
    if (line.length < 12 || !ERROR_LINE.test(line)) continue;
    const shape = errorShape(line);
    const count = (seen.get(shape) ?? 0) + 1;
    if (count >= 2) return { shape, line: line.slice(0, 160) };
    seen.set(shape, count);
  }
  return null;
}

export class CompanionWatch {
  private last: ReadonlyMap<string, string> = new Map();
  /** how many times each terminal changed state: a notice of a later run is a new notice */
  private runs: ReadonlyMap<string, number> = new Map();
  private open: readonly CompanionNotice[] = [];
  private dismissed: readonly string[] = [];

  /** Takes what the project's terminals report now; answers the notices that stand. */
  observe(panes: readonly WatchedPane[], viewed: { pane_id: string; screen: string } | null): CompanionNotice[] {
    const live = new Set(panes.map((pane) => pane.pane_id));
    let open = this.open.filter((notice) => live.has(notice.pane_id));
    let runs = this.runs;
    for (const pane of panes) {
      const before = this.last.get(pane.pane_id);
      if (before === pane.status) continue;
      const run = (runs.get(pane.pane_id) ?? 0) + 1;
      runs = new Map([...runs, [pane.pane_id, run]]);
      // a state's notice ends with the state
      open = open.filter((notice) => notice.pane_id !== pane.pane_id || notice.kind === "repeated");
      const make = (kind: CompanionNotice["kind"]): CompanionNotice => ({ key: `${kind}:${pane.pane_id}:${run}`, kind, pane_id: pane.pane_id, terminal: pane.terminal });
      if (pane.status === "blocked") open = [...open, make("waiting")];
      // the first look at a terminal says nothing about a change
      else if (before !== undefined && pane.status === "working") open = [...open, make("started")];
      else if (before === "working" && pane.status === "done") open = [...open, make("finished")];
    }
    open = open.filter((notice) => notice.kind !== "repeated");
    if (viewed) {
      const pane = panes.find((each) => each.pane_id === viewed.pane_id);
      const repeat = pane ? repeatedError(viewed.screen) : null;
      if (pane && repeat) open = [...open, { key: `repeated:${pane.pane_id}:${repeat.shape}`, kind: "repeated", pane_id: pane.pane_id, terminal: pane.terminal, line: repeat.line }];
    }
    this.last = new Map(panes.map((pane) => [pane.pane_id, pane.status]));
    this.runs = runs;
    this.open = open;
    return open.filter((notice) => !this.dismissed.includes(notice.key));
  }

  dismiss(key: string): void {
    this.dismissed = [...this.dismissed.filter((each) => each !== key), key].slice(-KEPT_DISMISSALS);
  }
}
