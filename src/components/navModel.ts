/**
 * Pure rules of the app shell and its navigation: what waits on the user (pane prompts and bot
 * questions, counted once), what the command palette lists across every PC, the folder the new
 * session dialog starts in, and the order in-app alerts take. Kept apart from the components so
 * bun:test covers them without a browser.
 */
import type { BotsView } from "../../shared/bots/types.ts";
import { paneStorageId, type Machine } from "../../shared/machines.ts";
import type { PaneInfo, WorkspaceInfo } from "../../shared/protocol.ts";
import type { DropletKind } from "../lib/droplet.ts";
import { panesNeedingInput } from "../lib/needsInput.ts";
import { rankPanes, type SearchPane } from "../lib/paletteSearch.ts";

/**
 * A bot waiting on its owner: `count` questions or approvals on its items, or (count 0) a session bot
 * whose chat waits on a permission or a question. The bots run on this app's own PC.
 */
export interface BotQuestion { botId: string; name: string; agent: string; paneId: string | null; count: number }

export function botQuestions(view: BotsView | null): BotQuestion[] {
  if (!view) return [];
  return view.bots.flatMap((bot) => {
    const count = view.items.filter((item) => item.botId === bot.id && item.status === "needs_you").length;
    // a session bot has no pane to show as blocked: its waiting chat is its row here
    const chat = view.chatStatus?.[bot.id];
    const chatWaits = bot.runtime === "session" && !bot.paused && (chat === "blocked" || chat === "waiting");
    return count > 0 || chatWaits ? [{ botId: bot.id, name: bot.name, agent: bot.agent, paneId: bot.paneId, count }] : [];
  });
}

/**
 * Everything in "Needs you": blocked panes, and one row per bot with questions. A bot's own pane
 * that is also blocked is the same wait, so its pane row gives way to the bot row.
 */
export function needsYou(machines: readonly Machine[], view: BotsView | null): { panes: ReturnType<typeof panesNeedingInput>; bots: BotQuestion[]; total: number } {
  const bots = botQuestions(view);
  const botPanes = new Set(bots.flatMap((bot) => bot.paneId ? [bot.paneId] : []));
  const panes = panesNeedingInput(machines).filter(({ machine, pane }) => !(machine.kind === "local" && botPanes.has(pane.pane_id)));
  return { panes, bots, total: panes.length + bots.length };
}

/** The shell's selection as each window keeps it across reloads (App.tsx, sessionStorage then localStorage). */
export interface StoredSelection { machine_id?: string; pane_id?: string | null; owner_id?: string | null; workspace_id?: string | null; bot_id?: string | null }

/**
 * The session bot whose page opens on load: the address's `?bot=` first; a `?pane=` (a tapped
 * notification) opens that pane instead; else the bot page this window or the last one showed.
 */
export function initialBotId(search: string, stored: StoredSelection | null): string | null {
  const query = new URLSearchParams(search);
  const fromUrl = query.get("bot");
  if (fromUrl) return fromUrl;
  if (query.has("pane")) return null;
  return typeof stored?.bot_id === "string" && stored.bot_id !== "" ? stored.bot_id : null;
}

/** The address's query with `?bot=` naming the open bot page, or without it; other parameters stay. */
export function searchWithBot(search: string, botId: string | null): string {
  const query = new URLSearchParams(search);
  if (botId === null) query.delete("bot"); else query.set("bot", botId);
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * What the shell does with a selected bot page: nothing selected, wait for the bots, show the page,
 * or let it go because the bot now runs in a terminal (`pane`) or no longer exists (`gone`).
 */
export type BotPageState = "none" | "wait" | "show" | "pane" | "gone";
export function botPageState(view: BotsView | null, botId: string | null): BotPageState {
  if (botId === null) return "none";
  if (view === null) return "wait";
  const bot = view.bots.find((entry) => entry.id === botId);
  if (!bot) return "gone";
  return bot.runtime === "session" ? "show" : "pane";
}

/** One pane in the command palette, from any connected PC. */
export interface PaletteEntry { key: string; machineId: string; machineName: string; pane: PaneInfo; workspaceLabel: string | null }

/** Offline PCs show cached rosters that cannot be opened: the palette lists connected PCs only. */
export function paletteEntries(machines: readonly Machine[]): PaletteEntry[] {
  return machines.flatMap((machine) => {
    if (machine.state !== "connected" || !machine.snapshot) return [];
    const labels = new Map(machine.snapshot.workspaces.map((workspace) => [workspace.workspace_id, workspace.label]));
    return machine.snapshot.panes.map((pane) => ({
      key: paneStorageId(machine.id, pane.pane_id), machineId: machine.id, machineName: machine.name, pane,
      workspaceLabel: labels.get(pane.workspace_id) ?? null,
    }));
  });
}

/**
 * Fuzzy search over every PC at once. Workspace ids repeat across PCs, so each pane is searched
 * under a workspace id made unique by its PC (only the search sees that id).
 */
export function searchPalette(query: string, entries: readonly PaletteEntry[]): PaletteEntry[] {
  const byPane = new Map<SearchPane, PaletteEntry>();
  const workspaces: WorkspaceInfo[] = [];
  const panes = entries.map((entry) => {
    const workspaceId = `${entry.machineId}\u0000${entry.pane.workspace_id}`;
    const pane: SearchPane = { ...entry.pane, workspace_id: workspaceId };
    byPane.set(pane, entry);
    if (entry.workspaceLabel !== null) workspaces.push({ workspace_id: workspaceId, label: entry.workspaceLabel } as WorkspaceInfo);
    return pane;
  });
  return rankPanes(query, panes, workspaces).flatMap((pane) => byPane.get(pane) ?? []);
}

/** recent panes shown before typing; the full list waits for a query */
export const PALETTE_RECENT_SHOWN = 5;

/**
 * Before typing: what waits on the user first, then the few panes opened last. `recent` gives
 * each entry key its rank (0 = most recent); ranks of different PCs interleave.
 */
export function paletteStart(entries: readonly PaletteEntry[], recent: ReadonlyMap<string, number>): { waiting: PaletteEntry[]; recent: PaletteEntry[] } {
  const waiting = entries.filter((entry) => entry.pane.agent_status === "blocked");
  const rest = entries.filter((entry) => entry.pane.agent_status !== "blocked");
  const ranked = rest.filter((entry) => recent.has(entry.key)).sort((a, b) => recent.get(a.key)! - recent.get(b.key)!);
  // a first visit has no history: the list starts with the panes in their PC order
  const shown = ranked.length > 0 ? ranked : rest;
  return { waiting, recent: shown.slice(0, PALETTE_RECENT_SHOWN) };
}

/** The folder name the create button names: the last part of the typed path, `~` for home. */
export function createFolderName(cwd: string): string | null {
  const typed = cwd.trim();
  if (typed === "") return null;
  const trimmed = typed.replace(/\/+$/, "");
  if (trimmed === "") return "/";
  if (trimmed === "~") return "~";
  return trimmed.split("/").pop() || "/";
}

/** The last two folders of a path, for the header line; the full path stays in its tooltip. */
export function shortCwd(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

/** how long an in-app alert stays once its text shows: a waiting agent longer than a finished one */
export const DROPLET_HOLD_MS = 3600;
export const DROPLET_BLOCKED_HOLD_MS = 12_000;
export const DROPLET_QUEUE_MAX = 3;

export function dropletHold(kind: DropletKind): number {
  return kind === "blocked" ? DROPLET_BLOCKED_HOLD_MS : DROPLET_HOLD_MS;
}

/** Alerts that wait their turn: at most three, and a full queue drops its oldest finished one first. */
export function queueDroplet<T extends { kind: DropletKind }>(queue: readonly T[], notice: T, max = DROPLET_QUEUE_MAX): T[] {
  const next = [...queue, notice];
  if (next.length <= max) return next;
  const drop = next.findIndex((item) => item.kind !== "blocked");
  const at = drop >= 0 ? drop : 0;
  return [...next.slice(0, at), ...next.slice(at + 1)];
}

/** The next alert to show: the oldest waiting agent first, else the oldest of the rest. */
export function takeDroplet<T extends { kind: DropletKind }>(queue: readonly T[]): { next: T | null; rest: T[] } {
  if (queue.length === 0) return { next: null, rest: [] };
  const blocked = queue.findIndex((item) => item.kind === "blocked");
  const at = blocked >= 0 ? blocked : 0;
  return { next: queue[at]!, rest: [...queue.slice(0, at), ...queue.slice(at + 1)] };
}
