// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/tasks/dock/
// WorkerDockRow.tsx, WorkerDockGlyph.tsx, worker-dock-card-order.ts and worker-dock-labels.ts; adapted for TermWeave.
// Left out: Stop and Clear (TermWeave has no such call), kinds other than worker, remote owners.
import { memo } from "react";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";

import { botAge } from "../../../components/BotVisuals.tsx";
import { useLocale, useT, type Translate } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { AgentWorkingSpinner } from "../../ui/AgentWorkingSpinner.tsx";
import { useNow } from "../../bots/home/use-now.ts";
import type { BotWorker, BotWorkerStatus } from "../../bots/data.ts";

export type WorkerGlyph = "ask" | "failed" | "running" | "done";

export function workerGlyph(status: BotWorkerStatus): WorkerGlyph {
  switch (status) {
    case "blocked": return "ask";
    case "failed": return "failed";
    case "starting":
    case "working": return "running";
    case "done": return "done";
  }
}

// A person waiting outranks a failure, which outranks live work; finished work sinks to the end.
const TIER: Record<WorkerGlyph, number> = { ask: 0, failed: 1, running: 2, done: 3 };

export function workerChangedAt(worker: BotWorker): number | null {
  const at = Date.parse(worker.endedAt ?? worker.startedAt);
  return Number.isFinite(at) ? at : null;
}

/** The card's order, and the pill's pick (its first row): needs-you, failed, running, done; newest first. */
export function compareWorkers(a: BotWorker, b: BotWorker): number {
  const aAt = workerChangedAt(a);
  const bAt = workerChangedAt(b);
  return TIER[workerGlyph(a.status)] - TIER[workerGlyph(b.status)]
    || Number(aAt === null) - Number(bAt === null)
    || (bAt ?? 0) - (aAt ?? 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function workerStateLabel(t: Translate, status: BotWorkerStatus): string {
  switch (status) {
    case "starting": return t("Starting");
    case "working": return t("Running");
    case "blocked": return t("Waiting on you");
    case "done": return t("Done");
    case "failed": return t("Failed");
  }
}

/** What a row and the pill call the worker: the first line of its task, else its branch. */
export function workerTitle(worker: BotWorker): string {
  return worker.spec.split("\n").map((line) => line.trim()).find(Boolean) ?? worker.branch;
}

/** One 12px status mark. The row's label carries the state, so the mark itself is decorative. */
export function WorkerDockGlyph({ glyph }: { glyph: WorkerGlyph }) {
  return (
    <span aria-hidden="true" data-worker-dock-glyph={glyph} className="inline-flex size-3 shrink-0 items-center justify-center">
      {glyph === "ask" ? (
        <MessageCircleQuestion aria-hidden="true" className="size-3 text-agent-question" />
      ) : glyph === "running" ? (
        <AgentWorkingSpinner className="size-2.5" />
      ) : (
        <span className={cn("block size-2 rounded-full", glyph === "failed" && "bg-destructive", glyph === "done" && "bg-status-success")} />
      )}
    </span>
  );
}

function Age({ at }: { at: number | null }) {
  const locale = useLocale();
  const now = useNow(30_000);
  if (at === null) return null;
  return (
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={new Date(at).toLocaleString(locale)}>
      {botAge(new Date(at).toISOString(), now)}
    </span>
  );
}

/** One 30px card row: status mark, title, time; on hover or focus an arrow covers the time.
 *  The open button stretches over the whole row. A worker with no terminal cannot be opened. */
export const WorkerDockRow = memo(function WorkerDockRow({ worker, onOpen }: { worker: BotWorker; onOpen: (worker: BotWorker) => void }) {
  const t = useT();
  const title = workerTitle(worker);
  const state = workerStateLabel(t, worker.status);
  const reason = worker.status === "failed" && worker.result ? worker.result : "";
  const label = [title, state, reason].filter(Boolean).join(" · ");
  const tooltip = [worker.branch, title, state, reason].filter(Boolean).join(" · ");
  const openable = worker.paneId !== null;
  return (
    <div
      data-worker-dock-row={worker.id}
      data-worker-dock-state={worker.status}
      className="group/worker relative flex h-[30px] min-w-0 items-center rounded-md pr-2 text-foreground hover:bg-accent has-focus-visible:bg-accent pointer-coarse:h-11"
    >
      <button
        type="button"
        data-worker-dock-open={worker.id}
        aria-label={label}
        aria-disabled={openable ? undefined : true}
        title={tooltip}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2 text-left text-sm after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring aria-disabled:text-muted-foreground"
        onClick={() => {
          if (openable) onOpen(worker);
        }}
      >
        <WorkerDockGlyph glyph={workerGlyph(worker.status)} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Age at={workerChangedAt(worker)} />
      </button>
      {openable ? (
        <div
          data-worker-dock-hover=""
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 rounded-r-md bg-accent pr-2 pl-1.5 opacity-0 group-hover/worker:opacity-100 group-focus-within/worker:opacity-100 [@media(pointer:coarse)]:opacity-100"
        >
          <ArrowRight aria-hidden="true" data-worker-dock-arrow="" className="pointer-events-none size-3 shrink-0 text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
});
