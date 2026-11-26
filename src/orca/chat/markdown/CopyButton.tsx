// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/actions/NativeChatCopyButton.tsx; adapted for TermWeave.
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { copyText } from "../../../lib/clipboard.ts";
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";

const COPIED_MS = 1500;

/**
 * Copies `text` and shows Check for 1.5s. Decision: Orca writes through Electron IPC; TermWeave uses
 * `copyText`, which on a plain-HTTP address selects `fallback` instead, so the reader can copy by hand.
 */
export function CopyButton({ text, label, fallback, className }: {
  text: string;
  /** What this button copies (already translated). */
  label: string;
  /** The node to select when the clipboard API is missing. */
  fallback?: () => HTMLElement | null;
  className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  const copy = async (): Promise<void> => {
    const ok = await copyText(text, fallback?.() ?? null);
    if (!ok) return;
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setCopied(false);
    }, COPIED_MS);
  };
  const shown = copied ? t("Copied") : label;
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={shown}
      title={shown}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11",
        copied && "text-status-success",
        className,
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
