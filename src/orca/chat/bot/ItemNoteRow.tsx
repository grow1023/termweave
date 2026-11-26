// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/bot-items/NativeChatBotItemNoteRow.tsx; adapted for TermWeave.
// TermWeave records only comments on an item (no moves, links or runs), so a note is one comment: the
// owner's as their own bubble headed by the item's chip, the bot's as the quiet ListTodo line.
// Left out: chips that open the item (TermWeave has no item links from the chat), chat chips, worker
// chips, bulk lines, runs of changes, comment images.
import { useEffect, useRef, useState } from "react";
import { ListTodo } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { BotItemStatusIcon } from "../../bots/BotItemStatusIcon.tsx";
import { statusName } from "../../bots/homepanel/bot-item-status-name.ts";
import type { BotItem } from "../../bots/data.ts";
import { disclosureKey, type ChatTimedRow } from "../shared/index.ts";
import { EventRow } from "./EventRow.tsx";

const ROW_SHARE = "min-w-0 max-w-fit flex-1 basis-0 truncate";
const READABLE_MIN = "min-w-[calc-size(max-content,min(size,6rem))]";
// Orca's inline chip look; a span here, since it opens nothing in TermWeave.
const INLINE_CHIP = `inline-flex ${READABLE_MIN} items-center gap-1 rounded-md bg-chat-foreground/[0.07] px-1.5 align-middle text-xs leading-5 text-chat-foreground`;
const ITEMS = "{items}";

function ItemChip({ item, className }: { item: BotItem; className?: string }) {
  const t = useT();
  return (
    <span
      role="img"
      aria-label={`${item.title}, ${statusName(item.status, t)}`}
      title={item.title}
      className={cn(INLINE_CHIP, className)}
    >
      <BotItemStatusIcon status={item.status} />
      <span aria-hidden className="min-w-0 truncate">{item.title}</span>
    </span>
  );
}

/** The bot's comment on the shared status row; a note cut short opens whole under it. */
function QuietLine({ row, botName }: { row: ChatTimedRow; botName: string }) {
  const t = useT();
  const text = row.item.comments[row.commentIndex]?.text ?? "";
  // The chip goes where the translated sentence names the item.
  const [lead = "", tail = ""] = t("Commented on {items}").split(ITEMS);
  const detail = useRef<HTMLSpanElement | null>(null);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = detail.current;
    if (!node || !text || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setCut(node.scrollWidth > node.clientWidth + 1));
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);
  const label = [botName, `${lead}${row.item.title}${tail}`.trim()].filter(Boolean).join(": ").concat(text ? `: ${text}` : "");
  return (
    <EventRow
      icon={<ListTodo className="size-3.5" aria-hidden />}
      label={label}
      time={row.at}
      disclosureKey={disclosureKey(row.key, "note")}
      detail={cut ? <p className="whitespace-pre-wrap">{text}</p> : undefined}
      lead={
        <>
          {lead.trim() ? <span className="shrink-0">{lead.trim()}</span> : null}
          <ItemChip item={row.item} />
          {tail.trim() || text ? (
            <span ref={detail} className={text ? ROW_SHARE : "shrink-0"}>
              {tail.trim()}
              {text ? <span className="text-chat-foreground">: {text}</span> : null}
            </span>
          ) : null}
        </>
      }
    />
  );
}

/** The owner's comment: their own message, headed by the item's chip. */
function CommentRow({ row }: { row: ChatTimedRow }) {
  const text = row.item.comments[row.commentIndex]?.text ?? "";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex max-w-[80%] flex-col items-start gap-1.5 rounded-xl border border-chat-user-border bg-chat-user-surface px-3.5 py-2.5 text-sm text-chat-foreground-strong">
        <ItemChip item={row.item} className="max-w-full flex-none" />
        {text.trim() ? <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</div> : null}
      </div>
    </div>
  );
}

/** One item comment between the messages, at its time. Text is drawn as text, never as HTML. */
export function ItemNoteRow({ row, botName }: { row: ChatTimedRow; botName: string }) {
  const comment = row.item.comments[row.commentIndex];
  if (!comment) return <></>;
  return (
    <div data-native-chat-item-note={row.key} className="flex flex-col gap-1.5">
      {comment.by === "owner" ? <CommentRow row={row} /> : <QuietLine row={row} botName={botName} />}
    </div>
  );
}
