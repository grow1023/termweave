/**
 * A note for each terminal: one Markdown text, keyed by terminal_id (a pane number is reused).
 * The owner replaces the whole text. An agent or a bot sets one task line done or not done, or
 * appends one line under AGENT_LOG_HEADING. The text is data: nothing here runs or follows it.
 *
 * Pure helpers with no runtime imports: the server and the screen both use them.
 *
 * Line numbers are 1-based indexes into `text.split("\n")` (a trailing "\r" is tolerated).
 * A task line is `- [ ] text`, `- [x] text` or `- [X] text` (also `*` or `+`, any indentation),
 * outside a fenced code block (``` or ~~~). `NoteTask.text` is the trimmed text after the box;
 * that is the text a task change must name as `expect_text`.
 */

export const PANE_NOTE_MAX = 40_000;
export const PANE_NOTE_LINE_MAX = 2_000;
export const AGENT_LOG_HEADING = "## Agent log";

export interface PaneNote { terminal_id: string; text: string; revision: number; updated_at: string | null }
/** What a folded note shows: how many task lines are open and done, and the first open one. */
export interface PaneNoteSummary { terminal_id: string; open: number; done: number; next: string | null; revision: number }
export interface NoteTask { line: number; done: boolean; text: string }

const TASK = /^(\s*[-*+]\s+\[)([ xX])(\](?:\s+(.*))?)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Each line without its "\r", and whether it sits inside a fenced code block (fence lines count
 * as inside), plus the fence still open at the end of the text, if any.
 */
function scanAll(text: string): { lines: { body: string; fenced: boolean }[]; open: string | null } {
  let open: string | null = null;
  const lines = text.split("\n").map((raw) => {
    const body = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const fence = FENCE.exec(body)?.[1];
    if (fence === undefined) return { body, fenced: open !== null };
    if (open === null) { open = fence; return { body, fenced: true }; }
    // a closing fence uses the opening character, at least as many times, and nothing after it
    if (fence[0] === open[0] && fence.length >= open.length && body.trim() === fence) open = null;
    return { body, fenced: true };
  });
  return { lines, open };
}
const scan = (text: string): { body: string; fenced: boolean }[] => scanAll(text).lines;

export function noteTasks(text: string): NoteTask[] {
  return scan(text).flatMap(({ body, fenced }, index) => {
    const match = fenced ? null : TASK.exec(body);
    return match ? [{ line: index + 1, done: match[2] !== " ", text: (match[4] ?? "").trim() }] : [];
  });
}

export function noteSummary(note: PaneNote): PaneNoteSummary {
  const tasks = noteTasks(note.text);
  const open = tasks.filter((task) => !task.done);
  return { terminal_id: note.terminal_id, open: open.length, done: tasks.length - open.length, next: open[0]?.text ?? null, revision: note.revision };
}

/** The text with task line `line` set done or not done; null when that line is not a task line. */
export function setTaskDone(text: string, line: number, done: boolean): string | null {
  if (!Number.isSafeInteger(line) || line < 1) return null;
  const lines = scan(text);
  const target = lines[line - 1];
  if (target === undefined || target.fenced) return null;
  const match = TASK.exec(target.body);
  if (!match) return null;
  const current = match[2] !== " ";
  if (current === done) return text;
  const raw = text.split("\n");
  const ending = raw[line - 1]!.endsWith("\r") ? "\r" : "";
  // only the box character changes: the owner's words stay exactly as written
  const next = `${match[1]}${done ? "x" : " "}${match[3]}${ending}`;
  return raw.map((value, index) => (index === line - 1 ? next : value)).join("\n");
}

/** One line of plain text: control characters and newlines become spaces, runs of space shrink. */
function oneLine(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/** The text with one line appended under AGENT_LOG_HEADING (the heading is added at the end when absent). */
export function appendAgentLine(text: string, author: string, line: string, at: string): string {
  const label = oneLine(author).replace(/\[/g, "(").replace(/\]/g, ")");
  const entry = `- ${oneLine(at)} [${label}] ${oneLine(line)}`;
  const { lines, open } = scanAll(text);
  const heading = lines.findIndex(({ body, fenced }) => !fenced && body.trimEnd() === AGENT_LOG_HEADING);
  if (heading === -1) {
    // a code block the owner left open would swallow the heading: close it first (an addition only)
    const base = `${text.replace(/\s+$/, "")}${open === null ? "" : `\n${open}`}`;
    return `${base === "" ? "" : `${base}\n\n`}${AGENT_LOG_HEADING}\n${entry}\n`;
  }
  // the section runs to the next heading of level 1 or 2 outside a fence
  const after = lines.findIndex(({ body, fenced }, index) => index > heading && !fenced && /^#{1,2}\s/.test(body));
  const end = after === -1 ? lines.length : after;
  let last = heading;
  for (let index = heading + 1; index < end; index++) if (lines[index]!.body.trim() !== "") last = index;
  const raw = text.split("\n");
  const inserted = [...raw.slice(0, last + 1), entry, ...raw.slice(last + 1)];
  const joined = inserted.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}
