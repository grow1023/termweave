// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/rows/NativeChatAssistantMessageRow.tsx
// and messages/actions/NativeChatAgentControls.tsx; adapted for TermWeave.
import { useRef } from "react";
import { ArrowUp, FileText } from "lucide-react";

import { cn } from "../../cn.ts";
import { useT } from "../../../lib/i18n.ts";
import { isImageRefBlock, isToolBlock, useChatSlots } from "../shared/index.ts";
import type { NativeChatMessage, NativeChatToolCallBlock } from "../shared/index.ts";
import { CopyButton } from "./CopyButton.tsx";
import { MessageTimestamp } from "./MessageTimestamp.tsx";
import { messageMarkdown, plainText } from "./transcript-model.ts";

const CONTROL_CLASS =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11";

/**
 * Copy, "Scroll this message to top" and the time. Decision: TermWeave keeps a plain-text copy beside
 * Orca's markdown copy (ChatView's MD/TXT pair, SPEC 6.3).
 */
function AgentControls({ markdown, timestamp, onScrollToTop, className }: { markdown: string; timestamp: number | null; onScrollToTop: () => void; className?: string }) {
  const t = useT();
  return (
    <div className={cn("mt-1 flex items-center gap-1", className)}>
      {markdown.length > 0 ? (
        <>
          <CopyButton text={markdown} label={t("Copy as markdown")} />
          <CopyButton text={plainText(markdown)} label={t("Copy as plain text")} icon={<FileText className="size-3.5" />} />
        </>
      ) : null}
      <button
        type="button"
        onClick={onScrollToTop}
        aria-label={t("Scroll this message to top")}
        title={t("Scroll this message to top")}
        className={CONTROL_CLASS}
      >
        <ArrowUp className="size-3.5" />
      </button>
      <MessageTimestamp timestamp={timestamp} />
    </div>
  );
}

export interface AssistantMessageRowProps {
  message: NativeChatMessage;
  /** The words of the whole turn, copied by the controls on its last message. */
  turnMarkdown: string;
  /** The turn is running: no controls yet, more may arrive. */
  activeTurnIsWorking: boolean;
  /** The last message of the transcript. */
  trailing: boolean;
  latestResponse: boolean;
  previousTodoWrite?: NativeChatToolCallBlock;
  loadFullOutput: (ref: string) => Promise<string>;
}

export function AssistantMessageRow(props: AssistantMessageRowProps) {
  const { message, turnMarkdown, activeTurnIsWorking, trailing, latestResponse } = props;
  const { Markdown, Images, ToolRun } = useChatSlots();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const isSystem = message.role === "system";
  const words = messageMarkdown(message);
  const images = message.blocks.filter(isImageRefBlock);
  const tools = message.blocks.filter(isToolBlock);
  const showControls = !isSystem && message.endsTurn && (turnMarkdown.length > 0 || images.length > 0) && !activeTurnIsWorking;
  const scrollToTop = (): void => rowRef.current?.scrollIntoView({ block: "start" });
  return (
    <div
      ref={rowRef}
      data-native-chat-message-id={showControls && words.length > 0 ? message.id : undefined}
      data-native-chat-message-tone={isSystem ? "faint" : undefined}
      className={cn(
        "group relative max-w-full select-text text-sm leading-relaxed text-chat-foreground",
        isSystem && "text-xs text-chat-foreground-faint",
      )}
    >
      {images.length > 0 ? <Images images={images} /> : null}
      {words ? <Markdown content={words} className="text-sm" tone={isSystem ? "faint" : "normal"} /> : null}
      {tools.length > 0 ? (
        <ToolRun
          blocks={tools}
          live={activeTurnIsWorking && trailing}
          followsProse={words.length > 0 || images.length > 0}
          disclosureId={message.id}
          previousTodoWrite={props.previousTodoWrite}
          loadFullOutput={props.loadFullOutput}
        />
      ) : null}
      {showControls ? (
        <AgentControls
          markdown={turnMarkdown}
          timestamp={message.timestamp}
          onScrollToTop={scrollToTop}
          className={cn(
            "w-fit select-none",
            !latestResponse &&
              "transition-opacity can-hover:pointer-events-none can-hover:opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          )}
        />
      ) : null}
    </div>
  );
}
