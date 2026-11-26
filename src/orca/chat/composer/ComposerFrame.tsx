// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/composer/editor/NativeChatComposerField.tsx; adapted for TermWeave.
import type { DragEvent, ReactNode } from "react";

import { cn } from "../../cn.ts";

export interface ComposerFrameProps {
  /** The text input: TermWeave's textarea, never a new one (its IME and draft handling stay where they are). */
  input: ReactNode;
  /** The row under the input: `ComposerActions`. */
  actions: ReactNode;
  /** Above the card: the slash or @ menu (`CommandMenu`), positioned against this column. */
  menus?: ReactNode;
  /** Above the card: notes (role="alert") and hints. */
  notices?: ReactNode;
  /** Inside the card, above the input: `AttachmentChip`s. Nothing is drawn while it is empty. */
  attachments?: ReactNode[];
  /** Under the card, inside the column: the dictation pill, a terminal-only hint. */
  footer?: ReactNode;
  /** A file is dragged over the card. */
  dragging?: boolean;
  onDragEnter?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  /** The group's accessible name; TermWeave's is "Message composer". */
  label: string;
  className?: string;
}

/**
 * Orca's composer field: the gutter, the centred column and the card. Presentational: every state and
 * handler comes in as a prop. Must sit inside `ChatRoot` (its gutter reads the root's `100cqi`).
 * Decision: no bottom safe-area padding here; the host keeps TermWeave's `.composer` padding rules
 * (Composer.css: home indicator, `[data-keyboard]`) until the frame owns them.
 */
export function ComposerFrame({
  input,
  actions,
  menus,
  notices,
  attachments = [],
  footer,
  dragging = false,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  label,
  className,
}: ComposerFrameProps) {
  return (
    <div data-composer-field="" role="group" aria-label={label} className={cn("@container/composer-field shrink-0 bg-chat-pane", className)}>
      <div className="native-chat-composer-gutter pt-2 pb-4">
        <div className="relative w-full mx-auto max-w-(--chat-content-max-width)">
          {menus}
          {notices ? <div className="mb-1.5 flex flex-col gap-1">{notices}</div> : null}
          <div
            data-native-chat-dock-pinned=""
            data-dragging={dragging || undefined}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              // Use a constant container border so focus changes cannot flash it.
              "group/composer rounded-xl border p-1.5 shadow-xs",
              "native-chat-composer-card",
              "border-chat-composer-border bg-chat-composer-surface",
              "[contain:paint]",
              // TermWeave: a drop target is shown with a ring, not a coloured edge.
              dragging && "ring-2 ring-ring",
            )}
          >
            {attachments.length > 0 ? <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1.5">{attachments}</div> : null}
            {input}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">{actions}</div>
          </div>
          {footer}
        </div>
      </div>
    </div>
  );
}

/**
 * Orca's input classes (NativeChatComposerField.tsx:304-314), for a `<textarea>` placed in the frame.
 * Decision: `text-base` on a coarse pointer, because iOS zooms the page into a field under 16px.
 */
export const COMPOSER_INPUT_CLASS = cn(
  "w-full bg-transparent px-2 py-1 text-sm outline-none resize-none",
  "min-h-12 max-h-[calc(8lh+0.5rem)] text-chat-foreground-strong placeholder:text-chat-foreground-faint pointer-coarse:min-h-14 pointer-coarse:text-base",
  "overflow-y-auto scrollbar-sleek",
  "disabled:cursor-not-allowed disabled:opacity-50",
);
