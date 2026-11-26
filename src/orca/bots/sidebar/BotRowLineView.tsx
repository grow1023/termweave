// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotRowActivityLine.tsx (BotRowLineView); adapted for TermWeave.
import { cn } from "../../cn.ts";
import { AttentionDot } from "./AttentionDot.tsx";
import type { BotRowLine } from "./bot-facts.ts";

/** The second line: its text truncates first. A question for the owner leads with the attention dot.
 *  A span, so it may sit inside the row's open button. */
export function BotRowLineView({ line }: { line: BotRowLine }): JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
      {line.attention ? <AttentionDot /> : null}
      {/* No title: the row's hover card shows the whole line. */}
      <span className={cn("min-w-0 flex-1 truncate", line.attention && "text-foreground")}>{line.text}</span>
    </span>
  );
}
