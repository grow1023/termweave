// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotActivityPanel.tsx; adapted for TermWeave.
// A bot's Home: the right-sidebar tab beside its chat. Header, the asks, its items, its automations; an item
// opens in place of the list. Settings are the caller's: the gear calls `onOpenSettings`.
import { useState } from "react";

import { OrcaRoot } from "../../OrcaRoot.tsx";
import { type Bot, type BotsView, useBotsView } from "../data.ts";
import { BotItemPane } from "./BotItemPane.tsx";
import { BotItemsSection } from "./BotItemsSection.tsx";
import { BotPanelHeader } from "./BotPanelHeader.tsx";
import { BotUpcomingSection } from "./BotUpcomingSection.tsx";
import type { GroupId } from "./bot-item-status-name.ts";
import { useNow } from "./use-now.ts";

type Props = {
  botId: string;
  readOnly: boolean;
  /** the gear in the header: the caller swaps this panel for the settings view */
  onOpenSettings: () => void;
  /** optional: the caller closes the panel (narrow screens) */
  onClose?: () => void;
};

function BotHomeContent({ bot, view, readOnly, onOpenSettings, onClose }: Props & { bot: Bot; view: BotsView }) {
  const now = useNow();
  const [openN, setOpenN] = useState<number | null>(null);
  const [folds, setFolds] = useState<Readonly<Partial<Record<GroupId, boolean>>>>({});
  const [automationsOpen, setAutomationsOpen] = useState(true);
  const items = view.items.filter((item) => item.botId === bot.id);
  const workers = view.workers.filter((worker) => worker.botId === bot.id);
  const automations = view.automations.filter((automation) => automation.botId === bot.id);
  const open = openN === null ? undefined : items.find((item) => item.n === openN);
  if (open) {
    return <BotItemPane bot={bot} item={open} workers={workers} readOnly={readOnly} onBack={() => setOpenN(null)} />;
  }
  return (
    <div
      data-bot-items-scroller=""
      data-bot-home-panel=""
      tabIndex={-1}
      // The wider left padding is the sidebar's resize grab area, 4 px clear of every row.
      className="@container scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pl-3.5 pr-2 py-3 outline-none"
    >
      <BotPanelHeader bot={bot} items={items} automations={automations} chat={view.chatStatus?.[bot.id]} readOnly={readOnly} now={now} onOpenSettings={onOpenSettings} onClose={onClose} />
      <BotItemsSection
        bot={bot}
        items={items}
        workers={workers}
        folds={folds}
        onFold={(id, isOpen) => setFolds({ ...folds, [id]: isOpen })}
        readOnly={readOnly}
        onOpen={(item) => setOpenN(item.n)}
      />
      <BotUpcomingSection bot={bot} automations={automations} fold={{ open: automationsOpen, onOpenChange: setAutomationsOpen }} now={now} readOnly={readOnly} />
    </div>
  );
}

export function BotHomePanel(props: Props): React.JSX.Element | null {
  const view = useBotsView();
  const bot = view?.bots.find((candidate) => candidate.id === props.botId);
  if (!view || !bot) return null;
  return (
    <OrcaRoot className="flex h-full min-h-0 flex-col bg-sidebar text-foreground">
      <BotHomeContent key={bot.id} {...props} bot={bot} view={view} />
    </OrcaRoot>
  );
}
