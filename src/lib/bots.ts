import { useSyncExternalStore } from "react";

import type { BotsView } from "../../shared/bots/types.ts";

/**
 * The bots of this app's own server, shared by every surface that shows them (sidebar group,
 * bot bar, chat-first view): one fetch, refreshed by the `bots-changed` push (App.tsx turns it
 * into a window event). null until the first answer, and stays null on a server without bots.
 */
let current: BotsView | null = null;
const listeners = new Set<() => void>();
let loading = false;
let again: Promise<void> | null = null;

/**
 * Reads the bots view again. A call while a read runs asks for one more read after it and resolves
 * when that one is in, so a caller that awaits always has an answer newer than its call.
 */
export async function reloadBots(): Promise<void> {
  if (loading) {
    again ??= new Promise<void>((resolve) => { afterLoad = resolve; }).then(reloadBots);
    return again;
  }
  loading = true;
  try {
    const response = await fetch("/api/bots", { cache: "no-store" });
    if (response.ok) { current = await response.json() as BotsView; for (const listener of listeners) listener(); }
  } catch { /* the sidebar shows no bots; the bots page says why */ } finally {
    loading = false;
    const next = afterLoad;
    afterLoad = null;
    again = null;
    next?.();
  }
}
let afterLoad: (() => void) | null = null;

const onChanged = (): void => { void reloadBots(); };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) { window.addEventListener("termweave:bots-changed", onChanged); void reloadBots(); }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("termweave:bots-changed", onChanged);
  };
}

export function useBotsView(): BotsView | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** The bots as last fetched, for code that runs outside a render (an event handler right after a change). */
export function currentBotsView(): BotsView | null {
  return current;
}

/** Workspaces the sidebar's bots group stands for: each bot's chat, and the workers still at work. */
export function botWorkspaceIds(view: BotsView | null, panes: ReadonlyArray<{ pane_id: string; workspace_id: string }>): Set<string> {
  if (!view) return new Set();
  const owned = new Set<string>([
    ...view.bots.flatMap((bot) => bot.paneId ? [bot.paneId] : []),
    ...view.workers.flatMap((worker) => worker.paneId && ACTIVE_WORKER.has(worker.status) ? [worker.paneId] : []),
  ]);
  return new Set(panes.filter((pane) => owned.has(pane.pane_id)).map((pane) => pane.workspace_id));
}

/** a finished worker's workspace goes back to the normal list, where it is read and closed as any other */
export const ACTIVE_WORKER: ReadonlySet<string> = new Set(["starting", "working", "blocked"]);

/**
 * Asks App to open a bot where it now runs: a session bot's page, or a terminal bot's chat pane
 * (started when it is not running). Bot settings use it after switching how the bot runs.
 */
export function openBotWhereItRuns(botId: string): void {
  window.dispatchEvent(new CustomEvent("termweave:open-bot", { detail: { botId } }));
}

/** Asks App to open a pane of this PC (the bot bar's worker rows). */
export function openLocalPane(paneId: string): void {
  window.dispatchEvent(new CustomEvent("termweave:open-pane", { detail: { machineId: "local", paneId } }));
}
