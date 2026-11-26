// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/rows/NativeChatMessageTimestamp.tsx; adapted for TermWeave.
// Decision: WP1 owns the transcript's timestamp; this package keeps a small copy so its rows render alone.
import { useLocale, useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { useNow } from "../../bots/homepanel/use-now.ts";

function dayStart(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The full spoken time a timestamp shows, for a control that names its row by words and time. */
export function useChatTimeLabel(timestamp: number | null | undefined): string | null {
  const locale = useLocale();
  if (timestamp === null || timestamp === undefined || Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });
}

export function ChatTime({ timestamp, className }: { timestamp: number | null; className?: string }) {
  const locale = useLocale();
  const t = useT();
  const now = useNow(30_000);
  const full = useChatTimeLabel(timestamp);
  if (timestamp === null || full === null) return null;
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const today = dayStart(now);
  const day = dayStart(timestamp);
  const shown = day === today
    ? time
    : day === today - 86_400_000
      ? t("Yesterday {time}", { time })
      : `${date.toLocaleDateString(locale, { month: "short", day: "numeric" })} ${time}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild aria-describedby={undefined}>
        <time
          dateTime={date.toISOString()}
          aria-label={full}
          className={cn("rounded-md text-xs whitespace-nowrap text-chat-foreground-faint tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          {shown}
        </time>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {full}
      </TooltipContent>
    </Tooltip>
  );
}
