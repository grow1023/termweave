// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotPanelHeader.tsx; adapted for TermWeave.
// The top of a bot's Home: its picture, name, what it is doing now or does next, its settings, and a menu.
import { Copy, MoreHorizontal, Pause, Play, Settings, X } from "lucide-react";

import { type Translate, useLocale, useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { BotAvatar } from "../BotAvatar.tsx";
import type { Bot, BotAutomation, BotItem } from "../data.ts";
import { botsApi } from "../data.ts";
import { whenShort } from "./bot-when.ts";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

/** "Paused", "Running Fix the login bug", "Idle · next 9:00 AM · Morning check", else "Idle". */
export function botStatusLine(bot: Bot, items: readonly BotItem[], automations: readonly BotAutomation[], now: number, locale: string, t: Translate): string {
  if (bot.paused) return t("Paused");
  const working = items.filter((item) => item.status === "working").sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))[0];
  if (working) return t("Running {what}", { what: working.title });
  const next = automations
    .filter((automation) => automation.enabled && automation.nextRunAt !== null && Number.isFinite(Date.parse(automation.nextRunAt)))
    .sort((a, b) => Date.parse(a.nextRunAt ?? "") - Date.parse(b.nextRunAt ?? ""))[0];
  if (!next?.nextRunAt) return t("Idle");
  return t("Idle · next {when} · {name}", { when: whenShort(Date.parse(next.nextRunAt), now, locale, t), name: next.name });
}

/** The corner dot: asking, working or quiet. A dot and the status line say it; colour only repeats it. */
function StateDot({ bot, items }: { bot: Bot; items: readonly BotItem[] }) {
  if (bot.paused) return null;
  const asking = items.some((item) => item.status === "needs_you");
  const working = items.some((item) => item.status === "working");
  const tone = asking ? "bg-agent-question" : working ? "bg-agent-working" : "bg-muted-foreground/50";
  return (
    <span aria-hidden className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-sidebar">
      <span className={`size-2 rounded-full ${tone}`} />
    </span>
  );
}

export function BotPanelHeader({ bot, items, automations, readOnly, now, onOpenSettings, onClose }: {
  bot: Bot;
  items: readonly BotItem[];
  automations: readonly BotAutomation[];
  readOnly: boolean;
  now: number;
  onOpenSettings: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const action = useBotAction();
  const settingsLabel = t("Bot settings…");
  const moreLabel = t("More");
  const line = botStatusLine(bot, items, automations, now, locale, t);
  const copyPath = (): void => {
    void action.run(() => navigator.clipboard.writeText(bot.home));
  };
  const togglePause = (): void => {
    void action.run(() => botsApi.update(bot.id, { paused: !bot.paused }));
  };
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 px-2 pb-1 pt-1 @max-[284px]:gap-1.5">
        <span className="relative shrink-0">
          <BotAvatar bot={bot} className="size-9 rounded-[9px] text-base" />
          <StateDot bot={bot} items={items} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-5">{bot.name}</div>
          <div className="truncate text-xs leading-4 text-muted-foreground" title={line}>
            {line}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label={settingsLabel} data-bot-panel-gear="" onClick={onOpenSettings}>
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>{settingsLabel}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label={moreLabel} disabled={action.busy}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>{moreLabel}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            {readOnly ? null : (
              <>
                <DropdownMenuItem onSelect={togglePause}>
                  {bot.paused ? <Play /> : <Pause />}
                  {bot.paused ? t("Resume bot") : t("Pause bot")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={copyPath}>
              <Copy />
              {t("Copy Path")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onClose ? (
          <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label={t("Close")} onClick={onClose}>
            <X />
          </Button>
        ) : null}
      </div>
      <ActionError message={action.error} />
    </div>
  );
}
