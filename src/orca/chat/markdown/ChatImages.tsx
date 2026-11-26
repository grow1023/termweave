// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/media/images/NativeChatImageAttachments.tsx; adapted for TermWeave.
// Decision: the thumbnail strip only (SPEC 5.3). Orca's pan-zoom viewer and gallery are left out: a tile
// opens its image in a new tab. Orca's visibility observer is replaced by `loading="lazy"`.
import { Image as ImageIcon } from "lucide-react";
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import type { ChatImagesProps, NativeChatImageRefBlock } from "../shared/index.ts";

/** A same-origin path, an http(s) or blob URL, or an image data URL; anything else is not loaded. */
export function safeImageUrl(url: string): string | null {
  const value = url.trim();
  if (value === "") return null;
  if (/^(?:https?:|blob:)/i.test(value) || /^data:image\//i.test(value)) return value;
  // A scheme-less path (TermWeave's machinePath + "pane/conversation/image?…"), never "//host".
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//") ? null : value;
}

function LabelChip({ label }: { label: string }) {
  return (
    <div className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-chat-canvas px-2 py-1 text-xs text-chat-foreground-faint" title={label}>
      <ImageIcon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function ImageTile({ image }: { image: NativeChatImageRefBlock }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const src = safeImageUrl(image.url);
  const label = image.alt?.trim() ? image.alt : t("Image");
  if (src === null || failed) return <div className="min-w-0"><LabelChip label={label} /></div>;
  return (
    <div className="relative size-20 shrink-0">
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t("View image")}: ${label}`}
        title={label}
        className="flex size-full cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-border bg-chat-canvas transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={src} alt={label} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      </a>
    </div>
  );
}

/** A message's images as 80px thumbnails; nothing when there are none. */
export function ChatImages({ images, className }: ChatImagesProps) {
  if (images.length === 0) return null;
  return (
    <div className={cn("mb-2 flex flex-wrap gap-1.5", className)}>
      {images.map((image, index) => <ImageTile key={`${index}:${image.url}`} image={image} />)}
    </div>
  );
}
