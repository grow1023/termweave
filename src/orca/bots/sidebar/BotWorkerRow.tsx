// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotChatTreeWorkerRow.tsx and ActivityRowButton.tsx; adapted for TermWeave.
// One running worker under its bot: the state icon, "#n title" of its item (else its branch) and the time it has run.
import { useEffect, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import StatusIndicator from "../../ui/StatusIndicator.tsx";
import type { BotItem, BotWorker } from "../data.ts";
import { elapsedTick, formatElapsed } from "./bot-facts.ts";

/** The clock a worker's elapsed time reads: each second in its first minute, then once a minute (BOT-30). */
function useWorkerNow(started: number): number {
  const [now, setNow] = useState(() => Date.now());
  const interval = Number.isNaN(started) ? null : elapsedTick((now - started) / 1000);
  useEffect(() => {
    if (interval === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

/** A worker's state glyph: a spinner while it works, the question dot while it waits on the owner. */
function WorkerStateIcon({ worker }: { worker: BotWorker }): JSX.Element {
  return worker.status === "blocked"
    ? <span className="block size-[7px] rounded-full bg-agent-question" />
    : <StatusIndicator status="working" showTooltip={false} />;
}

export function BotWorkerRow({ worker, item, selected, onOpen }: { worker: BotWorker; item: BotItem | null; selected: boolean; onOpen: () => void }): JSX.Element {
  const t = useT();
  const label = item ? `#${item.n} ${item.title}` : worker.branch;
  const started = Date.parse(worker.startedAt);
  const now = useWorkerNow(started);
  const elapsed = Number.isNaN(started) ? null : formatElapsed((now - started) / 1000);
  return (
    <div className="group/worker flex w-full min-w-0 items-start gap-1 rounded-sm hover:bg-accent has-[[data-state=open]]:bg-accent">
      <button
        type="button"
        title={label}
        aria-current={selected ? "true" : undefined}
        aria-label={worker.status === "blocked" ? t("{label}, needs you", { label }) : label}
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-left focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-11",
          "@max-[240px]:gap-1.5 @max-[240px]:px-1",
          selected && "bg-accent"
        )}
      >
        <span className="flex h-5 w-4 shrink-0 items-center justify-center">
          <WorkerStateIcon worker={worker} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-normal text-foreground">{label}</span>
            {elapsed ? <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{elapsed}</span> : null}
          </span>
        </span>
      </button>
    </div>
  );
}
