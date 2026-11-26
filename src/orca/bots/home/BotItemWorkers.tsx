// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemLinkChips.tsx; adapted for TermWeave.
// The workers linked to an item: each is an agent in its own terminal, and a click opens that terminal.
import { ExternalLink } from "lucide-react";

import { type Translate, useT } from "../../../lib/i18n.ts";
import { ACTIVE_WORKER, openLocalPane, type BotWorker, type BotWorkerStatus } from "../data.ts";
import { AgentWorkingSpinner } from "../../ui/AgentWorkingSpinner.tsx";

function workerStatus(status: BotWorkerStatus, t: Translate): string {
  switch (status) {
    case "starting": return t("Starting");
    case "working": return t("Working");
    case "blocked": return t("Blocked");
    case "done": return t("Done");
    case "failed": return t("Failed");
  }
}

export function BotItemWorkers({ workers }: { workers: readonly BotWorker[] }) {
  const t = useT();
  if (workers.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-xs text-muted-foreground">{t("Workers")}</h3>
      <div role="list" aria-label={t("Workers")} className="-mx-2 flex flex-col">
        {workers.map((worker) => {
          const name = worker.branch || worker.id;
          const status = workerStatus(worker.status, t);
          const paneId = worker.paneId;
          return (
            <div key={worker.id} role="listitem">
              <button
                type="button"
                disabled={paneId === null}
                title={worker.spec}
                aria-label={t("Open terminal of {name}", { name })}
                onClick={() => paneId !== null && openLocalPane(paneId)}
                className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1 text-left text-[13px] leading-5 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 pointer-coarse:min-h-11"
              >
                <span aria-hidden className="flex h-5 w-4 shrink-0 items-center justify-center">
                  {ACTIVE_WORKER.has(worker.status) ? <AgentWorkingSpinner className="size-2.5 shrink-0" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{`${worker.agent} · ${name}`}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{status}</span>
                <ExternalLink aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
