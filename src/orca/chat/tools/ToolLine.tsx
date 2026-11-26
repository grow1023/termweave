// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/lines/NativeChatToolLine.tsx; adapted for TermWeave.
// Changes: no syntax colours for the command (plain <pre>), no web search result links, and the
// tool's images go through the Images slot. `running` comes from the run (TermWeave has no call state).
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import {
  Expandable,
  isToolCallBlock,
  isToolResultBlock,
  useChatSlots,
  useDisclosure,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock,
} from "../shared/index.ts";
import { DiffView } from "./DiffView.tsx";
import { diffFromText, diffFromToolCall } from "./lib/diff.ts";
import { nativeChatToolLineView } from "./lib/tool-line-view.ts";
import { CommandMetadata, ToolName } from "./ToolAnnotations.tsx";
import { ToolFileTarget } from "./ToolFileTarget.tsx";
import { ToolIcon } from "./ToolIcon.tsx";
import { ToolOutput } from "./ToolOutput.tsx";
import { toolRowVerb } from "./words.ts";

const TARGET_CLASS = "min-w-0 truncate text-chat-foreground transition-colors group-hover/tool-line:text-chat-foreground-strong";

type ToolBlock = NativeChatToolCallBlock | NativeChatToolResultBlock;

/** Mounted only while open, so collapsed rows do no diff work. */
function ToolLineDetail({ block, body, fullCommand }: { block: ToolBlock; body: NativeChatToolResultBlock | undefined; fullCommand: string | null }) {
  const { Images } = useChatSlots();
  const diff = isToolCallBlock(block) ? diffFromToolCall(block.name, block.input) : isToolResultBlock(block) ? diffFromText(block.output) : null;
  return (
    <div className="ml-6 space-y-1.5 py-1">
      {diff ? <DiffView lines={diff} /> : null}
      {!diff && fullCommand ? (
        <pre
          data-native-chat-code-content
          className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-chat-code-border bg-chat-code-surface p-2 font-mono text-chat-code text-chat-foreground scrollbar-sleek"
        >
          {fullCommand}
        </pre>
      ) : null}
      {body ? <ToolOutput body={body} /> : null}
      {body?.images && body.images.length > 0 ? <Images images={body.images} /> : null}
    </div>
  );
}

/** A tool sentence with its output behind its own remembered disclosure. */
export function ToolLine({ block, result, running = false, disclosureKey }: {
  block: ToolBlock;
  /** Pair output with its call instead of adding a separate Result row. */
  result?: NativeChatToolResultBlock;
  /** The run is live and this is its call without a result. */
  running?: boolean;
  /** Identity this line's open state is remembered under while it is unmounted. */
  disclosureKey?: string;
}) {
  const t = useT();
  const { open: expanded, setOpen: setExpanded } = useDisclosure(disclosureKey, false);
  const view = useMemo(() => nativeChatToolLineView(block, result, running), [block, result, running]);
  const isCall = isToolCallBlock(block);
  const name = isCall ? block.name : t("Result");
  const { label: sharedLabel, body, resultPreview, failed, hasDetail } = view;
  const label = sharedLabel && { ...sharedLabel, verb: sharedLabel.verb === null ? null : toolRowVerb(sharedLabel.verb, t) };
  // A call opens to its output; its arguments are the row's own words, bar a shortened command.
  const fullCommand = label?.commandDetail ?? null;
  const commandAlone = label?.command === true && label.verb !== null && label.target.length > 0;

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={cn(
          "group/tool-line flex min-h-6.5 w-full min-w-0 items-center gap-2 rounded-md text-left font-sans text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11",
          hasDetail ? "cursor-pointer" : "cursor-default",
        )}
        aria-expanded={hasDetail ? expanded : undefined}
      >
        {isCall ? (
          <ToolIcon mcpIdentity={block.mcpIdentity} rowWord={name} className={failed ? "text-destructive/70" : "text-chat-foreground-faint"} />
        ) : (
          /* Result labels identify no tool category; reserve an empty slot for alignment. */
          <span aria-hidden className="size-4 shrink-0" />
        )}
        {label?.verb && label.verb !== name ? <span className="sr-only">{name} </span> : null}
        {commandAlone ? (
          // The run's header already says these ran; the row is the command itself.
          <span className="sr-only">{label?.verb} </span>
        ) : (
          <span className={cn("text-chat-foreground-faint transition-colors group-hover/tool-line:text-chat-foreground", label?.verb ? "shrink-0" : "min-w-0 truncate")}>
            {label?.verb ?? (isCall ? <ToolName name={name} mcpIdentity={block.mcpIdentity} /> : name)}
          </span>
        )}
        {label?.filePath ? (
          <ToolFileTarget path={label.filePath} label={label.target} className={TARGET_CLASS} />
        ) : (label?.target ?? resultPreview) ? (
          <span className={TARGET_CLASS} title={label?.title ?? resultPreview}>{label?.target ?? resultPreview}</span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          {isCall ? <CommandMetadata block={block} /> : null}
          {hasDetail ? (
            <ChevronRight className={cn("size-3.5 shrink-0 text-chat-foreground-faint transition-transform motion-reduce:transition-none", expanded && "rotate-90")} />
          ) : null}
        </span>
      </button>
      {hasDetail ? (
        <Expandable open={expanded}>
          <ToolLineDetail block={block} body={body} fullCommand={fullCommand} />
        </Expandable>
      ) : null}
    </div>
  );
}
