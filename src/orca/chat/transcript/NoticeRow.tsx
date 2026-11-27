// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/notices/NativeChatNoticeRow.tsx
// (plain paths) and src/renderer/src/components/native-chat/NativeChatDividerRow.tsx; adapted for TermWeave.
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../cn.ts";
import { useT } from "../../../lib/i18n.ts";
import { disclosureKey, Expandable, isTextBlock, useChatSlots, useDisclosure } from "../shared/index.ts";
import type { NativeChatMessage } from "../shared/index.ts";
import { noticeLabel } from "./notice-label.ts";

const LINE_CLASS = "min-w-0 max-w-full select-text text-sm text-chat-foreground-faint [overflow-wrap:anywhere]";

/** A quiet line across the transcript with a label in the middle. */
export function DividerRow({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 py-2 text-xs text-chat-foreground-faint">
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1">{children ?? label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Orca's divider with its label as a toggle. Decision: TermWeave shows the compaction summary and a
 * notice's text on request (ChatView's `<details>`), so the label opens them; the rule stays Orca's.
 * The wrapper drops `role="separator"`, which may not hold a button.
 */
function DividerDisclosure({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const disclosure = useDisclosure(disclosureKey(id, "notice"), false);
  return (
    <div>
      <div className="flex items-center gap-3 py-2 text-xs text-chat-foreground-faint">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <button
          type="button"
          aria-expanded={disclosure.open}
          onClick={() => disclosure.setOpen(!disclosure.open)}
          className="flex items-center gap-1 rounded-sm hover:text-chat-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
        >
          <span>{label}</span>
          <ChevronRight aria-hidden className={cn("size-3 transition-transform motion-reduce:transition-none", disclosure.open && "rotate-90")} />
        </button>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <Expandable open={disclosure.open}>{children}</Expandable>
    </div>
  );
}

/** A system message: a compaction, a runtime notice, an interruption, or a skill the user invoked. */
export function NoticeRow({ message }: { message: NativeChatMessage }) {
  const t = useT();
  const { Markdown } = useChatSlots();
  const block = message.blocks.find(isTextBlock);
  if (!block) return null;
  switch (block.presentation) {
    case "compact":
      return (
        <DividerDisclosure id={message.id} label={t("Context compacted")}>
          <div className="pb-2 text-chat-foreground-faint">
            <Markdown content={block.text} className="text-sm" tone="faint" />
          </div>
        </DividerDisclosure>
      );
    case "notice":
      return (
        <DividerDisclosure id={message.id} label={noticeLabel(block, t)}>
          {/* Why: command output is laid out in columns; proportional type breaks its grid. */}
          <pre className="whitespace-pre-wrap break-words pb-2 font-mono text-xs text-chat-foreground">{block.text}</pre>
        </DividerDisclosure>
      );
    case "interrupted":
      return <p className={LINE_CLASS}>{t("Conversation interrupted")}</p>;
    case "skill":
      return <p className={LINE_CLASS}>{t("Skill invoked: {name}", { name: block.text })}</p>;
    default:
      return <p className={cn(LINE_CLASS, "whitespace-pre-wrap")}>{block.text}</p>;
  }
}
