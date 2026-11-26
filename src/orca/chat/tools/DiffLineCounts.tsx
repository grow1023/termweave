// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/right-sidebar/source-control/listing/diff-line-counts.tsx; adapted for TermWeave.
import { cn } from "../../cn.ts";

export function DiffLineCounts({ added, removed, size = "xs" }: { added?: number; removed?: number; size?: "xs" | "sm" }) {
  const hasAdded = typeof added === "number" && added > 0;
  const hasRemoved = typeof removed === "number" && removed > 0;
  if (!hasAdded && !hasRemoved) return null;
  return (
    <span className={cn("shrink-0 tabular-nums", size === "sm" ? "text-xs" : "text-[10px]")}>
      {hasAdded && <span style={{ color: "var(--git-decoration-added)" }}>+{added}</span>}
      {hasAdded && hasRemoved && <span> </span>}
      {hasRemoved && <span style={{ color: "var(--git-decoration-deleted)" }}>-{removed}</span>}
    </span>
  );
}
