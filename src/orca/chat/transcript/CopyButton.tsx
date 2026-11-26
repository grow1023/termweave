// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/actions/NativeChatCopyButton.tsx; adapted for TermWeave.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "../../cn.ts";
import { copyText } from "../../../lib/clipboard.ts";
import { useT } from "../../../lib/i18n.ts";

/**
 * Copies and shows Check for 1.5s. Decision: TermWeave's `copyText` (clipboard API with a textarea
 * fallback) replaces Orca's Electron IPC; when both fail, the text shows in a read-only field to copy
 * by hand, as TermWeave's ChatView does.
 */
export function CopyButton({
  text,
  label: copyLabel,
  icon,
  className,
}: {
  text: string;
  /** What this button copies, when it is not the whole message. */
  label?: string;
  /** A glyph in place of Copy (the plain-text copy). */
  icon?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const resetTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async (): Promise<void> => {
    const ok = await copyText(text);
    setManual(!ok);
    if (!ok) return;
    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null;
      setCopied(false);
    }, 1500);
  };

  const label = copied ? t("Copied") : (copyLabel ?? t("Copy message"));
  return (
    <>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={label}
        title={label}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11",
          copied && "text-status-success",
          className,
        )}
      >
        {copied ? <Check className="size-3.5" /> : (icon ?? <Copy className="size-3.5" />)}
      </button>
      {manual ? (
        <textarea
          readOnly
          value={text}
          aria-label={copyLabel ?? t("Copy message")}
          onFocus={(event) => event.currentTarget.select()}
          className="h-16 w-full max-w-80 resize-none rounded-md border border-border bg-transparent p-1 font-mono text-xs text-chat-foreground"
        />
      ) : null}
    </>
  );
}
