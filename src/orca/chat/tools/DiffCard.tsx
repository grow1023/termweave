// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/diffs/NativeChatDiffCard.tsx; adapted for TermWeave.
// Cut: the reveal signal of Orca's turn diff rollup (not ported).
import { ChevronRight, FileMinus2, FilePen, FilePlus2 } from "lucide-react";
import { useMemo } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Expandable, useDisclosure } from "../shared/index.ts";
import { CopyButton } from "./CopyButton.tsx";
import { DiffLineCounts } from "./DiffLineCounts.tsx";
import { nativeChatEditFilePatchText } from "./lib/edit-cards.ts";
import {
  nativeChatEditFileBaseName,
  nativeChatEditGutterChars,
  unifiedLineNumber,
  type NativeChatEditFile,
  type NativeChatEditLine,
} from "./lib/edit-model.ts";
import { ToolFileTarget } from "./ToolFileTarget.tsx";
import { toolRowVerb } from "./words.ts";

function VerbIcon({ kind }: { kind: NativeChatEditFile["changeKind"] }) {
  const className = "size-3.5 shrink-0 text-chat-foreground-faint";
  if (kind === "added") return <FilePlus2 className={className} />;
  if (kind === "deleted") return <FileMinus2 className={className} />;
  return <FilePen className={className} />;
}

/** Mark omitted file regions so gutter line jumps do not resemble missing rendered content. */
function DiffGapRow() {
  const t = useT();
  return (
    <div role="separator" aria-label={t("Lines not shown")} className="select-none border-y border-chat-code-border bg-chat-code-surface py-0.5 text-center text-chat-foreground-faint">
      ⋯
    </div>
  );
}

function DiffRow({ line, gutterWidth }: { line: NativeChatEditLine; gutterWidth: number }) {
  if (line.kind === "gap") return <DiffGapRow />;
  return (
    <div className={cn("flex items-start", line.kind === "add" && "bg-[var(--diff-added-background)]", line.kind === "del" && "bg-[var(--diff-removed-background)]")}>
      {gutterWidth > 0 ? (
        <span
          // Give gutter numbers their own background to keep them legible on tinted diff rows.
          className={cn(
            "shrink-0 select-none pr-1.5 text-right tabular-nums text-chat-foreground-faint",
            line.kind === "add" && "bg-[var(--diff-added-gutter)]",
            line.kind === "del" && "bg-[var(--diff-removed-gutter)]",
            line.kind === "context" && "bg-chat-code-surface",
          )}
          style={{ width: `${gutterWidth}ch` }}
          aria-hidden
        >
          {unifiedLineNumber(line) ?? ""}
        </span>
      ) : null}
      <span className={cn("w-3 shrink-0 select-none text-center", line.kind === "add" && "text-chat-diff-added", line.kind === "del" && "text-chat-diff-removed")} aria-hidden>
        {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words pr-2 text-chat-foreground">{line.text}</span>
    </div>
  );
}

/** Mounted only while open, so collapsed cards do not build their DOM. */
function DiffCardRows({ lines, gutterWidth }: { lines: NativeChatEditLine[]; gutterWidth: number }) {
  // A counter local to this render (Orca's), not state: up to 2,000 rows, so no copy per row.
  const seen = new Map<string, number>();
  const keys = lines.map((line) => {
    const signature = `${line.kind}:${line.oldLineNumber}:${line.newLineNumber}:${line.text}`;
    const occurrence = seen.get(signature) ?? 0;
    seen.set(signature, occurrence + 1);
    return `${signature}:${occurrence}`;
  });
  return (
    // Focusable so the rows can be scrolled from the keyboard.
    <div
      data-native-chat-code-content
      tabIndex={0}
      className="ml-6 mt-1 max-h-72 overflow-auto rounded-lg border border-chat-code-border bg-chat-code-surface py-1 font-mono text-chat-code leading-relaxed text-chat-foreground scrollbar-sleek focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {lines.map((line, index) => <DiffRow key={keys[index]} line={line} gutterWidth={gutterWidth} />)}
    </div>
  );
}

/** File edits without invented line numbers; header-only changes have no empty disclosure. */
export function DiffCard({ file, disclosureKey, initialOpen = false }: { file: NativeChatEditFile; disclosureKey?: string; initialOpen?: boolean }) {
  const t = useT();
  const { open: expanded, setOpen: setExpanded } = useDisclosure(disclosureKey, initialOpen);
  const copy = useMemo(() => nativeChatEditFilePatchText(file.lines), [file.lines]);
  const hasBody = file.lines.length > 0;
  const gutterWidth = nativeChatEditGutterChars(file);

  return (
    <div className="my-1 min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => hasBody && setExpanded(!expanded)}
          className={cn(
            "flex min-h-6.5 min-w-0 flex-1 items-center gap-2 rounded-md text-left font-sans text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11",
            hasBody ? "cursor-pointer hover:bg-accent/20" : "cursor-default",
          )}
          aria-expanded={hasBody ? expanded : undefined}
        >
          <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
            <VerbIcon kind={file.changeKind} />
          </span>
          <span className="shrink-0 text-chat-foreground-faint">{toolRowVerb(file.changeKind, t)}</span>
          {file.oldPath ? (
            <>
              <span className="min-w-0 truncate text-chat-foreground-faint line-through" title={file.oldPath} aria-hidden="true">
                {nativeChatEditFileBaseName(file.oldPath)}
              </span>
              <span className="sr-only">{file.oldPath}</span>
              <span className="shrink-0 text-chat-foreground-faint">→</span>
            </>
          ) : null}
          <ToolFileTarget
            path={file.path}
            label={nativeChatEditFileBaseName(file.path)}
            className="min-w-0 truncate text-chat-foreground"
            // A deleted file has nothing left to open.
            openable={file.changeKind !== "deleted"}
          />
          <DiffLineCounts added={file.added} removed={file.removed} size="sm" />
          {file.truncated ? <span className="shrink-0 text-xs text-chat-foreground-faint">{t("Diff truncated")}</span> : null}
          {hasBody ? (
            <ChevronRight className={cn("size-3.5 shrink-0 text-chat-foreground-faint transition-transform motion-reduce:transition-none", expanded && "rotate-90")} />
          ) : null}
        </button>
        <CopyButton text={copy} label={t("Copy diff")} className="ml-auto shrink-0" />
      </div>
      {hasBody ? (
        <Expandable open={expanded}>
          <DiffCardRows lines={file.lines} gutterWidth={gutterWidth} />
        </Expandable>
      ) : null}
    </div>
  );
}
