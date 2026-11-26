// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/reasoning/NativeChatTurnActivityLine.tsx; adapted for TermWeave.
import { useId } from "react";

import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { useT } from "../../../lib/i18n.ts";
import { Expandable, useDisclosure } from "../shared/index.ts";
import { ReasoningBody, ReasoningChevron, reasoningKey } from "./ReasoningRow.tsx";

/**
 * The live tail of a running turn: "Thinking" while the newest message is reasoning (its text opens
 * here), else "Working…". Decision: no activity text; TermWeave's transcript gives no live tool label.
 */
export function ActivityLine({ reasoning }: { reasoning: { messageId: string; markdown: string } | null }) {
  const t = useT();
  const label = reasoning ? t("Thinking") : t("Working…");
  // The finished row reads this key too, so a block opened here lands open once it ends.
  const disclosure = useDisclosure(reasoning ? reasoningKey(reasoning.messageId) : undefined, false);
  const open = reasoning !== null && disclosure.open;
  const labelId = useId();
  return (
    <div>
      {/* Keep one live region so label changes announce; overlay its trigger and place reasoning outside it. */}
      <div
        className="group/reasoning relative flex min-h-6 items-center gap-1.5 text-sm leading-relaxed text-chat-foreground-faint"
        data-native-chat-turn-activity="true"
        data-state={open ? "open" : "closed"}
        aria-live="polite"
        aria-atomic="true"
      >
        <LoadingSpinner className="size-4 shrink-0" />
        <span id={labelId} className="min-w-0 truncate text-chat-foreground">
          {label}
        </span>
        {reasoning ? (
          <>
            <ReasoningChevron />
            <button
              type="button"
              aria-labelledby={labelId}
              aria-expanded={open}
              onClick={() => disclosure.setOpen(!open)}
              className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          </>
        ) : null}
      </div>
      {reasoning ? (
        <Expandable open={open}>
          <ReasoningBody markdown={reasoning.markdown} />
        </Expandable>
      ) : null}
    </div>
  );
}
