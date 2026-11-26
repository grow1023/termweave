// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/queue/NativeChatQueuedMessageList.tsx, NativeChatQueueHeader.tsx, NativeChatQueuedMessageCard.tsx, NativeChatQueuedMessageRowTools.tsx and NativeChatPendingIcon.tsx; adapted for TermWeave.
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, ListEnd, Pencil, Send, Trash2 } from "lucide-react";

import { cn } from "../../cn.ts";
import { Button } from "../../ui/button.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { MAX_COMPOSER_CHARS } from "../../../lib/compose.ts";
import { useT } from "../../../lib/i18n.ts";

export interface QueuedMessagesProps {
  messages: { id: string; text: string }[];
  sendingId: string | null;
  error: { id: string; text: string } | null;
  unsaved: boolean;
  /** null: Send now is allowed; else why not (shown as title). */
  blockedReason: string | null;
  heading: string;
  onEdit: (id: string, text: string) => void;
  onSend: (id: string) => void;
  onDiscard: (id: string) => void;
}

const QUEUED_ROW_REVEAL =
  "pointer-events-none opacity-0 group-hover/queued:pointer-events-auto group-hover/queued:opacity-100 group-has-[:focus-visible]/queued:pointer-events-auto group-has-[:focus-visible]/queued:opacity-100 [@media(hover:none)]:group-focus-within/queued:pointer-events-auto [@media(hover:none)]:group-focus-within/queued:opacity-100";
/** TermWeave: a 24px row tool reaches 44px tall on a coarse pointer, without moving the row's layout. */
const COARSE_TALL_HIT = "relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2.5 pointer-coarse:before:content-['']";
const PENDING_SPINNER_DELAY_MS = 200;

function queuedRowToolsMask(toolCount: number): string {
  return `linear-gradient(to left, transparent ${toolCount * 24}px, #000 ${toolCount * 24 + 16}px)`;
}

/** Deferred so a fast round-trip never flashes a spinner; the button greys at once. */
function PendingIcon({ pending, className, children }: { pending: boolean; className: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!pending) { setShown(false); return; }
    const timer = setTimeout(() => setShown(true), PENDING_SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  return shown ? <LoadingSpinner className={className} /> : <>{children}</>;
}

function RowTool({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} disabled={disabled} onClick={onClick} className={COARSE_TALL_HIT}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>{label}</TooltipContent>
    </Tooltip>
  );
}

interface RowProps {
  message: { id: string; text: string };
  index: number;
  sending: boolean;
  anySending: boolean;
  error: string | null;
  blockedReason: string | null;
  onEdit: (text: string) => void;
  onSend: () => void;
  onDiscard: () => void;
}

/** One queued message: Orca's card row. Decision: Edit opens a plain textarea in the row (TermWeave edits live, no save step). */
function QueuedMessageRow({ message, index, sending, anySending, error, blockedReason, onEdit, onSend, onDiscard }: RowProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const fieldId = useId();
  const line = message.text.replace(/\s+/g, " ").trim();
  const empty = message.text.trim().length === 0;
  const maskStyle = { "--queued-tools-mask": queuedRowToolsMask(2) } as CSSProperties;
  return (
    <li data-queued-message-id={message.id} data-queued-message-state={sending ? "sending" : error ? "failed" : "queued"} tabIndex={-1}
      className="group/queued relative px-2.5 py-1.5 outline-none">
      <div className="flex items-center gap-1">
        <span className="relative flex size-3.5 shrink-0 items-center justify-center">
          {error ? <AlertCircle className="size-3.5 text-destructive" aria-hidden /> : <ListEnd className="size-3.5 text-muted-foreground" aria-hidden />}
        </span>
        <div style={maskStyle} className={cn("min-w-0 flex-1", !editing && (sending
          ? "[mask-image:var(--queued-tools-mask)]"
          : "group-hover/queued:[mask-image:var(--queued-tools-mask)] group-has-[:focus-visible]/queued:[mask-image:var(--queued-tools-mask)] [@media(hover:none)]:group-focus-within/queued:[mask-image:var(--queued-tools-mask)]"))}>
          <span className="sr-only">{t("Message {n}", { n: index + 1 })}</span>
          {editing ? null : <p className="truncate text-sm text-foreground" title={message.text}>{line}</p>}
          {error ? <p className="truncate text-xs text-destructive" role="status" title={error}>{error}</p> : null}
        </div>
        <div className="relative flex shrink-0 items-center gap-1">
          <div className={cn("absolute inset-y-0 right-full flex items-center transition-opacity motion-reduce:transition-none", !editing && !sending && QUEUED_ROW_REVEAL)}>
            <RowTool label={editing ? t("Done") : t("Edit message")} disabled={sending} onClick={() => setEditing(!editing)}>
              {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
            </RowTool>
            <RowTool label={t("Discard")} disabled={sending} onClick={onDiscard}>
              <Trash2 className="size-3.5" />
            </RowTool>
          </div>
          <Button type="button" variant="ghost" size="xs" data-queued-message-send="" title={blockedReason ?? undefined}
            disabled={anySending || blockedReason !== null || empty} onClick={onSend} className="pointer-coarse:min-h-11">
            <PendingIcon pending={sending} className="size-3"><Send className="size-3" /></PendingIcon>
            {t("Send now")}
          </Button>
        </div>
      </div>
      {editing ? (
        <textarea
          id={fieldId}
          value={message.text}
          rows={Math.min(4, Math.max(2, message.text.split("\n").length))}
          aria-label={t("Held message {n}", { n: index + 1 })}
          maxLength={MAX_COMPOSER_CHARS}
          disabled={sending}
          spellCheck={false} autoCapitalize="off" autoCorrect="off"
          onChange={(event) => onEdit(event.target.value)}
          className="scrollbar-sleek mt-1 block max-h-60 w-full resize-none overflow-y-auto rounded-md border border-border bg-chat-canvas px-2 py-1 pl-5.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:text-base"
        />
      ) : null}
    </li>
  );
}

/**
 * The queue above the composer, in Orca's look. Presentational: TermWeave's PaneTerminal keeps the
 * queue store and the sending; this draws it. Decision: no drag reorder (no dnd-kit), no steer, no
 * pause/resume or clear-all (TermWeave's queue has none), no row cap with "+N more" (the list scrolls).
 */
export function QueuedMessages({ messages, sendingId, error, unsaved, blockedReason, heading, onEdit, onSend, onDiscard }: QueuedMessagesProps) {
  const t = useT();
  const listId = useId();
  const [expanded, setExpanded] = useState(true);
  if (messages.length === 0) return <div aria-live="polite" data-native-chat-queue="" className="relative shrink-0" />;
  return (
    <div aria-live="polite" data-native-chat-queue="" className="relative shrink-0">
      <section aria-label={t("Held messages")} className="@container shrink-0 bg-chat-pane px-3 pt-2 sm:px-4">
        <div className="mx-auto w-full max-w-(--chat-content-max-width) rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground shadow-xs">
          <div data-native-chat-dock-pinned="" className="flex h-8 items-center gap-1 px-1.5 pointer-coarse:h-11">
            <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}
              className="group/queue-header flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11">
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground group-hover/queue-header:text-accent-foreground">
                  {/* the heading carries the count, so it reads the same open or closed */}
                  {heading}
                </span>
              </span>
              {expanded ? <ChevronUp className="size-3 shrink-0" aria-hidden /> : <ChevronDown className="size-3 shrink-0" aria-hidden />}
            </button>
          </div>
          {unsaved ? <p className="px-3 pb-1 text-xs text-destructive" role="status">{t("Queue could not be saved. Keep this tab open or copy the messages before reloading.")}</p> : null}
          <ul id={listId} hidden={!expanded} aria-label={t("Held messages")} className="scrollbar-sleek max-h-40 overflow-y-auto px-1.5 pb-1.5 has-[textarea]:max-h-72">
            {messages.map((message, index) => (
              <QueuedMessageRow key={message.id} message={message} index={index}
                sending={sendingId === message.id} anySending={sendingId !== null}
                error={error?.id === message.id ? error.text : null} blockedReason={blockedReason}
                onEdit={(text) => onEdit(message.id, text)} onSend={() => onSend(message.id)} onDiscard={() => onDiscard(message.id)} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
