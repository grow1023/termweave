// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemCommentBox.tsx; adapted for TermWeave.
// The comment box at the item's foot: the chat composer's surface with the text and a send button (no files, no mic).
import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { botsApi } from "../data.ts";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

export function BotItemCommentBox({ botId, n }: { botId: string; n: number }) {
  const t = useT();
  const act = useBotAction();
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement | null>(null);
  const empty = text.trim().length === 0;
  // A refused comment stays in the box, so nothing typed is lost.
  const send = (): void => {
    const comment = text.trim();
    if (!comment || act.busy) return;
    void act.run(() => botsApi.ownerItem(botId, n, { comment })).then((ok) => {
      if (ok) setText("");
    });
  };
  return (
    <div
      data-bot-item-comment=""
      onClick={() => input.current?.focus()}
      className="mx-3 mb-3 mt-2 flex shrink-0 cursor-text flex-col rounded-xl border border-chat-composer-border bg-chat-composer-surface px-1.5 pb-1.5 pt-1 shadow-xs"
    >
      <div className="flex flex-wrap items-end gap-0.5">
        <textarea
          ref={input}
          rows={1}
          value={text}
          disabled={act.busy}
          aria-label={t("Comment")}
          aria-describedby={act.error ? "bot-item-comment-error" : undefined}
          placeholder={t("Write a comment…")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter breaks the line; a composing IME owns its Enter.
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!event.repeat) send();
          }}
          className="scrollbar-sleek block max-h-[10lh] min-h-8 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1.5 text-sm leading-5 text-chat-foreground-strong outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:opacity-60"
        />
        <Button size="icon-round" className="pointer-coarse:size-11" aria-label={t("Send comment")} disabled={empty || act.busy} onClick={send}>
          <ArrowUp className="size-4" />
        </Button>
      </div>
      <div id="bot-item-comment-error"><ActionError message={act.error} className="px-1" /></div>
    </div>
  );
}
