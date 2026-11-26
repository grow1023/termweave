// TermWeave's own slot context, after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.); Orca
// imports its markdown and tool rows directly, this lets each package compile and render alone.
import { createContext, useContext } from "react";

import { isToolCallBlock } from "./blocks.ts";
import type { ChatImagesProps, ChatMarkdownProps, ChatSlots, ToolRunProps } from "./types.ts";

export const ChatSlotsContext = createContext<ChatSlots | null>(null);

function FallbackMarkdown({ content, className }: ChatMarkdownProps) {
  return <p className={className ? `whitespace-pre-wrap ${className}` : "whitespace-pre-wrap"}>{content}</p>;
}

// Decision: draw nothing for images; a package that needs them gets the real slot from the integrator.
function FallbackImages(_props: ChatImagesProps) {
  return null;
}

// Decision: tool names only, one per line, no text to translate.
function FallbackToolRun({ blocks }: ToolRunProps) {
  const names = blocks.filter(isToolCallBlock).map((block) => block.name);
  if (names.length === 0) return null;
  return <pre className="whitespace-pre-wrap font-mono text-xs text-chat-foreground-faint">{names.join("\n")}</pre>;
}

/** Plain stand-ins used when no provider is mounted. */
export const fallbackChatSlots: ChatSlots = {
  Markdown: FallbackMarkdown,
  Images: FallbackImages,
  ToolRun: FallbackToolRun,
};

/** The slots the integrator provides, else `fallbackChatSlots`. */
export function useChatSlots(): ChatSlots {
  return useContext(ChatSlotsContext) ?? fallbackChatSlots;
}
