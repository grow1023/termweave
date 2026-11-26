// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/disclosure/NativeChatExpandable.tsx; adapted for TermWeave.
import type { ReactNode } from "react";
import * as CollapsiblePrimitive from "radix-ui/collapsible";

// Decision: Orca's `collapsible-height-content` rule lives in its main.css; tw-animate-css (imported by
// orca.css) gives the same height animation as utilities. Both animations are finite.
const CONTENT_CLASS =
  "overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none";

/** Mount children only while open or closing; keep open-only work inside a child component. */
export function Expandable({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <CollapsiblePrimitive.Root open={open}>
      <CollapsiblePrimitive.Content className={CONTENT_CLASS}>{children}</CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}
