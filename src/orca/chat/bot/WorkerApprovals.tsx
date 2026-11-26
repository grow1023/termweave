// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/worker-approvals/NativeChatWorkerApprovals.tsx; adapted for TermWeave.
// What waits on the owner, pinned above the composer, newest first: one open card, the rest as rows
// with Show. In TermWeave these are the bot's own needs-you items: an approval (`action` set) answers
// exactly "Approve" or "Deny"; a question answers with an option or typed text.
// TermWeave's change: while the bot's Home panel sits docked and open beside the chat, it already shows
// every card, so here each item is one folded row and Show opens it in place (no card shown twice).
// Left out: receipts of closed prompts, countdowns, fold, the short-pane dialog (no data or no feature).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { useBotSideDocked } from "../../bots/BotSide.tsx";
import { botsApi, type BotItem, type BotPaneAction } from "../../bots/data.ts";
import { BotItemQuestionStep } from "../../bots/homepanel/BotItemQuestionStep.tsx";
import { useBotAction } from "../../bots/homepanel/use-bot-action.tsx";
import { useSettledCards } from "../../bots/homepanel/use-settled-cards.ts";
import type { ChatApproval, ChatBotContext } from "../shared/index.ts";
import { useWorkerDockStructuralValue } from "./WorkerDockFrame.tsx";
import { APPROVAL_ANSWERS, approvalQuestion, hasAction, toChatApproval } from "./use-chat-bot.ts";

export type RenderApproval = (args: {
  approval: ChatApproval;
  submitting: boolean;
  submittingIndex: number | null;
  error: string | null;
  onChoose: (index: number) => void;
  placement: "stacked";
}) => ReactNode;

export interface WorkerApprovalsProps {
  context: ChatBotContext & { questions?: readonly BotItem[] };
  /** WP2's ApprovalCard, given by the integrator; without it the Home panel's card draws the approval. */
  renderApproval?: RenderApproval;
}

/** An approval through the shared card: its own busy state and the server's refusal text. */
function ApprovalSlot({ botId, item, readOnly, render, canAnswer }: { botId: string; item: BotItem & { action: BotPaneAction }; readOnly: boolean; render: RenderApproval; canAnswer: () => boolean }) {
  const t = useT();
  const act = useBotAction();
  const [choosing, setChoosing] = useState<number | null>(null);
  const onChoose = (index: number): void => {
    const answer = APPROVAL_ANSWERS[index];
    if (readOnly || act.busy || answer === undefined || !canAnswer()) return;
    setChoosing(index);
    void act.run(() => botsApi.answerItem(botId, item.n, answer)).then(() => setChoosing(null));
  };
  return (
    <div aria-busy={act.busy}>
      {render({ approval: toChatApproval(item, readOnly, t), submitting: act.busy, submittingIndex: act.busy ? choosing : null, error: act.error, onChoose, placement: "stacked" })}
    </div>
  );
}

function WaitingCard({ botId, item, readOnly, render, canAnswer }: { botId: string; item: BotItem; readOnly: boolean; render?: RenderApproval; canAnswer: () => boolean }) {
  if (render && hasAction(item)) return <ApprovalSlot botId={botId} item={item} readOnly={readOnly} render={render} canAnswer={canAnswer} />;
  return <BotItemQuestionStep botId={botId} item={item} readOnly={readOnly} canAnswer={canAnswer} />;
}

function itemName(item: BotItem): string {
  return `#${item.n} ${item.title}`;
}

const stamp = (item: BotItem): number => Date.parse(item.updatedAt) || Date.parse(item.createdAt) || 0;

/** A card's place key for useSettledCards: a row that opens (Show, or the next card moving up into the
 *  open slot) is a new card under the pointer, so open and folded count as different cards. */
function placeKey(item: BotItem, open: boolean): string {
  return `item:${item.botId}:${item.n}:${open ? "open" : "row"}`;
}

/** Tells a screen reader when new items start waiting. */
function useArrivals(items: readonly BotItem[]): { id: string; text: string } | null {
  const t = useT();
  const seen = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    const arrived = items.filter((item) => !seen.current.has(`${item.botId}:${item.n}`));
    arrived.forEach((item) => seen.current.add(`${item.botId}:${item.n}`));
    const last = arrived[arrived.length - 1];
    if (!last) return;
    const count = arrived.length;
    setAnnouncement({
      id: `${last.botId}:${last.n}`,
      text: count === 1 ? t("1 new question waiting on you") : t("{count} new questions waiting on you", { count }),
    });
  }, [items, t]);
  return announcement;
}

/** One line for an item that is not open, with Show. */
function FoldedRow({ item, text, onShow }: { item: BotItem; text: string; onShow: () => void }) {
  const t = useT();
  return (
    <div data-native-chat-worker-question-summary={item.n} className="flex h-11 min-w-0 shrink-0 scroll-mt-11 items-center gap-2 px-4 text-xs">
      <CircleHelp aria-hidden="true" className="size-4 shrink-0 text-chat-warning" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <Button variant="ghost-inset" size="sm" className="h-11 min-w-11 shrink-0" aria-label={t("Show {name} question", { name: itemName(item) })} onClick={onShow}>
        {t("Show")}
      </Button>
    </div>
  );
}

/** The open card under its "Waiting on you" line; `onHide` (folded mode only) folds it back. */
function OpenCard({ item, context, render, canAnswer, onHide }: {
  item: BotItem;
  context: WorkerApprovalsProps["context"];
  render?: RenderApproval;
  canAnswer: () => boolean;
  onHide?: () => void;
}) {
  const t = useT();
  return (
    <div data-native-chat-worker-approval={item.n}>
      <div className="flex min-h-8 items-center gap-2 px-4 pt-1 text-xs text-chat-warning">
        <CircleHelp className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t("{name} · Waiting on you", { name: itemName(item) })}</span>
        {onHide ? (
          <Button variant="ghost-inset" size="sm" className="h-8 min-w-11 shrink-0 text-foreground pointer-coarse:h-11" aria-label={t("Hide {name} question", { name: itemName(item) })} onClick={onHide}>
            {t("Hide")}
          </Button>
        ) : null}
      </div>
      <WaitingCard key={`${item.botId}:${item.n}`} botId={context.bot.id} item={item} readOnly={context.readOnly} render={render} canAnswer={canAnswer} />
    </div>
  );
}

export function WorkerApprovals({ context, renderApproval }: WorkerApprovalsProps) {
  const t = useT();
  const live = useMemo(
    () => [...context.approvals, ...(context.questions ?? [])].sort((a, b) => stamp(b) - stamp(a) || b.n - a.n),
    [context.approvals, context.questions],
  );
  const announcement = useArrivals(live);
  const items = useWorkerDockStructuralValue(live);
  const [selected, setSelected] = useState<number | null>(null);
  // the Home panel beside the chat already shows every card: here they stay folded until asked
  const folded = useBotSideDocked(context.bot.paneId);
  const open = folded ? (items.find((item) => item.n === selected) ?? null) : (items.find((item) => item.n === selected) ?? items[0] ?? null);
  // the Home panel's guard (card-placement.ts): a card that just appeared or moved ignores answers for 500 ms;
  // before the early return, so a first card that appears later counts as new
  const isSettled = useSettledCards(items.map((item) => placeKey(item, item === open)));
  const status = <span key={announcement?.id} className="sr-only" role="status" aria-live="polite">{announcement?.text}</span>;
  if (items.length === 0) return status;
  const card = (item: BotItem, onHide?: () => void) => (
    <OpenCard key={`${item.botId}:${item.n}`} item={item} context={context} render={renderApproval} canAnswer={() => isSettled(placeKey(item, true))} onHide={onHide} />
  );
  // the scroll box: its top edge fades while scrolled, and an open card's action row stays in sight (chat.css)
  const box = "native-chat-worker-approvals scrollbar-sleek min-h-0 shrink overflow-y-auto overscroll-contain pb-2";
  if (folded) {
    return (
      <div className={box} data-native-chat-worker-approvals="" data-native-chat-worker-approvals-folded="">
        {status}
        <div role="region" aria-label={t("Waiting on you")} className="min-h-0">
          {items.map((item) => item === open
            ? card(item, () => setSelected(null))
            : <FoldedRow key={`${item.botId}:${item.n}`} item={item} text={t("{name} · Waiting on you", { name: itemName(item) })} onShow={() => setSelected(item.n)} />)}
        </div>
      </div>
    );
  }
  const queued = items.filter((item) => item !== open);
  return (
    <div className={box} data-native-chat-worker-approvals="">
      {status}
      {open ? card(open) : null}
      {queued.length ? (
        <>
          <p className="flex h-6 items-center px-4 text-2xs text-muted-foreground">{t("{count} more waiting on you", { count: queued.length })}</p>
          <div role="region" aria-label={t("Queued questions")} className="min-h-0">
            {queued.map((item) => (
              <FoldedRow key={`${item.botId}:${item.n}`} item={item} text={`#${item.n} · ${item.action ? approvalQuestion(item.action, t) : (item.ask ?? item.title)}`} onShow={() => setSelected(item.n)} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
