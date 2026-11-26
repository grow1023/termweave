// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/settings-view/BotSettingsRows.tsx; adapted for TermWeave.
// The settings view's inset groups and rows: a muted card of rows under a small heading.
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../cn.ts";

// Hairlines between rows start at the text, under an icon only when both rows have one.
const INSET_GROUP = cn(
  "overflow-hidden rounded-[10px] bg-foreground/[0.035]",
  "[&>*+*]:relative [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:top-0",
  "[&>*+*]:before:right-0 [&>*+*]:before:left-3 [&>*+*]:before:border-t [&>*+*]:before:border-border [&>*+*]:before:content-['']",
  "[&>[data-row-icon]+[data-row-icon]]:before:left-[38px]",
);

export function SettingsInsetGroup({ title, foot, children, className }: { title?: ReactNode; foot?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {title ? (
        <div className="flex min-h-5 items-center gap-1.5 px-3">
          <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
        </div>
      ) : null}
      <div className={INSET_GROUP}>{children}</div>
      {foot ? <p className="px-3 text-xs leading-[17px] text-muted-foreground">{foot}</p> : null}
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** A short muted value at the row's end, such as "Claude Code". */
  value?: string | null;
  /** A control at the row's end (a switch, a button). Without one, `onOpen` draws a chevron. */
  end?: ReactNode;
  onOpen?: () => void;
  /** Wraps the end control under the text when the host is narrow. */
  wrapEnd?: boolean;
}

const ROW = "flex min-h-11 w-full min-w-0 items-center gap-2.5 py-2 pr-2.5 pl-3 in-data-bot-settings-root:min-h-9 in-data-bot-settings-root:py-1 pointer-coarse:in-data-bot-settings-root:min-h-11 text-left text-[13px] outline-none";

function RowText({ icon, title, detail, value }: Pick<RowProps, "icon" | "title" | "detail" | "value">) {
  return (
    <>
      {icon ? (
        <span className={cn("flex w-4 shrink-0 justify-center text-muted-foreground [&_svg]:size-4 in-data-bot-settings-root:[&_svg]:size-3.5", detail ? "self-start pt-px" : null)}>{icon}</span>
      ) : null}
      <span className={cn("min-w-0", value ? "max-w-[70%] flex-[1_0_auto]" : "flex-1")}>
        <span className="block truncate leading-[18px] font-medium">{title}</span>
        {detail ? <span className="block text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{detail}</span> : null}
      </span>
      {value ? (
        <span className="ml-auto flex h-4 min-w-0 flex-wrap justify-end overflow-hidden text-xs leading-4 text-muted-foreground">
          <span aria-hidden className="h-4 w-0 shrink-0" />
          <span className="shrink-0 whitespace-nowrap">
            <span className="sr-only">, </span>
            {value}
          </span>
        </span>
      ) : null}
    </>
  );
}

/** One row: opens a page when it has `onOpen` and no `end`; otherwise it holds its control or only shows a value. */
export function SettingsInsetRow({ end, onOpen, wrapEnd, ...text }: RowProps) {
  if (onOpen && end === undefined) {
    return (
      <button type="button" data-row-icon={text.icon ? "" : undefined} onClick={onOpen} className={cn(ROW, "cursor-pointer transition-colors hover:bg-accent/60 focus-visible:bg-accent/60")}>
        <RowText {...text} />
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );
  }
  return (
    <div data-row-icon={text.icon ? "" : undefined} className={cn(ROW, wrapEnd ? "flex-wrap" : null)}>
      <RowText {...text} />
      {end ? <div className={cn("flex shrink-0 items-center gap-1.5", wrapEnd ? "basis-full pl-6.5" : null)}>{end}</div> : null}
    </div>
  );
}
