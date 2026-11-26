// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemsSection.tsx; adapted for TermWeave.
// The Items part of Home: the asks lead (Needs you), then the groups; all clear above them, or what an empty bot says.
import { ListChecks } from "lucide-react";
import { useMemo } from "react";

import { useT } from "../../../lib/i18n.ts";
import type { Bot, BotItem, BotWorker } from "../data.ts";
import { BotItemsList } from "./BotItemsList.tsx";
import { BotNeedsYouSection } from "./BotNeedsYouSection.tsx";
import { type GroupId, groupItems } from "./bot-item-status-name.ts";

export function BotItemsSection({ bot, items, workers, folds, onFold, readOnly, onOpen }: {
  bot: Bot;
  items: readonly BotItem[];
  workers: readonly BotWorker[];
  folds: Readonly<Partial<Record<GroupId, boolean>>>;
  onFold: (id: GroupId, open: boolean) => void;
  readOnly: boolean;
  onOpen: (item: BotItem) => void;
}) {
  const t = useT();
  const groups = useMemo(() => groupItems(items), [items]);
  const asking = items.some((item) => item.status === "needs_you");
  // Every row's number column fits the widest number, so titles start in one column at #100 too.
  const numberChars = items.reduce((widest, item) => Math.max(widest, `#${item.n}`.length), 0);
  const allClear = items.length > 0 && !asking && !bot.paused && groups.working.length === 0;
  return (
    <>
      <BotNeedsYouSection botId={bot.id} items={items} readOnly={readOnly} onOpen={onOpen} />
      {allClear ? (
        <p role="status" className="-mb-1.5 min-w-0 break-words px-2 py-1 text-[13px] leading-5 text-muted-foreground">
          {t("Nothing needs you")}
        </p>
      ) : null}
      <BotItemsList botId={bot.id} groups={groups} workers={workers} folds={folds} onFold={onFold} numberChars={numberChars} readOnly={readOnly} onOpen={onOpen} />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-xs text-muted-foreground">
          <ListChecks className="size-5" />
          <b className="text-[13px] font-medium text-foreground">{t("No items yet")}</b>
          {t("When {bot} takes on something for you, it shows up here with what it is doing and what it needs from you.", { bot: bot.name })}
        </div>
      ) : null}
    </>
  );
}
