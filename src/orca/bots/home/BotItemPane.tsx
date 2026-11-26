// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemPane.tsx; adapted for TermWeave.
// The open item in the list's place: the back row over the item. Esc goes back from anywhere in it.
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import type { Bot, BotItem, BotWorker } from "../data.ts";
import { BotItemView } from "./BotItemView.tsx";

export function BotItemPane({ bot, item, workers, readOnly, onBack }: {
  bot: Bot;
  item: BotItem;
  workers: readonly BotWorker[];
  readOnly: boolean;
  onBack: () => void;
}) {
  const t = useT();
  const root = useRef<HTMLDivElement | null>(null);
  // Open: focus here, so Esc works at once.
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={root}
      data-bot-item-pane=""
      tabIndex={-1}
      className="@container/item-pane flex min-h-0 flex-1 flex-col pt-2 outline-none"
      onKeyDown={(event) => {
        // Menus and dialogs are portaled out of this DOM and take their own Escape first.
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onBack();
      }}
    >
      <div className="flex items-center gap-1 px-1.5 pb-1 text-xs text-muted-foreground">
        <Button variant="ghost" size="xs" className="pointer-coarse:h-11" onClick={onBack}>
          <ArrowLeft />
          {t("Back")}
        </Button>
      </div>
      {/* min-w-0: a long unwrapped line must not widen the item. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BotItemView bot={bot} item={item} workers={workers} readOnly={readOnly} />
      </div>
    </div>
  );
}
