// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotRow.tsx (BotRowFoldToggle) and
// BotChatRowControls.tsx (FOLD_TOGGLE_CLASS); adapted for TermWeave.
import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import StatusIndicator from "../../ui/StatusIndicator.tsx";

const FOLD_TOGGLE_CLASS =
  "flex shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** The row's whole right edge, top to bottom, so it is easy to hit; a folded summary widens it leftward. */
export function BotFoldToggle({ botName, folded, working, liveMark, onToggle }: {
  botName: string;
  folded: boolean;
  /** The bot itself is working: the row's working mark sits here, on the strip. */
  working: boolean;
  /** The most urgent state of its workers, shown only while folded. */
  liveMark: "permission" | "working" | null;
  onToggle: () => void;
}): JSX.Element {
  const t = useT();
  const statusId = useId();
  // One mark: a folded worker's question outranks the bot's own work, which outranks the rest.
  const mark = folded && liveMark === "permission" ? "permission" : working ? "working" : folded ? liveMark : null;
  const label = folded ? t("Unfold {name}", { name: botName }) : t("Fold {name}", { name: botName });
  return (
    <button
      type="button"
      className={cn(
        FOLD_TOGGLE_CLASS,
        // Negative margins cancel the row's padding so the strip spans its full height and right
        // edge; the row's rounded overflow clips its corners.
        "-mt-1.25 -mr-1.5 -mb-1.25 min-w-10 gap-0.5 self-stretch rounded-none px-1.5 text-xs tabular-nums pointer-coarse:min-w-11",
        "focus-visible:ring-2 focus-visible:ring-inset",
        // A narrow row keeps more width for the name and time where a pointer can hover.
        "can-hover:pointer-fine:@max-[15rem]/bot-row:min-w-6 can-hover:pointer-fine:@max-[15rem]/bot-row:px-1"
      )}
      aria-label={label}
      aria-describedby={mark === "working" ? statusId : undefined}
      aria-expanded={!folded}
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {mark === "working" ? <span id={statusId} className="sr-only">{t("Working")}</span> : null}
      {mark ? <span className="flex items-center"><StatusIndicator status={mark} showTooltip={false} /></span> : null}
      <span className="flex size-4 items-center justify-center">
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            folded ? "-rotate-90" : "can-hover:opacity-0 group-hover/bot-row:opacity-100 [[class~='group/bot-row']:has(:focus-visible)_&]:opacity-100"
          )}
        />
      </span>
    </button>
  );
}
