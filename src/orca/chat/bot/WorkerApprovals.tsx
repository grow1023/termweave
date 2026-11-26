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
import { useBotPageDocked, useBotSideDocked } from "../../bots/BotSide.tsx";
import { botsApi, type BotItem, type BotPaneAction } from "../../bots/data.ts";
import { AnsweredLine } from "../../bots/homepanel/AnsweredLine.tsx";
import { BotItemQuestionStep } from "../../bots/homepanel/BotItemQuestionStep.tsx";
import { answeredText, guardKey, layoutRows } from "../../bots/homepanel/answered-line.ts";
import { useAnsweredLines } from "../../bots/homepanel/use-answered-lines.ts";
import { useBotAction } from "../../bots/homepanel/use-bot-action.tsx";
import { splitWhere } from "../../bots/homepanel/pane-where.ts";
import { useSettledCards, useSettledLook } from "../../bots/homepanel/use-settled-cards.ts";
import type { ChatBotContext } from "../shared/index.ts";
import { useWorkerDockStructuralValue } from "./WorkerDockFrame.tsx";
import { APPROVAL_ANSWERS, approvalQuestion, hasAction, toChatApproval, type BotChatApproval } from "./use-chat-bot.ts";

/** What a waiting card needs from its list: the 500 ms guard, the look while unsettled, and where an answer that went is told. */
interface CardGuard {
  canAnswer: () => boolean;
  settled: boolean;
  onAnswered: (answer: string, text: string) => void;
}

export type RenderApproval = (args: {
  approval: BotChatApproval;
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

/** An approval through the shared card: its own busy state and the server's refusal text. The wrapper's
 *  `data-settled` gives the card its quiet look while it has just appeared or moved (ApprovalCard, BOT-22). */
function ApprovalSlot({ botId, item, readOnly, render, guard }: { botId: string; item: BotItem & { action: BotPaneAction }; readOnly: boolean; render: RenderApproval; guard: CardGuard }) {
  const t = useT();
  const act = useBotAction();
  const [choosing, setChoosing] = useState<number | null>(null);
  const onChoose = (index: number): void => {
    const answer = APPROVAL_ANSWERS[index];
    if (readOnly || act.busy || answer === undefined || !guard.canAnswer()) return;
    setChoosing(index);
    void act.run(() => botsApi.answerItem(botId, item.n, answer)).then((ok) => {
      setChoosing(null);
      if (ok) guard.onAnswered(answer, answeredText(answer, item.action, t));
    });
  };
  return (
    <div aria-busy={act.busy} data-settled={guard.settled} className="group/settle">
      {render({ approval: toChatApproval(item, readOnly, t), submitting: act.busy, submittingIndex: act.busy ? choosing : null, error: act.error, onChoose, placement: "stacked" })}
    </div>
  );
}

function WaitingCard({ botId, item, readOnly, render, guard }: { botId: string; item: BotItem; readOnly: boolean; render?: RenderApproval; guard: CardGuard }) {
  if (render && hasAction(item)) return <ApprovalSlot botId={botId} item={item} readOnly={readOnly} render={render} guard={guard} />;
  return <BotItemQuestionStep botId={botId} item={item} readOnly={readOnly} canAnswer={guard.canAnswer} settled={guard.settled} onAnswered={guard.onAnswered} />;
}

/** An approval's title names its terminal with the pane id after it; the row shows the name only, as the card does (BOT-28). */
function itemName(item: BotItem): string {
  const where = item.action?.where;
  return `#${item.n} ${where ? item.title.replace(where, splitWhere(where).name) : item.title}`;
}

const stamp = (item: BotItem): number => Date.parse(item.updatedAt) || Date.parse(item.createdAt) || 0;

/** A card's place key for useSettledCards: a row that opens (Show, or the next card moving up into the
 *  open slot) is a new card under the pointer, so open and folded count as different cards. */
function placeKey(item: BotItem, open: boolean): string {
  return `item:${item.botId}:${item.n}:${open ? "open" : "row"}`;
}

const itemKey = (item: BotItem): string => `item:${item.botId}:${item.n}`;

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
function OpenCard({ item, context, render, guard, onHide }: {
  item: BotItem;
  context: WorkerApprovalsProps["context"];
  render?: RenderApproval;
  guard: CardGuard;
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
      <WaitingCard key={`${item.botId}:${item.n}`} botId={context.bot.id} item={item} readOnly={context.readOnly} render={render} guard={guard} />
    </div>
  );
}

export function WorkerApprovals({ context, renderApproval }: WorkerApprovalsProps) {
  const t = useT();
  const waiting = useMemo(
    () => [...context.approvals, ...(context.questions ?? [])].sort((a, b) => stamp(b) - stamp(a) || b.n - a.n),
    [context.approvals, context.questions],
  );
  // an answered card stays a moment as one line in its place (BOT-23), and does not show again as a card
  const answered = useAnsweredLines(waiting.map((item) => ({ key: itemKey(item), stamp: item.updatedAt })));
  const live = useMemo(() => waiting.filter((item) => !answered.hides(itemKey(item), item.updatedAt)), [waiting, answered.hides]);
  const announcement = useArrivals(live);
  const items = useWorkerDockStructuralValue(live);
  const [selected, setSelected] = useState<number | null>(null);
  // the Home panel beside the chat already shows every card: here they stay folded until asked
  const sideDocked = useBotSideDocked(context.bot.paneId);
  const pageDocked = useBotPageDocked(context.bot.id);
  const folded = sideDocked || pageDocked;
  const open = folded ? (items.find((item) => item.n === selected) ?? null) : (items.find((item) => item.n === selected) ?? items[0] ?? null);
  // folded: each line stands where its card stood; unfolded: the open card is always first, so its line is too
  const rows = layoutRows(items, folded ? answered.lines : answered.lines.map((line) => ({ ...line, index: 0 })));
  // the guard key counts the lines above a card: a line that appears or leaves moves the cards under it
  const keyOf = (item: BotItem, linesAbove: number): string => guardKey(placeKey(item, item === open), linesAbove);
  const keys = rows.flatMap((row) => (row.kind === "card" ? [keyOf(row.card, row.linesAbove)] : []));
  // the Home panel's guard (card-placement.ts): a card that just appeared or moved ignores answers for 500 ms;
  // before the early return, so a first card that appears later counts as new
  const isSettled = useSettledCards(keys);
  const looksSettled = useSettledLook(keys);
  const status = <span key={announcement?.id} className="sr-only" role="status" aria-live="polite">{announcement?.text}</span>;
  if (rows.length === 0) return status;
  const card = (item: BotItem, linesAbove: number, onHide?: () => void) => {
    const key = keyOf(item, linesAbove);
    const guard: CardGuard = {
      canAnswer: () => isSettled(key),
      settled: looksSettled(key),
      onAnswered: (_answer, text) => {
        answered.add({ key: itemKey(item), stamp: item.updatedAt, text, index: items.indexOf(item) });
        setSelected(null);
      },
    };
    return <OpenCard key={`${item.botId}:${item.n}`} item={item} context={context} render={renderApproval} guard={guard} onHide={onHide} />;
  };
  const line = (key: string, text: string) => <AnsweredLine key={`line:${key}`} text={text} className="mx-4 mt-1" />;
  // the scroll box: its top edge fades while scrolled, and an open card's action row stays in sight (chat.css)
  const box = "native-chat-worker-approvals scrollbar-sleek min-h-0 shrink overflow-y-auto overscroll-contain pb-2";
  if (folded) {
    return (
      <div className={box} data-native-chat-worker-approvals="" data-native-chat-worker-approvals-folded="">
        {status}
        <div role="region" aria-label={t("Waiting on you")} className="min-h-0">
          {rows.map((row) => {
            if (row.kind === "line") return line(row.line.key, row.line.text);
            const item = row.card;
            return item === open
              ? card(item, row.linesAbove, () => setSelected(null))
              : <FoldedRow key={`${item.botId}:${item.n}`} item={item} text={t("{name} · Waiting on you", { name: itemName(item) })} onShow={() => setSelected(item.n)} />;
          })}
        </div>
      </div>
    );
  }
  const queued = items.filter((item) => item !== open);
  return (
    <div className={box} data-native-chat-worker-approvals="">
      {status}
      {answered.lines.map((each) => line(each.key, each.text))}
      {open ? card(open, answered.lines.length) : null}
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
