// TermWeave's own helpers over the chat contract (types.ts, shaped after stablyai/orca, MIT,
// Copyright (c) 2026 Lovecast Inc.); no Orca file to copy: Orca narrows blocks inline.
import type {
  NativeChatBlock,
  NativeChatImageRefBlock,
  NativeChatTextBlock,
  NativeChatToolCallBlock,
  NativeChatToolResultBlock,
} from "./types.ts";

export function isTextBlock(block: NativeChatBlock): block is NativeChatTextBlock {
  return block.type === "text";
}

export function isToolCallBlock(block: NativeChatBlock): block is NativeChatToolCallBlock {
  return block.type === "tool-call";
}

export function isToolResultBlock(block: NativeChatBlock): block is NativeChatToolResultBlock {
  return block.type === "tool-result";
}

export function isImageRefBlock(block: NativeChatBlock): block is NativeChatImageRefBlock {
  return block.type === "image-ref";
}

/** A tool-call or tool-result block: what `ToolRunProps.blocks` carries. */
export function isToolBlock(block: NativeChatBlock): block is NativeChatToolCallBlock | NativeChatToolResultBlock {
  return block.type === "tool-call" || block.type === "tool-result";
}

/**
 * The one way to build a disclosure key, so packages cannot collide: parts joined with ":".
 * Decision: start with the message id, then the row kind, then an index, e.g.
 * `disclosureKey(message.id, "run")`, `disclosureKey(message.id, "line", callId)`.
 */
export function disclosureKey(...parts: (string | number)[]): string {
  return parts.join(":");
}
