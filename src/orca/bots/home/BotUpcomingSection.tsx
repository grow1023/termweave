// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotUpcomingSection.tsx; adapted for TermWeave.
// Automations in a bot's panel: soonest first, paused ones last. Five show, then Show N more.
import { Plus } from "lucide-react";
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import type { Bot, BotAutomation } from "../data.ts";
import { BotAutomationForm } from "./BotAutomationForm.tsx";
import { BotPanelSection, type PanelFold } from "./BotPanelSection.tsx";
import { AutomationRow } from "./BotUpcomingRows.tsx";
import { GROUP_ROWS } from "./bot-item-status-name.ts";

const nextAt = (automation: BotAutomation): number => (automation.nextRunAt === null ? Infinity : Date.parse(automation.nextRunAt) || Infinity);

export function BotUpcomingSection({ bot, automations, fold, now, readOnly }: {
  bot: Bot;
  automations: readonly BotAutomation[];
  fold: PanelFold;
  now: number;
  readOnly: boolean;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState(GROUP_ROWS);
  const newLabel = t("New automation");
  const ordered = [...automations].sort((a, b) => Number(b.enabled) - Number(a.enabled) || nextAt(a) - nextAt(b) || a.name.localeCompare(b.name));
  const more = ordered.length - Math.min(shown, ordered.length);
  return (
    <BotPanelSection
      title={t("Automations")}
      fold={fold}
      actions={
        readOnly ? null : (
          // Icon-only: the tooltip and accessible name carry the label.
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11" aria-label={newLabel} aria-expanded={adding} onClick={() => setAdding(!adding)}>
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{newLabel}</TooltipContent>
          </Tooltip>
        )
      }
    >
      {adding && !readOnly ? <BotAutomationForm botId={bot.id} onClose={() => setAdding(false)} /> : null}
      {ordered.slice(0, shown).map((automation) => (
        <AutomationRow key={automation.id} botId={bot.id} automation={automation} now={now} readOnly={readOnly} />
      ))}
      {more > 0 ? (
        <button type="button" className="self-start py-0.5 pl-8 pr-2 text-xs text-muted-foreground hover:text-foreground pointer-coarse:min-h-11" onClick={() => setShown(shown + Math.max(GROUP_ROWS, ordered.length))}>
          {t("Show {count} more", { count: more })}
        </button>
      ) : null}
      {ordered.length === 0 ? (
        <p className="py-1 pr-2 pl-8 text-xs text-muted-foreground">
          {t("Ask {name} in chat to run something on a schedule, or add one with +.", { name: bot.name })}
        </p>
      ) : null}
    </BotPanelSection>
  );
}
