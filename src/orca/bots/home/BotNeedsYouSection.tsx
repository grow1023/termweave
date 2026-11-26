// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotNeedsYouSection.tsx; adapted for TermWeave.
// The items that wait on the owner, as question cards: approvals first, then the oldest question. Five, then Show N more.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import type { BotItem } from "../data.ts";
import { BotItemStatusIcon } from "../BotItemStatusIcon.tsx";
import { BotPanelSectionHeader } from "./BotPanelSection.tsx";
import { BotItemQuestionStep } from "./BotItemQuestionStep.tsx";
import { GROUP_ROWS } from "./bot-item-status-name.ts";

export function BotNeedsYouSection({ botId, items, readOnly, onOpen }: {
  botId: string;
  items: readonly BotItem[];
  readOnly: boolean;
  onOpen: (item: BotItem) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const needs = items
    .filter((item) => item.status === "needs_you")
    .sort((a, b) => Number(Boolean(b.action)) - Number(Boolean(a.action)) || (Date.parse(a.updatedAt) || 0) - (Date.parse(b.updatedAt) || 0) || a.n - b.n);
  if (needs.length === 0) return null;
  const shown = expanded ? needs : needs.slice(0, GROUP_ROWS);
  const hidden = needs.length - shown.length;
  return (
    <section className="flex flex-col gap-0.5">
      <BotPanelSectionHeader title={t("Needs you")} glyph={<BotItemStatusIcon status="needs_you" />} summary={needs.length} />
      <div role="list" aria-label={t("Needs you")} className="flex flex-col gap-2 px-1">
        {shown.map((item) => (
          <div key={item.n} role="listitem" data-need-key={`item:${item.n}`}>
            <BotItemQuestionStep botId={botId} item={item} readOnly={readOnly} onOpenItem={() => onOpen(item)} />
          </div>
        ))}
      </div>
      {hidden > 0 ? (
        <button type="button" aria-expanded={false} onClick={() => setExpanded(true)} className="self-start py-0.5 pl-8 pr-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pointer-coarse:min-h-11">
          {t("Show {count} more", { count: hidden })}
        </button>
      ) : null}
    </section>
  );
}
