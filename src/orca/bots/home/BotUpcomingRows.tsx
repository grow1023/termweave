// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotUpcomingRows.tsx and BotPanelRow.tsx; adapted for TermWeave.
// An automation's row: its state as the leading icon, its name, its next run said short. Pause or Resume and
// the More menu (Run now, Remove) show on hover or focus.
import { CalendarClock, CirclePlay, Hourglass, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";

import { useLocale, useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Button } from "../../ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { botsApi, type BotAutomation } from "../data.ts";
import { whenShort } from "./bot-when.ts";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

const ICON = "size-3.5 text-muted-foreground";
const HOVER_ACTIONS =
  "absolute right-1 top-0.5 items-center bg-[linear-gradient(to_right,transparent,var(--accent)_16px)] pl-[18px] hidden group-has-[:focus-visible]/item:flex group-hover/item:flex gap-0.5 has-[[data-state=open]]:flex";

function RowIcon({ automation }: { automation: BotAutomation }) {
  if (!automation.enabled) return <Pause aria-hidden className={ICON} />;
  return automation.once ? <Hourglass aria-hidden className={ICON} /> : <CalendarClock aria-hidden className={ICON} />;
}

export function AutomationRow({ botId, automation, now, readOnly }: { botId: string; automation: BotAutomation; now: number; readOnly: boolean }) {
  const t = useT();
  const locale = useLocale();
  const act = useBotAction();
  const { enabled } = automation;
  const nextAt = automation.nextRunAt === null ? NaN : Date.parse(automation.nextRunAt);
  const next = !enabled ? t("Paused") : Number.isFinite(nextAt) ? whenShort(nextAt, now, locale, t) : null;
  const toggleLabel = enabled ? t("Pause") : t("Resume");
  return (
    <>
      <div className="group/item relative flex min-w-0 items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent has-[:focus-visible]:bg-accent has-[[data-state=open]]:bg-accent pointer-coarse:min-h-11">
        <span className={cn("flex h-5 w-4 shrink-0 items-center justify-center", !enabled && "opacity-60")}><RowIcon automation={automation} /></span>
        <span title={automation.name} className={cn("min-w-0 flex-1 truncate text-left text-[13px] leading-5", enabled ? "text-foreground" : "text-muted-foreground")}>
          {automation.name}
        </span>
        {next ? (
          // The actions lay over it on hover or focus; invisible, it keeps the name's cut where it was.
          <span className={cn("shrink-0 whitespace-nowrap text-xs leading-5 tabular-nums text-muted-foreground", !readOnly && "group-has-[:focus-visible]/item:invisible group-hover/item:invisible group-has-[[aria-expanded=true]]/item:invisible")}>
            {next}
          </span>
        ) : null}
        {readOnly ? null : (
          <span className={HOVER_ACTIONS}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={toggleLabel} disabled={act.busy} onClick={() => void act.run(() => botsApi.setAutomation(botId, automation.id, !enabled))}>
                  {enabled ? <Pause /> : <Play />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>{toggleLabel}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={t("More")} disabled={act.busy}>
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void act.run(() => botsApi.runAutomation(botId, automation.id))}>
                  <CirclePlay />
                  {t("Run now")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void act.run(() => botsApi.removeAutomation(botId, automation.id))}>
                  <Trash2 />
                  {t("Remove")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </div>
      <ActionError message={act.error} className="pl-8" />
    </>
  );
}
