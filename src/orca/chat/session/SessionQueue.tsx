// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/queue/NativeChatQueuedMessageList.tsx
// and NativeChatQueuedMessageCard.tsx (the frame and row classes, as src/orca/chat/composer/QueuedMessages.tsx copies them); adapted for TermWeave.
// Decision: a session bot's queue is the server's, with no edit, discard or Send now, so the rows carry no
// row tools (QueuedMessages always draws them); each row says its state instead.
import { useId, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, ListEnd } from "lucide-react";

import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { useT, type Translate } from "../../../lib/i18n.ts";
import type { QueueEntry, QueueEntryState } from "./queue-entries.ts";

function stateWord(state: QueueEntryState, t: Translate): string {
  switch (state) {
    case "sending": return t("Sending…");
    case "queued": return t("Waits for the current turn to end");
    case "delivering": return t("Sent, waiting for the bot to take it in");
    case "undelivered": return t("Not confirmed: the bot's process ended. Send it again if it does not answer.");
  }
}

function QueueRow({ entry, index }: { entry: QueueEntry; index: number }) {
  const t = useT();
  const line = entry.text.replace(/\s+/g, " ").trim();
  const failed = entry.state === "undelivered";
  return (
    <li data-queued-message-id={entry.id} data-queued-message-state={entry.state} className="relative px-2.5 py-1.5">
      <div className="flex items-start gap-1">
        <span className="relative mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
          {failed ? <AlertCircle className="size-3.5 text-destructive" aria-hidden />
            : entry.state === "sending" ? <LoadingSpinner className="size-3" />
              : <ListEnd className="size-3.5 text-muted-foreground" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <span className="sr-only">{t("Message {n}", { n: index + 1 })}</span>
          <p className="truncate text-sm text-foreground" title={entry.text}>{line}</p>
          <p className={failed ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{stateWord(entry.state, t)}</p>
        </div>
      </div>
    </li>
  );
}

/** The owner's messages that are not in the chat yet, above the composer in Orca's queue frame. */
export function SessionQueue({ entries }: { entries: QueueEntry[] }) {
  const t = useT();
  const listId = useId();
  const [expanded, setExpanded] = useState(true);
  if (entries.length === 0) return <div aria-live="polite" data-native-chat-queue="" className="relative shrink-0" />;
  return (
    <div aria-live="polite" data-native-chat-queue="" className="relative shrink-0">
      <section aria-label={t("Messages not in the chat yet")} className="@container shrink-0 bg-chat-pane px-3 pt-2 sm:px-4">
        <div className="mx-auto w-full max-w-(--chat-content-max-width) rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground shadow-xs">
          <div data-native-chat-dock-pinned="" className="flex h-8 items-center gap-1 px-1.5 pointer-coarse:h-11">
            <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}
              className="group/queue-header flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11">
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground group-hover/queue-header:text-accent-foreground">
                  {entries.length === 1 ? t("1 message waiting") : t("{n} messages waiting", { n: entries.length })}
                </span>
              </span>
              {expanded ? <ChevronUp className="size-3 shrink-0" aria-hidden /> : <ChevronDown className="size-3 shrink-0" aria-hidden />}
            </button>
          </div>
          <ul id={listId} hidden={!expanded} aria-label={t("Messages not in the chat yet")} className="scrollbar-sleek max-h-40 overflow-y-auto px-1.5 pb-1.5">
            {entries.map((entry, index) => <QueueRow key={entry.id} entry={entry} index={index} />)}
          </ul>
        </div>
      </section>
    </div>
  );
}
