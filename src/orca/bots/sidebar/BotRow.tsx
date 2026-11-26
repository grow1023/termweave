// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotRow.tsx; adapted for TermWeave.
// One bot: its picture, name and time, its newest line, the fold strip over its workers, and the menus.
import { useState } from "react";
import { MoreHorizontal, Settings } from "lucide-react";

import { botAge } from "../../../components/BotVisuals.tsx";
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../../ui/dropdown-menu.tsx";
import { botsApi, type BotAutomation } from "../data.ts";
import { BotAvatar } from "../BotAvatar.tsx";
import { BotFoldToggle } from "./BotFoldToggle.tsx";
import { BotHoverDetails } from "./BotHoverDetails.tsx";
import { BotMenuItems, CONTEXT_KIT, DROPDOWN_KIT, type BotMenuActions } from "./BotRowMenu.tsx";
import { BotNameRename } from "./BotNameRename.tsx";
import { BotRowLineView } from "./BotRowLineView.tsx";
import { BotSidebarRow } from "./BotSidebarRow.tsx";
import { DeleteBotDialog } from "./DeleteBotDialog.tsx";
import { botBadge, botRowLine, workerMark, type BotFacts } from "./bot-facts.ts";

const ACTION_BUTTON =
  "flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:size-11 [&_svg]:size-3.5";

export interface BotRowProps {
  facts: BotFacts;
  automations: readonly BotAutomation[];
  isActive: boolean;
  readOnly: boolean;
  folded: boolean;
  onToggleFold: () => void;
  /** its chat is being opened: the open button waits */
  opening: boolean;
  onOpen: () => void;
  onSettings: () => void;
  onError: (message: string) => void;
}

function copyPath(home: string, message: string, onError: (message: string) => void): void {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard) { onError(message); return; }
  clipboard.writeText(home).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
}

export function BotRow({ facts, automations, isActive, readOnly, folded, onToggleFold, opening, onOpen, onSettings, onError }: BotRowProps): JSX.Element {
  const t = useT();
  const { bot } = facts;
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const line = botRowLine(facts, t);
  const age = line.at ? botAge(line.at) : null;
  const hasWorkers = facts.workers.length > 0;
  const togglePause = (): void => {
    if (pausing) return;
    setPausing(true);
    botsApi.update(bot.id, { paused: !bot.paused }).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error))).finally(() => setPausing(false));
  };
  const menu: BotMenuActions = {
    readOnly: readOnly || pausing,
    paused: bot.paused,
    onRename: () => setRenaming(true),
    onSettings,
    onTogglePause: togglePause,
    onCopyPath: () => copyPath(bot.home, t("Copying is not available here."), onError),
    onDelete: () => setDeleting(true),
  };
  const title = <span className={cn("min-w-0 truncate text-[13px] leading-5", line.attention ? "font-semibold text-foreground" : "text-foreground/90")}>{bot.name}</span>;
  const ageMark = age ? <span className="ml-auto shrink-0 text-3xs leading-none text-muted-foreground tabular-nums">{age}</span> : null;
  const main = renaming
    ? <span className="flex min-w-0 flex-1 flex-col justify-center">
      <span className="flex min-w-0 items-center gap-1.5"><BotNameRename botId={bot.id} name={bot.name} onDone={() => setRenaming(false)} onError={onError} />{ageMark}</span>
      <BotRowLineView line={line} />
    </span>
    : <button type="button" disabled={opening} title={t("Open chat with {name}", { name: bot.name })} aria-current={isActive ? "true" : undefined} className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 pointer-coarse:min-h-11">
      <span className="flex min-w-0 items-center gap-1.5">{title}{ageMark}</span>
      <BotRowLineView line={line} />
    </button>;
  const actions = (
    // Over the row's right end on hover, focus or an open menu; a touch screen has no hover, so it sits in the row.
    <span className={cn(
      "absolute top-1 right-1 flex items-center rounded-sm bg-worktree-sidebar/90 opacity-0 transition-opacity group-hover/bot-row:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100",
      hasWorkers && "right-10 can-hover:pointer-fine:@max-[15rem]/bot-row:right-6",
      "pointer-coarse:static pointer-coarse:ml-1 pointer-coarse:bg-transparent pointer-coarse:opacity-100"
    )} onClick={(event) => event.stopPropagation()}>
      <button type="button" className={ACTION_BUTTON} aria-label={t("Manage {name}", { name: bot.name })} title={t("Manage {name}", { name: bot.name })} onClick={onSettings}><Settings aria-hidden /></button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={ACTION_BUTTON} aria-label={t("More actions for {name}", { name: bot.name })}><MoreHorizontal aria-hidden /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
          <BotMenuItems kit={DROPDOWN_KIT} actions={menu} />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
  return (
    <>
      <BotSidebarRow
        avatar={<BotAvatar bot={bot} className="size-8 rounded-md text-sm" />}
        badge={botBadge(facts, line)}
        isActive={isActive}
        dimmed={bot.paused}
        expanded={hasWorkers ? !folded : undefined}
        onOpen={renaming ? () => undefined : onOpen}
        main={main}
        working={facts.working}
        trailing={hasWorkers ? <BotFoldToggle botName={bot.name} folded={folded} working={facts.working} liveMark={workerMark(facts.workers)} onToggle={onToggleFold} /> : null}
        actions={actions}
        hoverDetails={<BotHoverDetails facts={facts} automations={automations} />}
        menuItems={<BotMenuItems kit={CONTEXT_KIT} actions={menu} />}
      />
      <DeleteBotDialog bot={bot} open={deleting} onOpenChange={setDeleting} />
    </>
  );
}
