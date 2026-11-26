// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemRow.tsx; adapted for TermWeave.
// Hover or keyboard focus swaps the age for Done and More. No checkbox, Snooze, hover card or unread dot here.
import { Check, CircleCheck, CircleSlash, MoreHorizontal, RotateCcw } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { botAge } from "../../../components/BotVisuals.tsx";
import { cn } from "../../cn.ts";
import { Button } from "../../ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { BotItemStatusIcon } from "../BotItemStatusIcon.tsx";
import type { BotItem } from "../data.ts";
import { ageText } from "./bot-when.ts";
import { isClosed } from "./bot-item-status-name.ts";

const ROW_ACTION_OVERLAY = "absolute right-1 top-0.5 items-center bg-[linear-gradient(to_right,transparent,var(--accent)_16px)] pl-[18px]";

export type BotItemRowAction = "open" | "done" | "cancel" | "reopen";

/** An item's muted `#35` before a row's title, as wide as the list's widest number (`--bot-item-number-chars`). */
function NumberColumn({ number }: { number: number }) {
  return (
    <span className="min-w-[calc(var(--bot-item-number-chars,3)*1ch+0.375rem)] shrink-0 pr-1.5 text-[13px] leading-5 tabular-nums text-muted-foreground">
      {`#${number}`}
    </span>
  );
}

export function BotItemRow({ item, live, readOnly, busy, onAction }: {
  item: BotItem;
  /** A worker is running for it: the glyph spins. */
  live: boolean;
  readOnly: boolean;
  busy: boolean;
  onAction: (item: BotItem, action: BotItemRowAction) => void;
}) {
  const t = useT();
  const closed = isClosed(item);
  const doneLabel = t("Done");
  const age = ageText(botAge(item.updatedAt), t);
  return (
    <div
      role="listitem"
      data-bot-item={item.n}
      className="group/item relative flex min-w-0 items-start gap-2 rounded-sm px-2 py-1 hover:bg-accent has-[:focus-visible]:bg-accent has-[[aria-expanded=true]]:bg-accent has-[[data-state=open]]:bg-accent"
    >
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        <BotItemStatusIcon status={item.status} live={live} />
      </span>
      <button
        type="button"
        data-bot-item-open=""
        title={item.title}
        className="min-w-0 flex-1 cursor-pointer rounded-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pointer-coarse:py-2.5"
        onClick={() => onAction(item, "open")}
      >
        <span className="flex min-w-0 items-start">
          <NumberColumn number={item.n} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn("min-w-0 flex-1 truncate text-[13px] leading-5", closed ? "text-muted-foreground" : "text-foreground")}>{item.title}</span>
              {/* The age gives its place up to the actions on hover or focus. */}
              <span className={cn("flex shrink-0 items-center gap-2", !readOnly && "group-has-[:focus-visible]/item:invisible group-hover/item:invisible group-has-[[aria-expanded=true]]/item:invisible")}>
                <span className="text-xs tabular-nums text-muted-foreground @max-[284px]:hidden">{age}</span>
              </span>
            </span>
          </span>
        </span>
      </button>
      {readOnly ? null : (
        // Keep actions in the tab order so focus can move from the title to an action.
        <span className={cn(ROW_ACTION_OVERLAY, "pointer-events-none flex gap-0.5 opacity-0 group-has-[:focus-visible]/item:pointer-events-auto group-has-[:focus-visible]/item:opacity-100 group-hover/item:pointer-events-auto group-hover/item:opacity-100 has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100")}>
          {closed ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost-on-accent" size="icon-xs" aria-label={doneLabel} disabled={busy} onClick={() => onAction(item, "done")}>
                  <Check className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>{doneLabel}</TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost-on-accent" size="icon-xs" aria-label={t("More")} disabled={busy}>
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.status === "done" ? null : (
                <DropdownMenuItem onSelect={() => onAction(item, "done")}>
                  <CircleCheck />
                  {t("Done")}
                </DropdownMenuItem>
              )}
              {item.status === "canceled" ? null : (
                <DropdownMenuItem onSelect={() => onAction(item, "cancel")}>
                  <CircleSlash />
                  {t("Cancel")}
                </DropdownMenuItem>
              )}
              {closed ? (
                <DropdownMenuItem onSelect={() => onAction(item, "reopen")}>
                  <RotateCcw />
                  {t("Reopen")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </div>
  );
}
