// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotHoverDetails.tsx; adapted for TermWeave:
// the picture, the name, the purpose, the agent, the open items and the next automation.
import { Circle, Pause } from "lucide-react";

import { useLocale, useT } from "../../../lib/i18n.ts";
import { BOT_ITEM_OPEN, type Bot, type BotAutomation } from "../data.ts";
import { BotAvatar } from "../BotAvatar.tsx";
import StatusIndicator from "../../ui/StatusIndicator.tsx";
import type { BotFacts } from "./bot-facts.ts";

/** The earliest next run of the bot's automations that are on. */
function nextAutomation(automations: readonly BotAutomation[]): string | null {
  const times = automations.filter((automation) => automation.enabled && automation.nextRunAt !== null).map((automation) => Date.parse(automation.nextRunAt!)).filter((time) => !Number.isNaN(time));
  return times.length === 0 ? null : new Date(Math.min(...times)).toISOString();
}

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

function StateLine({ bot, facts }: { bot: Bot; facts: BotFacts }): JSX.Element {
  const t = useT();
  const text = bot.paused ? t("Paused") : facts.needs.length > 0 || facts.agentStatus === "blocked" ? t("Needs you") : facts.working ? t("Working") : facts.running ? t("Idle") : t("Chat not running");
  const icon = bot.paused ? <Pause className="size-3" /> : facts.working ? <StatusIndicator status="working" showTooltip={false} aria-hidden /> : facts.needs.length > 0 ? <StatusIndicator status="permission" showTooltip={false} aria-hidden /> : <Circle className="size-2" />;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
      <span className="flex size-3 shrink-0 items-center justify-center" aria-hidden>{icon}</span>
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}

export function BotHoverDetails({ facts, automations }: { facts: BotFacts; automations: readonly BotAutomation[] }): JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { bot } = facts;
  const next = nextAutomation(automations.filter((automation) => automation.botId === bot.id));
  const open = facts.items.filter((item) => BOT_ITEM_OPEN.has(item.status)).length;
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-2.5">
        <BotAvatar bot={bot} className="size-10 rounded-lg text-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 self-center">
          <div className="min-w-0 truncate text-[13px] leading-4 font-semibold text-foreground">{bot.name}</div>
          <StateLine bot={bot} facts={facts} />
        </div>
      </div>
      {bot.purpose ? <div className="mt-2.5 line-clamp-3 border-t border-border pt-2 text-xs leading-snug text-foreground">{bot.purpose}</div> : null}
      <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
        <Fact label={t("Agent")} value={bot.agent === "claude" ? "Claude Code" : "Codex"} />
        <Fact label={t("Open items")} value={String(open)} />
        <Fact label={t("Next automation")} value={next ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(next)) : t("None")} />
      </dl>
    </div>
  );
}
