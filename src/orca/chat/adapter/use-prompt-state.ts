// TermWeave's own prompt reader for the Orca chat (no Orca file: Orca's prompts come from its journal).
// COPY, not a move: the `pollPrompt` effect of src/components/ChatView.tsx (lines 677-698 before the
// hook move of 2026-11-27, lines 464-485 after it). ChatView.tsx keeps its own copy,
// because there the prompt also drives `onPrompt`, `onSuggestion` and the typed answer, and moving it
// would change ChatView's code beyond the one hook move the lead allowed. Keep the two in step.
import { useCallback, useEffect, useRef, useState } from "react";

import { useMachineApi } from "../../../lib/machineContext.tsx";
import { POLL_MS } from "../../../lib/useConversation.ts";
import { usePageVisible } from "../../../lib/visibility.ts";
import type { InteractivePrompt } from "../../../../shared/protocol.ts";

export interface PromptState {
  prompt: InteractivePrompt | null;
  /** With no prompt waiting, the next prompt the agent suggests (Claude's grey input text). */
  suggestion: string | null;
  /** Read again now (after an answer, or a form's next step). */
  refresh: () => void;
}

/**
 * The agent's waiting prompt, polled every 2s while the page is visible.
 * Decision: `enabled` (default true) is an addition to SPEC 5.2; pass ChatView's
 * `connected && !ended && agent !== null`, since a Codex trust menu shows while the status is idle.
 */
export function usePromptState(paneId: string, refreshKey: number, enabled = true, sentKey = 0): PromptState {
  const { fetchPanePromptState } = useMachineApi();
  const visible = usePageVisible();
  const [prompt, setPrompt] = useState<InteractivePrompt | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  // As ChatView: a read begun before the latest send answers for the turn before it, so its suggestion
  // is dropped; and a send forgets the held one, so the next read is handed up even when it says the same.
  const sentKeyRef = useRef(sentKey);
  sentKeyRef.current = sentKey;
  useEffect(() => { if (sentKey > 0) setSuggestion(null); }, [sentKey]);

  useEffect(() => {
    setPrompt(null);
    setSuggestion(null);
  }, [paneId]);

  useEffect(() => {
    if (!enabled) { setPrompt(null); setSuggestion(null); return; }
    if (!visible) return;
    let cancelled = false;
    let timer = 0;
    const readPrompt = async (): Promise<void> => {
      const sent = sentKeyRef.current;
      try {
        const next = await fetchPanePromptState(paneId);
        if (!cancelled) {
          // the same prompt keeps its object: the composer and the card only change with it
          setPrompt((current) => current?.id === next.prompt?.id ? current : next.prompt);
          if (sentKeyRef.current === sent) setSuggestion(next.suggestion);
        }
      }
      catch { if (!cancelled) { setPrompt(null); setSuggestion(null); } }
      finally { if (!cancelled) timer = window.setTimeout(() => void readPrompt(), POLL_MS); }
    };
    void readPrompt();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled, paneId, pollKey, refreshKey, fetchPanePromptState, visible]);

  const refresh = useCallback(() => setPollKey((key) => key + 1), []);
  return { prompt: enabled ? prompt : null, suggestion: enabled && prompt === null ? suggestion : null, refresh };
}
