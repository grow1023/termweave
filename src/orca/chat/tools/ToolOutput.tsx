// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/lines/NativeChatToolOutput.tsx; adapted for TermWeave.
// Change: the full output comes from the run's loader (TermWeave's tool-output endpoint, keyed by
// `fullOutputRef`) instead of Orca's journal item read. The text is data: it renders only as <pre> text.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Button } from "../../ui/button.tsx";
import type { NativeChatToolResultBlock } from "../shared/index.ts";
import { useLoadFullOutput } from "./loader-context.ts";
import { MAX_TOOL_DETAIL_LENGTH, truncateToolDetail } from "./lib/tool-summary.ts";

type FullOutput = { ref: string; text?: string; loading?: boolean; error?: string };

/** Server-cut output always offers "Show full output"; inline output only while it is cut here. */
function isClipped(body: NativeChatToolResultBlock, expanded: boolean, fullLoaded: boolean): boolean {
  return !fullLoaded && (body.fullOutputRef !== undefined || (!expanded && body.output.length > MAX_TOOL_DETAIL_LENGTH));
}

export function ToolOutput({ body }: { body: NativeChatToolResultBlock }) {
  const t = useT();
  const load = useLoadFullOutput();
  const [expanded, setExpanded] = useState(false);
  // Decision: keyed by the ref string, not the block object, so a poll that rebuilds blocks keeps the text.
  const [detail, setDetail] = useState<FullOutput | null>(null);
  const current = detail !== null && detail.ref === body.fullOutputRef ? detail : null;
  const full = current?.text;
  const clipped = isClipped(body, expanded, full !== undefined);

  const showFull = async () => {
    const ref = body.fullOutputRef;
    if (ref === undefined || load === null) {
      setExpanded(true);
      return;
    }
    setDetail({ ref, loading: true });
    try {
      const text = await load(ref);
      setDetail((held) => (held?.ref === ref ? { ref, text } : held));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDetail((held) => (held?.ref === ref ? { ref, error: message } : held));
    }
  };

  return (
    <div className="space-y-1">
      <pre
        data-native-chat-code-content
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-chat-code-border bg-chat-code-surface p-2 font-mono text-chat-code scrollbar-sleek",
          body.isError ? "text-destructive" : "text-chat-foreground",
        )}
      >
        {full ?? (expanded ? body.output : truncateToolDetail(body.output))}
      </pre>
      {clipped ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="xs" className="pointer-coarse:min-h-11" disabled={current?.loading === true} onClick={() => void showFull()}>
            {t("Show full output")}
          </Button>
          {current?.error !== undefined ? (
            <span role="alert" className="min-w-0 text-xs text-chat-foreground-faint">
              {t("Couldn't load the full output.")} {current.error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
