// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/lines/NativeChatToolIcon.tsx; adapted for TermWeave.
import { Bot, Eye, Folder, Globe, ListChecks, Pencil, Plug, Search, SquareTerminal, Wrench, type LucideIcon } from "lucide-react";

import { cn } from "../../cn.ts";
import type { NativeChatMcpIdentity } from "../shared/index.ts";
import { nativeChatToolIconName, type NativeChatToolIconName } from "./lib/tool-icon.ts";

const NATIVE_CHAT_TOOL_GLYPHS: Record<NativeChatToolIconName, LucideIcon> = {
  eye: Eye,
  search: Search,
  folder: Folder,
  "square-terminal": SquareTerminal,
  pencil: Pencil,
  globe: Globe,
  plug: Plug,
  bot: Bot,
  "list-checks": ListChecks,
  wrench: Wrench,
};

/** Use the same fixed glyph slot for known and unknown categories to align rows. */
function GlyphSlot({ glyph: Glyph, className }: { glyph: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-4 shrink-0 items-center justify-center", className)}>
      <Glyph aria-hidden className="size-3.5" />
    </span>
  );
}

/** Decorative: the row renders the identifying tool word next to it. */
export function ToolIcon({ rowWord, mcpIdentity, className }: { rowWord: string; mcpIdentity?: NativeChatMcpIdentity; className?: string }) {
  return <GlyphSlot glyph={NATIVE_CHAT_TOOL_GLYPHS[nativeChatToolIconName(rowWord, mcpIdentity)]} className={className} />;
}

/** The glyph for a run's shared category, resolved by the caller. */
export function ToolRunIcon({ iconName, className }: { iconName: NativeChatToolIconName; className?: string }) {
  return <GlyphSlot glyph={NATIVE_CHAT_TOOL_GLYPHS[iconName]} className={className} />;
}
