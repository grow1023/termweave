import { useEffect, useState } from "react";

import type { BotsView } from "../../shared/bots/types.ts";

/**
 * The bots of this app's own server, kept current by the `bots-changed` push (App.tsx turns it
 * into a window event). null until the first answer, and stays null on a server without bots.
 */
export function useBotsView(): BotsView | null {
  const [view, setView] = useState<BotsView | null>(null);
  useEffect(() => {
    let live = true;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/bots", { cache: "no-store" });
        if (response.ok && live) setView(await response.json() as BotsView);
      } catch { /* the sidebar shows no bots; the bots page says why */ }
    };
    void load();
    const reload = (): void => { void load(); };
    window.addEventListener("termweave:bots-changed", reload);
    return () => { live = false; window.removeEventListener("termweave:bots-changed", reload); };
  }, []);
  return view;
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
