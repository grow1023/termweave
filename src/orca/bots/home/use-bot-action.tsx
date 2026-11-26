// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/bot-presentation.ts (botErrorMessage); adapted for TermWeave.
// One server call at a time: the control stays off while it runs, and the server's refusal text stays on screen.
import { useCallback, useRef, useState } from "react";

import { cn } from "../../cn.ts";

export type BotAction = {
  busy: boolean;
  error: string | null;
  /** Runs the call; true when it went through. A second call while one runs is ignored. */
  run: (job: () => Promise<unknown>) => Promise<boolean>;
  clear: () => void;
};

export function useBotAction(): BotAction {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const run = useCallback(async (job: () => Promise<unknown>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await job();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, run, clear };
}

/** The refusal, where the user acted. */
export function ActionError({ message, className }: { message: string | null; className?: string }) {
  if (message === null) return null;
  return (
    <p role="alert" className={cn("break-words px-2 py-1 text-xs text-destructive", className)}>
      {message}
    </p>
  );
}
