// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/reasoning/NativeChatReasoningRow.tsx
// and NativeChatReasoningDisclosure.tsx; adapted for TermWeave.
import { Brain, ChevronRight } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { disclosureKey, Expandable, useChatSlots, useDisclosure } from "../shared/index.ts";
import type { NativeChatMessage } from "../shared/index.ts";
import { messageMarkdown } from "./transcript-model.ts";

/** The reasoning key, shared by the live line and the finished row so an open block stays open. */
export function reasoningKey(messageId: string): string {
  return disclosureKey(messageId, "reasoning");
}

/** Bound reasoning height so expanded streaming output cannot grow the transcript indefinitely. */
export function ReasoningBody({ markdown }: { markdown: string }) {
  const { Markdown } = useChatSlots();
  return (
    <div
      data-native-chat-message-tone="faint"
      className="scrollbar-sleek mt-1 max-h-80 overflow-y-auto pl-5.5 text-chat-foreground-faint"
    >
      <Markdown content={markdown} className="text-sm" tone="faint" />
    </div>
  );
}

export function ReasoningChevron() {
  return (
    <ChevronRight
      aria-hidden
      className="size-3.5 shrink-0 text-chat-foreground-faint transition-all can-hover:opacity-0 group-hover/reasoning:opacity-100 group-focus-visible/reasoning:opacity-100 [[class~='group/reasoning']:has(:focus-visible)_&]:opacity-100 group-data-[state=open]/reasoning:rotate-90 group-data-[state=open]/reasoning:opacity-100 motion-reduce:transition-none"
    />
  );
}

export function BrainGlyph() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-chat-foreground-faint">
      <Brain aria-hidden className="size-3.5" />
    </span>
  );
}

/**
 * Decision: the headline is always "Reasoning". Orca says "Thought for Ns" only for a block with a
 * completion time, which a Claude transcript does not give per block (Orca's bridge mode says the same).
 */
export function ReasoningRow({ message }: { message: NativeChatMessage }) {
  const t = useT();
  const disclosure = useDisclosure(reasoningKey(message.id), false);
  const markdown = messageMarkdown(message);
  if (!markdown.trim()) return null;
  return (
    <div className="min-w-0 text-sm text-chat-foreground-faint">
      <button
        type="button"
        aria-expanded={disclosure.open}
        data-state={disclosure.open ? "open" : "closed"}
        onClick={() => disclosure.setOpen(!disclosure.open)}
        className="group/reasoning flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <BrainGlyph />
        <span className="min-w-0 truncate text-sm leading-relaxed text-chat-foreground-faint transition-colors group-hover/reasoning:text-chat-foreground">
          {t("Reasoning")}
        </span>
        <ReasoningChevron />
      </button>
      <Expandable open={disclosure.open}>
        <ReasoningBody markdown={markdown} />
      </Expandable>
    </div>
  );
}
