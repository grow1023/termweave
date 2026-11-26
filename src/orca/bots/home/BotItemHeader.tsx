// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemHeader.tsx; adapted for TermWeave.
// The open item's top: its number and title, then its status with the menu that changes it (no links, no snooze).
import { Check, ChevronDown } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../ui/dropdown-menu.tsx";
import { BotItemStatusIcon } from "../BotItemStatusIcon.tsx";
import type { BotItem } from "../data.ts";
import { isClosed, statusName } from "./bot-item-status-name.ts";

export type ItemChange = "done" | "canceled" | "planned";

function StatusMenu({ item, live, disabled, onStatus }: { item: BotItem; live: boolean; disabled: boolean; onStatus: (to: ItemChange) => void }) {
  const t = useT();
  const closed = isClosed(item);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="-ml-1.5 min-w-0 shrink pointer-coarse:h-11" disabled={disabled}>
          <BotItemStatusIcon status={item.status} live={live} />
          {/* Cut before the row's other controls are, in the narrowest pane. */}
          <span className="min-w-0 truncate">{statusName(item.status, t)}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={item.status === "done"} onSelect={() => onStatus("done")}>
          <span className="flex w-4 justify-center"><BotItemStatusIcon status="done" /></span>
          <span className="flex-1">{t("Done")}</span>
          {item.status === "done" ? <Check className="size-3" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={item.status === "canceled"} onSelect={() => onStatus("canceled")}>
          <span className="flex w-4 justify-center"><BotItemStatusIcon status="canceled" /></span>
          <span className="flex-1">{t("Cancel")}</span>
          {item.status === "canceled" ? <Check className="size-3" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!closed} onSelect={() => onStatus("planned")}>
          <span className="flex w-4 justify-center"><BotItemStatusIcon status="planned" /></span>
          <span className="flex-1">{t("Reopen")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BotItemHeader({ item, live, disabled, onStatus }: { item: BotItem; live: boolean; disabled: boolean; onStatus: (to: ItemChange) => void }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border/60 px-3.5 pt-1 pb-2.5">
      <h2 title={item.title} className="line-clamp-2 break-words text-[15px] font-semibold leading-[21px] text-foreground [@media(max-height:620px)]:line-clamp-1">
        <span className="font-normal tabular-nums text-muted-foreground">{`#${item.n}`}</span> {item.title}
      </h2>
      <div className="flex min-w-0 items-center gap-1">
        <StatusMenu item={item} live={live} disabled={disabled} onStatus={onStatus} />
      </div>
    </div>
  );
}
