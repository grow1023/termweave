// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/NativeChatSurface.tsx; adapted for TermWeave.
import type { ReactNode } from "react";

import { cn } from "../../cn.ts";
import { OrcaRoot } from "../../OrcaRoot.tsx";
import { ChatDisclosureProvider } from "./disclosure.tsx";
import "./chat.css";

/**
 * The chat's root: class `orca` (tokens) and `orca-chat` (chat.css) on one element, a size container
 * for the composer's `100cqi` padding, and the disclosure memory.
 * Decision: `historyId` is an addition to SPEC 5.1; pass `feed.historyId` so disclosures reset with the transcript.
 */
export function ChatRoot({ children, className, historyId = null }: { children: ReactNode; className?: string; historyId?: string | null }) {
  return (
    <OrcaRoot
      data-native-chat-root="true"
      className={cn("orca-chat bg-chat-canvas flex h-full min-h-0 w-full flex-col [container-type:size]", className)}
    >
      <ChatDisclosureProvider resetKey={historyId}>{children}</ChatDisclosureProvider>
    </OrcaRoot>
  );
}
