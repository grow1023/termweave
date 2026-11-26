/**
 * Bots: an agent session in its own home folder that takes jobs from its chat and from schedules,
 * hands code work to worker agents in their own git worktrees, and keeps the owner's view in items.
 * The design follows Orca Bots (stablyai/orca, MIT): the item statuses are Orca's.
 */

export type BotAgent = "claude" | "codex";
export const BOT_AGENTS: readonly BotAgent[] = ["claude", "codex"];

export interface Bot {
  id: string;
  name: string;
  agent: BotAgent;
  /** the bot's home folder: SOUL.md, MEMORY.md, its instructions and its workers' worktrees */
  home: string;
  /** the project its code work goes to unless a job names another */
  repo: string | null;
  paused: boolean;
  /** the herdr pane its chat runs in, while it runs */
  paneId: string | null;
  createdAt: string;
  /** its picture, `mascot:<id>` (shared/bots/avatar.ts); a bot from before pictures gets one by its id */
  avatar?: string | null;
  /** the picture's tile color, `#rrggbb` */
  avatarColor?: string | null;
  /** what it is for, as given when it was made: the sidebar's line while it has nothing to say */
  purpose?: string;
}

export type BotItemStatus = "planned" | "working" | "waiting" | "needs_you" | "done" | "canceled";
export const BOT_ITEM_STATUSES: readonly BotItemStatus[] = ["planned", "working", "waiting", "needs_you", "done", "canceled"];
export const BOT_ITEM_OPEN: ReadonlySet<BotItemStatus> = new Set(["planned", "working", "waiting", "needs_you"]);

export interface BotItemComment { at: string; by: "bot" | "owner"; text: string }

/** One deliverable or decision the owner cares about: where they check how work stands. */
export interface BotItem {
  botId: string;
  n: number;
  title: string;
  doneMeans: string | null;
  status: BotItemStatus;
  /** with needs_you: the question and the answers to pick from */
  ask: string | null;
  options: string[];
  /** with waiting: what it waits on */
  waitingOn: string | null;
  comments: BotItemComment[];
  /** a terminal action the bot asked for: it runs only when the owner picks APPROVE */
  action?: BotPaneAction | null;
  createdAt: string;
  updatedAt: string;
}

/** What a bot may do to a terminal it did not start, once its owner approves. */
export type BotPaneAction =
  | { kind: "send"; paneId: string; where: string; text: string }
  | { kind: "keys"; paneId: string; where: string; keys: string[] }
  | { kind: "close"; paneId: string; where: string };

export const APPROVE = "Approve";
export const DENY = "Deny";

/** One terminal of this computer as `tw-bot pane list` shows it. */
export interface BotPaneEntry {
  paneId: string;
  workspace: string;
  title: string | null;
  cwd: string | null;
  agent: string | null;
  status: string;
  /** "you", "worker <id>", "bot <name>", or null for the owner's own terminals */
  owner: string | null;
}

export interface BotSchedule {
  /** a 5-field cron line, or an RRULE without its "RRULE:" prefix (shared/bots/schedule) */
  value: string;
  /** the first moment a run may fire */
  dtstart: string;
  /** an IANA zone such as "Asia/Seoul"; null is the server's clock */
  timezone: string | null;
}

export interface BotAutomation {
  id: string;
  botId: string;
  name: string;
  prompt: string;
  schedule: BotSchedule;
  enabled: boolean;
  /** run once, then turn off */
  once: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export type BotWorkerStatus = "starting" | "working" | "blocked" | "done" | "failed";

export interface BotWorker {
  id: string;
  botId: string;
  itemN: number | null;
  agent: BotAgent;
  repo: string;
  worktree: string;
  branch: string;
  paneId: string | null;
  spec: string;
  status: BotWorkerStatus;
  /** why it failed, or the last lines it wrote when it finished */
  result: string | null;
  startedAt: string;
  endedAt: string | null;
}

/** What GET /api/bots returns: everything the bots page shows. */
export interface BotsView {
  bots: Bot[];
  items: BotItem[];
  automations: BotAutomation[];
  workers: BotWorker[];
}
