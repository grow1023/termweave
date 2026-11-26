// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/rows/NativeChatMessageTimestamp.tsx; adapted for TermWeave.
import { cn } from "../../cn.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { useLocale, useT } from "../../../lib/i18n.ts";
import { formatMessageTime } from "./transcript-model.ts";

/**
 * Decision: Orca re-reads the day every 30s (`useNowSnapshot`); here the day is read at render, and
 * the 2s poll re-renders the rows often enough for "Yesterday" to stay right.
 */
export function MessageTimestamp({
  timestamp,
  focusable = false,
  className,
}: {
  timestamp: number | null;
  focusable?: boolean;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  if (timestamp === null) return null;
  const time = formatMessageTime(timestamp, locale, new Date(), (value) => t("Yesterday {time}", { time: value }));
  if (time === null) return null;
  return (
    <Tooltip>
      {/* The label already carries the full date in every reading mode; the tooltip would repeat it. */}
      <TooltipTrigger asChild aria-describedby={undefined}>
        <time
          dateTime={time.iso}
          aria-label={time.full}
          tabIndex={focusable ? 0 : undefined}
          className={cn(
            "rounded-md text-xs whitespace-nowrap text-chat-foreground-faint tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {time.text}
        </time>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {time.full}
      </TooltipContent>
    </Tooltip>
  );
}
