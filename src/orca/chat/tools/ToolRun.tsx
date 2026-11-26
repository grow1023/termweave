// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/runs/NativeChatToolRun.tsx; adapted for TermWeave.
// Changes (SPEC 5.4): the header is TermWeave's rewrite (lib/tool-run-header.ts); the live sentence is
// static text after a stepped LoadingSpinner instead of a pulsing text class. Cut: ask rows, subagent rosters,
// background tasks, the browser page button, the viewed-images strip, and asides.
import { Check } from "lucide-react";
import { useMemo } from "react";

import { useLocale, useT, type Translate } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { disclosureKey, Expandable, isToolBlock, useDisclosure, type ToolRunProps } from "../shared/index.ts";
import { nativeChatToolRunHeader, type NativeChatToolRunFallbackLabel } from "./lib/tool-run-header.ts";
import { nativeChatToolRunSentence } from "./lib/tool-run-sentence.ts";
import { ToolOutputLoaderContext } from "./loader-context.ts";
import { ToolRunIcon } from "./ToolIcon.tsx";
import { ToolRunCallCounts } from "./ToolRunCallCounts.tsx";
import { ToolRunMembers } from "./ToolRunMembers.tsx";
import { toolRunSentenceWords } from "./words.ts";

function fallbackText(label: NativeChatToolRunFallbackLabel, count: number, t: Translate): string {
  switch (label) {
    case "result": return t("Result");
    case "countOne": return t("1 tool call");
    case "countN": return t("{count} tool calls", { count });
  }
}

/** One header line for a message's tool calls; it opens to one row per call, diff card, or task list. */
export function ToolRun({ blocks: allBlocks, live: turnLive, followsProse, disclosureId, previousTodoWrite, loadFullOutput }: ToolRunProps) {
  const t = useT();
  const locale = useLocale();
  const blocks = useMemo(() => allBlocks.filter(isToolBlock), [allBlocks]);
  const header = useMemo(() => nativeChatToolRunHeader(blocks, turnLive), [blocks, turnLive]);
  const { open, setOpen } = useDisclosure(disclosureKey(disclosureId, "run"), false);
  const sentence = useMemo(
    () => nativeChatToolRunSentence(blocks, { live: header.live }, toolRunSentenceWords(t, locale)),
    [blocks, header.live, locale, t],
  );
  if (blocks.length === 0) return null;
  const { live } = header;

  return (
    <ToolOutputLoaderContext.Provider value={loadFullOutput}>
      <div className={cn("min-w-0", followsProse && "mt-2")}>
        <div className="flex min-w-0 items-start gap-1">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="group/tool-run flex min-h-6 min-w-0 flex-1 items-start gap-1.5 rounded-md py-0.5 text-left text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11"
            aria-expanded={open}
            aria-live="polite"
            data-native-chat-tool-run-state={live ? "live" : "settled"}
          >
            {header.iconName ? (
              <span className="flex h-[1lh] shrink-0 items-center">
                <ToolRunIcon iconName={header.iconName} className="text-chat-foreground-faint" />
              </span>
            ) : null}
            {live ? (
              <span className="flex h-[1lh] shrink-0 items-center text-chat-foreground-faint">
                <LoadingSpinner className="size-3.5" />
              </span>
            ) : null}
            {/* Keep the collapsed header bounded; the tool detail carries the full command. */}
            <span
              className={cn(
                "min-w-0 line-clamp-2 whitespace-normal break-words text-sm leading-relaxed transition-colors",
                live ? "max-w-[72%] shrink-0 text-chat-foreground" : "min-w-0 text-chat-foreground-faint group-hover/tool-run:text-chat-foreground",
              )}
            >
              {sentence ?? fallbackText(header.fallbackLabel, header.callCount, t)}
            </span>
            <ToolRunCallCounts failed={header.failedCallCount} />
            {/* Mark only stated success after settlement. */}
            {!live && header.succeeded ? (
              <span className="flex h-[1lh] shrink-0 items-center">
                <Check aria-hidden className="size-3 shrink-0 text-chat-foreground-faint" />
              </span>
            ) : null}
            {header.latestCallLabel ? (
              <span className="flex h-[1lh] min-w-0 items-center">
                <span className="min-w-0 truncate font-sans text-xs text-chat-foreground-faint">{header.latestCallLabel}</span>
              </span>
            ) : null}
          </button>
        </div>
        <Expandable open={open}>
          <ToolRunMembers blocks={blocks} previousTodoWrite={previousTodoWrite} disclosureId={disclosureId} runningCall={header.runningCall} />
        </Expandable>
      </div>
    </ToolOutputLoaderContext.Provider>
  );
}
