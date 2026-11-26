// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/rows/NativeChatUserMessageRow.tsx,
// NativeChatUserBubble.tsx and NativeChatUserMessageFold.tsx; adapted for TermWeave.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../ui/button.tsx";
import { cn } from "../../cn.ts";
import { useT } from "../../../lib/i18n.ts";
import { disclosureKey, isImageRefBlock, useChatSlots, useDisclosure } from "../shared/index.ts";
import type { NativeChatMessage } from "../shared/index.ts";
import { CopyButton } from "./CopyButton.tsx";
import { MessageTimestamp } from "./MessageTimestamp.tsx";
import { messageMarkdown, userMessageFolds } from "./transcript-model.ts";

const USER_META_REVEAL =
  "transition-opacity can-hover:pointer-events-none can-hover:opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 [.group:has(:focus-visible)_&]:pointer-events-auto [.group:has(:focus-visible)_&]:opacity-100";

export function UserBubble({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[80%] rounded-xl border border-chat-user-border bg-chat-user-surface px-3.5 py-2.5 text-sm text-chat-foreground-strong",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A long prompt folds to `max-h-44` with "Show full message". */
function UserMessageFold({ messageId, markdown, className, children }: { messageId: string; markdown: string; className?: string; children: ReactNode }) {
  const t = useT();
  const disclosure = useDisclosure(disclosureKey(messageId, "user-message"), false);
  const longText = userMessageFolds(markdown);
  const [measured, setMeasured] = useState({ markdown, fits: false });
  const fits = measured.markdown === markdown && measured.fits;
  const folds = longText && !fits;
  const folded = folds && !disclosure.open;
  const clipRef = useRef<HTMLDivElement | null>(null);
  const clipId = useId();
  useLayoutEffect(() => {
    const clip = clipRef.current;
    if (!folded || !clip) return;
    const fitsNow = clip.scrollHeight <= clip.clientHeight;
    setMeasured((current) => (current.markdown === markdown && current.fits === fitsNow ? current : { markdown, fits: fitsNow }));
  }, [folded, markdown]);

  return (
    <>
      <div
        ref={clipRef}
        id={clipId}
        data-native-chat-user-message-folded={folded ? "" : undefined}
        className={cn(className, folded && "max-h-44 overflow-hidden mask-b-from-[calc(100%-1.75rem)]")}
        // Tabbing to a link under the fold scrolls the preview to it; the top returns once focus leaves.
        onBlur={(event) => {
          if (document.hasFocus() && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.scrollTop = 0;
        }}
      >
        {children}
      </div>
      {folds ? (
        <div className="-mr-1.5 -mb-1 mt-1 flex select-none justify-end">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="pointer-coarse:min-h-11"
            aria-expanded={disclosure.open}
            aria-controls={clipId}
            onClick={() => disclosure.setOpen(!disclosure.open)}
          >
            {disclosure.open ? t("Show less") : t("Show full message")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function UserMessageMeta({ markdown, timestamp }: { markdown: string; timestamp: number | null }) {
  if (!markdown && timestamp === null) return null;
  return (
    <div className={cn("flex select-none items-center gap-1", USER_META_REVEAL)}>
      {markdown ? <CopyButton text={markdown} /> : null}
      <MessageTimestamp timestamp={timestamp} focusable />
    </div>
  );
}

export function UserMessageRow({ message }: { message: NativeChatMessage }) {
  const { Markdown, Images } = useChatSlots();
  const markdown = messageMarkdown(message);
  const images = message.blocks.filter(isImageRefBlock);
  return (
    <div
      data-native-chat-message-id={markdown ? message.id : undefined}
      className="group relative flex flex-col gap-0.5 items-end"
    >
      <UserBubble>
        {images.length > 0 ? <Images images={images} /> : null}
        {markdown ? (
          <UserMessageFold
            messageId={message.id}
            markdown={markdown}
            // List numbers hang into the bubble's padding; clipping at the text edge cut them off.
            className="-mx-3.5 px-3.5"
          >
            <Markdown content={markdown} className="text-sm" />
          </UserMessageFold>
        ) : null}
      </UserBubble>
      <UserMessageMeta markdown={markdown} timestamp={message.timestamp} />
    </div>
  );
}
