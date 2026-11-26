// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/diffs/NativeChatDiffView.tsx; adapted for TermWeave.
import { cn } from "../../cn.ts";
import type { NativeChatDiffLine } from "./lib/diff.ts";

/** Diff rows as text; a line's content never renders as markup. */
export function DiffView({ lines }: { lines: NativeChatDiffLine[] }) {
  return (
    <div
      data-native-chat-code-content
      className="overflow-hidden rounded-lg border border-chat-code-border bg-chat-code-surface py-1 font-mono text-chat-code leading-relaxed text-chat-foreground"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre-wrap break-words px-2",
            line.kind === "add" && "bg-[var(--diff-added-background)] text-chat-diff-added",
            line.kind === "del" && "bg-[var(--diff-removed-background)] text-chat-diff-removed",
            line.kind === "meta" && "text-chat-foreground-faint",
            line.kind === "context" && "text-chat-foreground",
          )}
        >
          {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
          {line.text}
        </div>
      ))}
    </div>
  );
}
