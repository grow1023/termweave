// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/runs/NativeChatToolRunCallCounts.tsx; adapted for TermWeave.
// Cut: the interrupted count (TermWeave cannot tell a stopped call from a cut transcript).
import { useT } from "../../../lib/i18n.ts";

/** Failures stay outside truncation and on the first summary line so narrow panes cannot hide them. */
export function ToolRunCallCounts({ failed }: { failed: number }) {
  const t = useT();
  if (failed <= 0) return null;
  return (
    <span className="flex h-[1lh] shrink-0 items-center">
      <span
        aria-label={t("Failed tool calls: {count}", { count: failed })}
        className="shrink-0 font-sans text-xs tabular-nums text-chat-foreground-faint transition-colors group-hover/tool-run:text-chat-foreground"
      >
        <span aria-hidden> · </span>
        {t("{count} failed", { count: failed })}
      </span>
    </span>
  );
}
