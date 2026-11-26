// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/SidebarBotsSection.tsx and BotSidebarEntry.tsx; adapted for TermWeave.
// The Bots section of the sidebar. Left out: drag to reorder, groups, search, the options menu, the chats tree,
// "Up next", unread, paired hosts and the usage-limit gauge (TermWeave has none of them).
import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

import type { SessionSnapshot } from "../../../../shared/protocol.ts";
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { OrcaRoot } from "../../OrcaRoot.tsx";
import { Button } from "../../ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { botErrorText, botsApi, type Bot, type BotsView } from "../data.ts";
import { BotCollapsedPreview } from "./BotCollapsedPreview.tsx";
import { BotRow } from "./BotRow.tsx";
import { BotWorkerRow } from "./BotWorkerRow.tsx";
import { botFacts, botNeedsOwner, type BotFacts } from "./bot-facts.ts";
import { useFoldedBots, useSectionFolded } from "./fold-memory.ts";
import "./sidebar.css";

export interface SidebarBotsSectionProps {
  view: BotsView;
  /** this computer's session: `snapshot.panes` has `pane_id` and `agent_status` */
  snapshot: SessionSnapshot | null;
  selectedPaneId: string | null;
  readOnly: boolean;
  onOpenPane: (paneId: string) => void;
  /** opens the New bot dialog */
  onNewBot: () => void;
  /** opens that bot's settings */
  onSettings: (botId: string) => void;
}

// The bot row's status lane and gap, so a worker's glyph lands under the bot's picture.
const WORKER_INDENT = 19;

function SectionHeader({ collapsed, onToggle, facts, readOnly, onNewBot, preview }: {
  collapsed: boolean;
  onToggle: () => void;
  facts: readonly BotFacts[];
  readOnly: boolean;
  onNewBot: () => void;
  preview: JSX.Element | null;
}): JSX.Element {
  const t = useT();
  const action = collapsed ? t("Expand Bots") : t("Collapse Bots");
  const attention = facts.filter(botNeedsOwner).length;
  const working = facts.filter((fact) => fact.working).length;
  const summary = t("{action}, {total} bots, {attention} need you, {working} working", { action, total: facts.length, attention, working });
  const newLabel = t("New bot");
  return (
    <div className="group/sidebar-header mt-2 flex h-8 min-w-0 shrink-0 items-center justify-between gap-1.5 px-2 pointer-coarse:h-11">
      <div className="group/section-header relative flex h-full min-w-0 flex-1 items-center gap-1" data-sidebar-section="bots">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="peer absolute inset-0 rounded-md enabled:cursor-pointer focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label={summary}
              aria-expanded={!collapsed}
              data-sidebar-section-fold="bots"
              onClick={(event) => {
                onToggle();
                // A clicked header must not keep focus once the pointer leaves.
                if (event.detail > 0) event.currentTarget.blur();
              }}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" sideOffset={6}>{action}</TooltipContent>
        </Tooltip>
        <span className="pointer-events-none ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors peer-hover:bg-accent/70 peer-hover:text-foreground">
          <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", collapsed && "-rotate-90")} />
        </span>
        <span className="pointer-events-none min-w-0 truncate pr-0.5 pl-0 text-xs font-semibold text-muted-foreground/80 select-none" data-sidebar-section-title="bots">{t("Bots")}</span>
        {preview}
      </div>
      {collapsed || readOnly ? null : (
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" className="shrink-0 pointer-coarse:size-11" aria-label={newLabel} onClick={onNewBot}>
                <Plus className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{newLabel}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

function EmptyState({ readOnly, onNewBot }: { readOnly: boolean; onNewBot: () => void }): JSX.Element {
  const t = useT();
  const className = "mx-2 block rounded-[10px] px-3 py-2.5 text-left text-[13px] leading-tight text-muted-foreground";
  const text = t("No bots yet. Make one that takes jobs from its chat.");
  return readOnly
    ? <p className={className}>{text}</p>
    : <button type="button" className={cn(className, "cursor-pointer ring-1 ring-foreground/[0.08] ring-inset hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11")} onClick={onNewBot}>{text}</button>;
}

export function SidebarBotsSection({ view, snapshot, selectedPaneId, readOnly, onOpenPane, onNewBot, onSettings }: SidebarBotsSectionProps): JSX.Element {
  const t = useT();
  const [failed, setFailed] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const { folded, toggle: toggleFold } = useFoldedBots();
  const { collapsed, toggle: toggleSection } = useSectionFolded();
  const panes = snapshot?.panes ?? [];
  const facts = view.bots.map((bot) => botFacts(bot, view, panes));

  const openChat = async (entry: BotFacts): Promise<void> => {
    const { bot } = entry;
    if (opening !== null) return;
    setFailed(null);
    if (bot.paneId !== null && entry.running) { onOpenPane(bot.paneId); return; }
    if (readOnly) { setFailed(t("This bot's chat is not running.")); return; }
    setOpening(bot.id);
    try {
      const result = await botsApi.open(bot.id);
      onOpenPane(result.pane_id);
    } catch (error) {
      setFailed(botErrorText(error, t));
    } finally { setOpening(null); }
  };
  const preview = collapsed && facts.length > 0
    ? <BotCollapsedPreview facts={facts} automations={view.automations} selectedPaneId={selectedPaneId} onOpenBot={(bot: Bot) => { const entry = facts.find((fact) => fact.bot.id === bot.id); if (entry) void openChat(entry); }} />
    : null;

  return (
    <section className="bots-sidebar flex min-h-0 flex-col" aria-label={t("Bots")}>
      <OrcaRoot className="flex min-h-0 flex-col bg-transparent text-sidebar-foreground">
        <SectionHeader collapsed={collapsed} onToggle={toggleSection} facts={facts} readOnly={readOnly} onNewBot={onNewBot} preview={preview} />
        {collapsed ? null : facts.length === 0
          ? <EmptyState readOnly={readOnly} onNewBot={onNewBot} />
          : <ul className="flex min-h-0 list-none flex-col gap-0.5 p-0 pb-1 pl-1">
            {facts.map((entry) => {
              const isFolded = folded.includes(entry.bot.id);
              return (
                <li key={entry.bot.id} className="flex flex-col gap-1">
                  <BotRow
                    facts={entry}
                    automations={view.automations}
                    isActive={entry.bot.paneId !== null && entry.bot.paneId === selectedPaneId}
                    readOnly={readOnly}
                    folded={isFolded}
                    onToggleFold={() => toggleFold(entry.bot.id)}
                    opening={opening === entry.bot.id}
                    onOpen={() => void openChat(entry)}
                    onSettings={() => onSettings(entry.bot.id)}
                    onError={setFailed}
                  />
                  {entry.workers.length > 0 && !isFolded
                    ? <ul className="@container flex list-none flex-col gap-1 p-0" style={{ marginLeft: WORKER_INDENT }}>
                      {entry.workers.map((worker) => (
                        <li key={worker.id}>
                          <BotWorkerRow
                            worker={worker}
                            item={worker.itemN === null ? null : entry.items.find((item) => item.n === worker.itemN) ?? null}
                            selected={worker.paneId !== null && worker.paneId === selectedPaneId}
                            onOpen={() => { if (worker.paneId !== null) onOpenPane(worker.paneId); }}
                          />
                        </li>
                      ))}
                    </ul>
                    : null}
                </li>
              );
            })}
          </ul>}
        {failed ? <p className="px-3 py-1 text-xs text-destructive" role="alert">{failed}</p> : null}
      </OrcaRoot>
    </section>
  );
}
