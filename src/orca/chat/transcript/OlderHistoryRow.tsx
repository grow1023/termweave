// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/viewport/history/NativeChatOlderHistoryRow.tsx; adapted for TermWeave.
import { useEffect, useState } from "react";

import { Button } from "../../ui/button.tsx";
import { useT } from "../../../lib/i18n.ts";
import type { ChatFeed } from "../shared/index.ts";

/** Pages that land quickly (local reads) should not flash a label. */
const LOADING_LABEL_DELAY_MS = 200;

function DelayedLoadingLabel() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), LOADING_LABEL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <>{t("Loading earlier messages…")}</> : null;
}

/**
 * Out of flow at the top of the scroller (the column's `pt-10` leaves its room), so adding or removing
 * it never shifts the transcript. Decision: loading is automatic (scroll near the top, see
 * use-stick-to-bottom.ts), so Orca's manual "Load earlier messages" button shows only as Retry.
 */
export function OlderHistoryRow({ older, onRetry }: { older: ChatFeed["older"]; onRetry: () => void }) {
  const t = useT();
  if (older === "none") return null;
  return (
    <div data-native-chat-older-history="" className="absolute inset-x-0 top-0 flex h-10 items-center justify-center">
      {older === "failed" ? (
        <span className="flex max-w-full min-w-0 items-center gap-2 px-3 text-xs">
          <span role="alert" className="min-w-0 truncate text-destructive">
            {t("Couldn't load earlier messages.")}
          </span>
          <Button variant="outline" size="xs" className="shrink-0 pointer-coarse:min-h-11" onClick={onRetry}>
            {t("Retry")}
          </Button>
        </span>
      ) : (
        <span role="status" aria-live="polite" className="text-xs text-chat-foreground-faint">
          {older === "loading" ? <DelayedLoadingLabel /> : null}
        </span>
      )}
    </div>
  );
}
