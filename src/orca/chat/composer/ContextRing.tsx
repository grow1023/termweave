// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/usage/NativeChatContextUsageRing.tsx; adapted for TermWeave.
import { useState } from "react";

import { cn } from "../../cn.ts";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover.tsx";
import { contextLeftPercent, formatTokens } from "../../../lib/compose.ts";
import { useT } from "../../../lib/i18n.ts";

const RING_SIZE = 16;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** TermWeave's threshold (Composer.tsx `is-low`): red when this much or less is left. */
const LOW_LEFT_PERCENT = 20;

/**
 * Orca's context ring. Decision: the card shows TermWeave's one line (left and used of window), not
 * Orca's per-source breakdown, which TermWeave's metadata does not carry; no hover delay timers, the
 * card opens on click or tap. The label keeps TermWeave's text. A window the transcript does not name
 * draws no ring (returns null), as TermWeave's ring does.
 */
export function ContextRing({ used, window }: { used: number; window: number | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const left = contextLeftPercent({ used, window });
  if (left === null || window === null) return null;
  const filled = Math.min(100, Math.max(0, 100 - left));
  const critical = left <= LOW_LEFT_PERCENT;
  const title = t("Context {percent}% left", { percent: left });
  const detail = t("{used} of {window} tokens", { used: formatTokens(used), window: formatTokens(window) });
  const label = `${title} · ${detail}`;
  return (
    <div className="flex">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={label}
            aria-expanded={open}
            data-native-chat-context-usage={filled}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11",
              critical && "text-destructive",
            )}
            // A read-only readout: clicking it must not pull focus out of the composer.
            onMouseDown={(event) => event.preventDefault()}
          >
            <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true" className="-rotate-90">
              <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth={RING_STROKE} className="opacity-25" />
              <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth={RING_STROKE}
                strokeLinecap="round" strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled / 100)} />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-label={label}
          side="top"
          align="end"
          sideOffset={8}
          className="w-72"
          onOpenAutoFocus={(event) => event.preventDefault()}
          // Closing on Escape would otherwise focus the ring and strand typing.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{title}</span>
              <span className="tabular-nums text-muted-foreground">{formatTokens(used)}/{formatTokens(window)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/20" role="progressbar" aria-label={label}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={filled}>
              <div className={cn("h-full rounded-full", critical ? "bg-destructive" : "bg-primary")} style={{ width: `${filled}%` }} />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
