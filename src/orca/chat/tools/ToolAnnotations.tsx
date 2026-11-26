// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/lines/NativeChatToolAnnotations.tsx; adapted for TermWeave.
// Cut: NativeChatSearchResults (TermWeave's transcripts carry no web search result links).
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import type { NativeChatMcpIdentity, NativeChatToolCallBlock } from "../shared/index.ts";
import { formatToolDuration, mcpToolIdentity } from "./lib/tool-identity.ts";

/** An MCP tool reads "Server / tool"; any other tool its own name. */
export function ToolName({ name, mcpIdentity }: { name: string; mcpIdentity?: NativeChatMcpIdentity }) {
  const identity = mcpToolIdentity(name, mcpIdentity);
  return identity ? (
    <span title={name} className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{identity.server}</span>
      <span className="font-normal text-chat-foreground-faint">/</span>
      <span className="truncate font-normal">{identity.tool}</span>
    </span>
  ) : (
    <>{name}</>
  );
}

/** Exit code and duration badges; hidden until the runtime records them (SPEC 2.3). */
export function CommandMetadata({ block }: { block: NativeChatToolCallBlock }) {
  const t = useT();
  const duration = formatToolDuration(block.durationMs, (value) => `${value}ms`);
  const exitCode = Number.isSafeInteger(block.exitCode) ? block.exitCode : undefined;
  if (exitCode === undefined && duration === null) return null;
  return (
    <span className="ml-auto flex shrink-0 gap-1.5 font-sans text-xs tabular-nums text-chat-foreground-faint">
      {exitCode !== undefined ? <span className={cn(exitCode !== 0 && "text-destructive")}>{t("exit {code}", { code: exitCode })}</span> : null}
      {duration ? <span>{duration}</span> : null}
    </span>
  );
}
