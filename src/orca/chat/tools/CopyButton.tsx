// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/actions/NativeChatCopyButton.tsx; adapted for TermWeave.
// Change: copies with TermWeave's copyText (plain-HTTP fallback selects nothing here, so a failure says so).
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { copyText } from "../../../lib/clipboard.ts";
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";

export function CopyButton({ text, label: copyLabel, className }: { text: string; label: string; className?: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const handleCopy = async () => {
    const copied = await copyText(text);
    setState(copied ? "copied" : "failed");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setState("idle");
    }, 1500);
  };

  const label = state === "copied" ? t("Copied") : state === "failed" ? t("Couldn't copy") : copyLabel;
  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11",
        state === "copied" && "text-status-success",
        className,
      )}
    >
      {state === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {state === "failed" ? <span role="alert" className="sr-only">{label}</span> : null}
    </button>
  );
}
