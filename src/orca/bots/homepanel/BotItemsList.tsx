// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemsList.tsx; adapted for TermWeave.
// A bot's items in groups: In progress and Waiting open, Planned and Closed folded. Each shows five rows,
// then Show N more.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { ACTIVE_WORKER, botsApi, type BotItem, type BotWorker } from "../data.ts";
import { BotItemStatusIcon } from "../BotItemStatusIcon.tsx";
import { BotItemRow, type BotItemRowAction } from "./BotItemRow.tsx";
import { BotPanelSectionHeader } from "./BotPanelSection.tsx";
import { type BotItemGroups, GROUP_IDS, GROUP_ROWS, GROUPS_FOLDED_BY_DEFAULT, type GroupId, groupName } from "./bot-item-status-name.ts";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

const GROUP_GLYPH = { working: "working", waiting: "waiting", planned: "planned", closed: "done" } as const;

function BotItemGroup({ id, items, live, open, onOpenChange, readOnly, busy, onAction }: {
  id: GroupId;
  items: readonly BotItem[];
  live: ReadonlySet<number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  busy: boolean;
  onAction: (item: BotItem, action: BotItemRowAction) => void;
}) {
  const t = useT();
  const [shown, setShown] = useState(GROUP_ROWS);
  if (items.length === 0) return null;
  const name = groupName(id, t);
  const more = items.length - Math.min(shown, items.length);
  return (
    <section className="flex flex-col gap-0.5">
      <BotPanelSectionHeader title={name} fold={{ open, onOpenChange }} glyph={<BotItemStatusIcon status={GROUP_GLYPH[id]} />} summary={items.length} />
      {open ? (
        <>
          <div role="list" aria-label={name} className="flex flex-col">
            {items.slice(0, shown).map((item) => (
              <BotItemRow key={item.n} item={item} live={live.has(item.n)} readOnly={readOnly} busy={busy} onAction={onAction} />
            ))}
          </div>
          {more > 0 ? (
            <button type="button" className="self-start py-0.5 pl-8 pr-2 text-xs text-muted-foreground hover:text-foreground pointer-coarse:min-h-11" onClick={() => setShown(shown + Math.max(GROUP_ROWS, items.length))}>
              {t("Show {count} more", { count: more })}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function BotItemsList({ botId, groups, workers, folds, onFold, numberChars, readOnly, onOpen }: {
  botId: string;
  groups: BotItemGroups;
  workers: readonly BotWorker[];
  /** Groups the user opened or folded against their default. */
  folds: Readonly<Partial<Record<GroupId, boolean>>>;
  onFold: (id: GroupId, open: boolean) => void;
  numberChars: number;
  readOnly: boolean;
  onOpen: (item: BotItem) => void;
}) {
  const act = useBotAction();
  const live = new Set(workers.flatMap((worker) => (worker.itemN !== null && ACTIVE_WORKER.has(worker.status) ? [worker.itemN] : [])));
  const onAction = (item: BotItem, action: BotItemRowAction): void => {
    if (action === "open") return onOpen(item);
    const status = action === "done" ? "done" : action === "cancel" ? "canceled" : "planned";
    void act.run(() => botsApi.ownerItem(botId, item.n, { status }));
  };
  return (
    <div className="flex flex-col gap-2" style={{ "--bot-item-number-chars": numberChars } as React.CSSProperties}>
      {GROUP_IDS.map((id) => (
        <BotItemGroup
          key={id}
          id={id}
          items={groups[id]}
          live={live}
          open={folds[id] ?? !GROUPS_FOLDED_BY_DEFAULT.has(id)}
          onOpenChange={(open) => onFold(id, open)}
          readOnly={readOnly}
          busy={act.busy}
          onAction={onAction}
        />
      ))}
      <ActionError message={act.error} />
    </div>
  );
}
