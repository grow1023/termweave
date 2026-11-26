// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemActivityList.tsx,
// BotItemCommentCard.tsx and BotItemWaitCard.tsx; adapted for TermWeave. An item's Activity: its comments, then what it waits on.
import { useT } from "../../../lib/i18n.ts";
import { botAge } from "../../../components/BotVisuals.tsx";
import { BotAvatar } from "../BotAvatar.tsx";
import { BotItemStatusIcon } from "../BotItemStatusIcon.tsx";
import type { Bot, BotItem } from "../data.ts";
import { ageText } from "./bot-when.ts";

function Time({ iso }: { iso: string }) {
  const t = useT();
  const age = ageText(botAge(iso), t);
  return <time dateTime={iso} title={iso} className="ml-auto shrink-0 text-2xs text-muted-foreground">{age}</time>;
}

function CommentCard({ bot, comment }: { bot: Bot; comment: BotItem["comments"][number] }) {
  const t = useT();
  const name = comment.by === "bot" ? bot.name : t("You");
  return (
    // Opaque under the surface's tint; it bleeds past the column so the avatar and time sit on the event rows' edges.
    <div className="relative -mx-2 my-1 rounded-[10px] bg-sidebar">
      <div
        role="article"
        aria-label={`${name}, ${ageText(botAge(comment.at), t)}`}
        className="rounded-[10px] bg-foreground/[0.035] px-2 pt-1.5 pb-2 inset-ring inset-ring-border outline-none dark:bg-muted"
      >
        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <div className="flex min-w-0 max-w-full flex-auto items-center gap-2">
            {comment.by === "bot" ? (
              <BotAvatar bot={bot} className="size-5 shrink-0 rounded-full text-[9px]" />
            ) : (
              <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">{name.slice(0, 1)}</span>
            )}
            <b className="min-w-0 truncate text-[13px] font-medium text-foreground">{name}</b>
          </div>
          <Time iso={comment.at} />
        </div>
        <p className="min-w-0 whitespace-pre-wrap pl-7 text-[13px] leading-[19px] text-foreground [overflow-wrap:anywhere]">{comment.text}</p>
      </div>
    </div>
  );
}

/** What a Waiting item waits on: the comment card's calm sibling, with nothing to answer. */
function WaitCard({ text, at }: { text: string; at: string }) {
  const t = useT();
  const title = t("Waiting on");
  return (
    <div className="relative -mx-2 my-1 rounded-[10px] bg-sidebar">
      <div role="article" aria-label={title} className="rounded-[10px] bg-foreground/[0.035] px-2 pt-1.5 pb-2 inset-ring inset-ring-border dark:bg-muted">
        <div className="mb-1 flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-auto items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center"><BotItemStatusIcon status="waiting" /></span>
            <b className="min-w-0 truncate text-[13px] font-medium text-foreground">{title}</b>
          </div>
          <Time iso={at} />
        </div>
        <p className="min-w-0 whitespace-pre-wrap pl-7 text-[13px] leading-[19px] text-foreground [overflow-wrap:anywhere]">{text}</p>
      </div>
    </div>
  );
}

export function BotItemActivityList({ bot, item }: { bot: Bot; item: BotItem }) {
  const t = useT();
  const waiting = item.status === "waiting" && item.waitingOn ? item.waitingOn : null;
  return (
    <>
      <div className="relative flex flex-col">
        {item.comments.map((comment, index) => (
          <CommentCard key={`${index}:${comment.at}`} bot={bot} comment={comment} />
        ))}
        {waiting ? <WaitCard text={waiting} at={item.updatedAt} /> : null}
      </div>
      {item.comments.length > 0 ? null : (
        <p className="pt-0.5 text-xs leading-[18px] text-muted-foreground">{t("No comments yet.")}</p>
      )}
    </>
  );
}
