// An answered card, collapsed to one line for a moment (BOT-23): the owner sees that the answer went.
// It is a status, not a control, so the 500 ms guard has nothing to guard here.
import { Check } from "lucide-react";

import { cn } from "../../cn.ts";

export function AnsweredLine({ text, className }: { text: string; className?: string }) {
  return (
    <div
      role="status"
      data-bot-answered-line=""
      className={cn("flex min-h-9 min-w-0 items-center gap-2 rounded-xl bg-foreground/5 px-3.5 py-1.5 text-xs text-muted-foreground", className)}
    >
      <Check aria-hidden className="size-3.5 shrink-0" />
      <span title={text} className="min-w-0 truncate">{text}</span>
    </div>
  );
}
