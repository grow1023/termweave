// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemView.tsx; adapted for TermWeave.
// One item, in the list's place: a top (title, status, its question, done means, workers) that scrolls itself
// only to leave the Activity 140px, the Activity scrolling under it, and a comment box.
import { useEffect, useRef } from "react";

import { useT } from "../../../lib/i18n.ts";
import { ACTIVE_WORKER, botsApi, type Bot, type BotItem, type BotWorker } from "../data.ts";
import { BotItemActivityList } from "./BotItemActivityList.tsx";
import { BotItemCommentBox } from "./BotItemCommentBox.tsx";
import { BotItemHeader, type ItemChange } from "./BotItemHeader.tsx";
import { BotItemQuestionStep } from "./BotItemQuestionStep.tsx";
import { BotItemWorkers } from "./BotItemWorkers.tsx";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

export function BotItemView({ bot, item, workers, readOnly }: { bot: Bot; item: BotItem; workers: readonly BotWorker[]; readOnly: boolean }) {
  const t = useT();
  const act = useBotAction();
  const scroller = useRef<HTMLDivElement | null>(null);
  const linked = workers.filter((worker) => worker.itemN === item.n);
  const live = linked.some((worker) => ACTIVE_WORKER.has(worker.status));
  const change = (status: ItemChange): void => {
    void act.run(() => botsApi.ownerItem(bot.id, item.n, { status }));
  };
  // A new comment scrolls into view, as in a chat.
  const comments = item.comments.length;
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [comments]);
  return (
    <div data-bot-item-focus-home="" className="flex min-h-0 flex-1 flex-col outline-none">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-sleek flex max-h-[max(50%,calc(100%_-_140px))] shrink-0 flex-col overflow-y-auto">
          <BotItemHeader item={item} live={live} disabled={readOnly || act.busy} onStatus={change} />
          <ActionError message={act.error} className="px-3.5" />
          <div className="flex flex-col gap-4 px-3.5 pt-2">
            {item.status === "needs_you" ? <BotItemQuestionStep botId={bot.id} item={item} readOnly={readOnly} /> : null}
            {item.doneMeans ? (
              <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-2 gap-y-1 text-xs @max-[284px]:grid-cols-[72px_minmax(0,1fr)]">
                <dt className="leading-[18px] text-muted-foreground">{t("Done means")}</dt>
                <dd className="break-words leading-[18px] text-foreground [overflow-wrap:anywhere]">{item.doneMeans}</dd>
              </dl>
            ) : null}
            <BotItemWorkers workers={linked} />
          </div>
        </div>
        <section className="mt-4 flex min-h-0 flex-1 flex-col">
          <h3 className="mb-1.5 shrink-0 px-3.5 text-xs text-muted-foreground">{t("Activity")}</h3>
          <div ref={scroller} className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]">
            <div className="px-3.5 pb-2">
              <BotItemActivityList bot={bot} item={item} />
            </div>
          </div>
        </section>
        {/* A soft edge over the comment box: activity scrolling under it reads as more below. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-linear-to-b from-transparent to-sidebar" />
      </div>
      {readOnly ? null : <BotItemCommentBox botId={bot.id} n={item.n} />}
    </div>
  );
}
