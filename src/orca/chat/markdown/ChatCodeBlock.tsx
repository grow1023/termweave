// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/markdown/code/NativeChatCodeBlock.tsx; adapted for TermWeave.
// Decision: no syntax colours (SPEC 3.1, no shiki); TermWeave's fold of long blocks (src/components/Markdown.tsx) is kept.
import { WrapText } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { foldCode } from "../../../lib/markdown.ts";
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { codeFenceLanguageLabel } from "./code-language-label.ts";
import { CopyButton } from "./CopyButton.tsx";

function WrapButton({ wrapped, onToggle }: { wrapped: boolean; onToggle: () => void }) {
  const t = useT();
  const label = wrapped ? t("Disable line wrap") : t("Wrap lines");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={wrapped}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground pointer-coarse:size-11"
    >
      <WrapText className="size-3.5" />
    </button>
  );
}

/** A code fence with its own Copy and Wrap controls; a block over 30 lines opens folded to 20. */
export function ChatCodeBlock({ code, language }: { code: string; language: string | null }) {
  const t = useT();
  const [wrapped, setWrapped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  const fold = useMemo(() => foldCode(code), [code]);
  const shown = fold !== null && !expanded ? fold.head : code;
  const tag = language?.trim() ? language.trim() : null;
  const actions = code ? (
    <>
      <WrapButton wrapped={wrapped} onToggle={() => setWrapped(!wrapped)} />
      <CopyButton text={code} label={t("Copy code")} fallback={() => pre.current} />
    </>
  ) : null;
  return (
    <div
      data-native-chat-code-block={code ? "" : undefined}
      className="group/code relative my-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-chat-code-border bg-chat-code-surface"
    >
      {tag ? (
        <div className="flex h-7.5 items-center justify-between px-3 pointer-coarse:h-11">
          <span data-code-language={tag} className="min-w-0 font-sans text-xs text-chat-foreground-faint">
            <span className="truncate">{codeFenceLanguageLabel(tag)}</span>
          </span>
          {actions ? <div className="-mr-1 flex items-center gap-0.5">{actions}</div> : null}
        </div>
      ) : null}
      <pre
        ref={pre}
        data-native-chat-code-content
        className={cn(
          "scrollbar-sleek m-0 max-w-full font-mono text-chat-code text-chat-code-foreground",
          wrapped ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "overflow-x-auto",
          tag ? "px-3.5 pt-0.5 pb-3" : "p-3 pr-16",
        )}
      >
        <code>{shown}</code>
      </pre>
      {fold !== null ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex h-7.5 w-full items-center justify-center text-xs font-medium text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:h-11"
        >
          {expanded ? t("Show less") : t("Show all {n} lines", { n: fold.lines })}
        </button>
      ) : null}
      {actions && !tag ? (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-100 transition-opacity can-hover:pointer-events-none can-hover:opacity-0 group-hover/code:pointer-events-auto group-hover/code:opacity-100 [[class~='group/code']:has(:focus-visible)_&]:pointer-events-auto [[class~='group/code']:has(:focus-visible)_&]:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
