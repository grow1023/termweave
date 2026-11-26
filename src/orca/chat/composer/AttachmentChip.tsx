// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/attachments/chips/NativeChatImageAttachmentPreview.tsx; adapted for TermWeave.
import { AlertCircle, FileText, X } from "lucide-react";

import { cn } from "../../cn.ts";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { useT } from "../../../lib/i18n.ts";

export type AttachmentState = "uploading" | "ready" | "error";

export interface AttachmentChipProps {
  name: string;
  /** An object URL for an image, "" for a file without a thumbnail (TermWeave's PREVIEW_TYPES). */
  previewUrl: string;
  state: AttachmentState;
  onRemove: () => void;
}

/**
 * One attached file as Orca's 56px tile. Decision: no lightbox (SPEC 5.3 leaves it out) and no
 * number badge. The remove button keeps TermWeave's name "Remove {file}"; on a coarse pointer its
 * hit area grows to 44px around the 16px dot without changing the look.
 */
export function AttachmentChip({ name, previewUrl, state, onRemove }: AttachmentChipProps) {
  const t = useT();
  const pending = state === "uploading";
  const stateLabel = state === "uploading" ? t("Uploading") : state === "error" ? t("Failed") : t("Attached");
  return (
    <div className="relative size-14 shrink-0" data-attachment-state={state}>
      <div
        title={`${name} · ${stateLabel}`}
        aria-busy={pending}
        className={cn(
          "flex size-full items-center justify-center overflow-hidden rounded-md border bg-chat-canvas",
          state === "error" ? "border-destructive" : "border-border",
        )}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={name} className={cn("size-full object-cover", pending && "opacity-50")} />
        ) : (
          <span className="flex max-w-full flex-col items-center gap-1 px-1">
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="max-w-full truncate text-xs text-muted-foreground">{name}</span>
          </span>
        )}
      </div>
      {pending ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center rounded-b-md bg-chat-canvas/90 py-0.5">
          <LoadingSpinner className="size-3 text-muted-foreground" />
        </span>
      ) : null}
      {state === "error" ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center rounded-b-md bg-chat-canvas/90 py-0.5">
          <AlertCircle className="size-3 text-destructive" aria-hidden />
        </span>
      ) : null}
      <span className="sr-only" role={state === "error" ? "alert" : undefined}>{stateLabel}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("Remove {file}", { file: name })}
        className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-chat-canvas text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:before:absolute pointer-coarse:before:-inset-3.5 pointer-coarse:before:content-['']"
      >
        <X className="size-3" aria-hidden />
      </button>
    </div>
  );
}
