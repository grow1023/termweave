// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotNeedsYouSection.tsx; adapted for TermWeave.
// The items that wait on the owner, as question cards: approvals first, then the oldest question. Five, then Show N more.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import type { BotItem } from "../data.ts";
import { BotItemStatusIcon } from "../BotItemStatusIcon.tsx";
import { BotPanelSectionHeader } from "./BotPanelSection.tsx";
import { AnsweredLine } from "./AnsweredLine.tsx";
import { BotItemQuestionStep } from "./BotItemQuestionStep.tsx";
import { guardKey, layoutRows } from "./answered-line.ts";
import { GROUP_ROWS } from "./bot-item-status-name.ts";
import { useAnsweredLines } from "./use-answered-lines.ts";
import { useSettledCards, useSettledLook } from "./use-settled-cards.ts";

const keyOf = (item: BotItem): string => `item:${item.n}`;

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
  // an answered card stays a moment as one line in its place (BOT-23), and does not show again as a card
  const answered = useAnsweredLines(needs.map((item) => ({ key: keyOf(item), stamp: item.updatedAt })));
  const waiting = needs.filter((item) => !answered.hides(keyOf(item), item.updatedAt));
  const shown = expanded ? waiting : waiting.slice(0, GROUP_ROWS);
  const rows = layoutRows(shown, answered.lines);
  // the guard key counts the lines above a card: a line that appears or leaves moves the cards under it
  const cardKeys = rows.flatMap((row) => (row.kind === "card" ? [guardKey(keyOf(row.card), row.linesAbove)] : []));
  // before the early return: the hooks keep timing while the list is empty, so a first card that appears later is new
  const canAnswer = useSettledCards(cardKeys);
  const looksSettled = useSettledLook(cardKeys);
  if (rows.length === 0) return null;
  const hidden = waiting.length - shown.length;
  return (
    <section className="flex flex-col gap-0.5">
      <BotPanelSectionHeader title={t("Needs you")} glyph={<BotItemStatusIcon status="needs_you" />} summary={waiting.length} />
      <div role="list" aria-label={t("Needs you")} className="flex flex-col gap-2 px-1">
        {rows.map((row, index) => {
          if (row.kind === "line") {
            return <div key={`line:${row.line.key}`} role="listitem"><AnsweredLine text={row.line.text} /></div>;
          }
          const item = row.card;
          const key = guardKey(keyOf(item), row.linesAbove);
          // where the card stands among the cards, so its line takes the same place
          const place = index - row.linesAbove;
          return (
            <div key={item.n} role="listitem" data-need-key={keyOf(item)}>
              <BotItemQuestionStep
                botId={botId}
                item={item}
                readOnly={readOnly}
                onOpenItem={() => onOpen(item)}
                canAnswer={() => canAnswer(key)}
                settled={looksSettled(key)}
                onAnswered={(_answer, text) => answered.add({ key: keyOf(item), stamp: item.updatedAt, text, index: place })}
              />
            </div>
          );
        })}
      </div>
      {hidden > 0 ? (
        <button type="button" aria-expanded={false} onClick={() => setExpanded(true)} className="self-start py-0.5 pl-8 pr-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pointer-coarse:min-h-11">
          {t("Show {count} more", { count: hidden })}
        </button>
      ) : null}
    </section>
  );
}
