// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/conversation/turns/NativeChatWorkingStatus.tsx
// and use-native-chat-elapsed-seconds.ts; adapted for TermWeave.
import { useEffect, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { usePageVisible } from "../../../lib/visibility.ts";
import { formatDuration } from "./transcript-model.ts";

/**
 * A one-second clock while counting and the page is visible. Decision: one interval per running turn
 * bar (TermWeave runs one turn per pane), not Orca's shared `useNow`.
 */
function useElapsedSeconds(startedAt: number | null, counting: boolean): number {
  const visible = usePageVisible();
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!counting || !visible) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting, visible]);
  return counting ? Math.max(0, Math.floor((now - (startedAt ?? mountedAt)) / 1000)) : 0;
}

/**
 * The clock beneath the prompt. Decision: no toggle once settled; Orca's settled bar folds the turn's
 * details, and the first port does not fold turns.
 */
export function WorkingStatus({ startedAt, workedSeconds = null }: { startedAt: number | null; workedSeconds?: number | null }) {
  const t = useT();
  const active = workedSeconds == null;
  const elapsedSeconds = useElapsedSeconds(startedAt, active);
  const label = active
    ? t("Working for {duration}", { duration: formatDuration(elapsedSeconds) })
    : t("Worked for {duration}", { duration: formatDuration(workedSeconds) });
  return (
    // `tabular-nums`: the live clock reflows its own label every second otherwise.
    <div
      className="flex min-h-8 items-center gap-1 text-sm text-chat-foreground-faint tabular-nums border-b border-border"
      data-native-chat-turn-status={active ? "active" : "settled"}
      // Once settled, screen readers read the visible "Worked for…" text instead.
      aria-label={active ? t("Agent is responding") : undefined}
    >
      <span>{label}</span>
    </div>
  );
}
