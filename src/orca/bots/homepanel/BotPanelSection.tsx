// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotPanelSection.tsx; adapted for TermWeave.
// One section of a bot's panel: the header (chevron left, the whole header folds it) over flush rows.
// Idle header actions show on hover or keyboard focus (always on a touch screen); live ones always show.
import { ChevronDown } from "lucide-react";
import { useId } from "react";

import { cn } from "../../cn.ts";

export type PanelFold = { open: boolean; onOpenChange: (open: boolean) => void };

/** The fold arrow of a section header; it lights up with the header's `peer` fold button. */
function SectionFoldChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <span className="pointer-events-none ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors peer-hover:bg-accent/70 peer-hover:text-foreground">
      <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", collapsed && "-rotate-90")} />
    </span>
  );
}

export function BotPanelSectionHeader({ title, fold, bodyId, glyph, summary, actions, actionsAlways = false }: {
  title: string;
  fold?: PanelFold;
  bodyId?: string;
  /** A status glyph between the chevron and the title. */
  glyph?: React.ReactNode;
  /** Quiet text after the title, such as a group's count. */
  summary?: React.ReactNode;
  /** Controls at the end, shown on hover or focus. */
  actions?: React.ReactNode;
  /** The actions show at all times (a control the owner must find without hovering, BOT-27). */
  actionsAlways?: boolean;
}) {
  const titleId = useId();
  const summaryId = useId();
  return (
    <div className="group/section relative flex h-7 min-w-0 items-center gap-1 pr-1 pl-1 pointer-coarse:h-11">
      {fold ? (
        <button
          type="button"
          // Its name is the header as shown, so a count is read with it ("Planned 3, collapsed").
          aria-labelledby={summary ? `${titleId} ${summaryId}` : titleId}
          aria-expanded={fold.open}
          aria-controls={bodyId}
          className="peer absolute inset-0 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(event) => {
            fold.onOpenChange(!fold.open);
            // A clicked header must not keep focus (and its revealed actions) once the pointer leaves.
            if (event.detail > 0) event.currentTarget.blur();
          }}
        />
      ) : null}
      {fold ? <SectionFoldChevron collapsed={!fold.open} /> : null}
      {glyph ? <span aria-hidden className="pointer-events-none flex w-4 shrink-0 items-center justify-center">{glyph}</span> : null}
      <h3 id={titleId} className={cn("pointer-events-none min-w-0 truncate text-xs font-semibold text-muted-foreground/80 select-none", !fold && !glyph && "pl-[22px]")}>
        {title}
      </h3>
      {summary ? <span id={summaryId} className="pointer-events-none shrink-0 text-xs text-muted-foreground tabular-nums">{summary}</span> : null}
      {actions ? (
        <span className="relative ml-auto flex shrink-0 items-center gap-0.5">
          <span className={cn("flex items-center gap-0.5", !actionsAlways && "invisible group-hover/section:visible group-focus-within/section:visible pointer-coarse:visible")}>{actions}</span>
        </span>
      ) : null}
    </div>
  );
}

export function BotPanelSection({ title, fold, actions, actionsAlways, folded, children }: {
  title: string;
  fold?: PanelFold;
  actions?: React.ReactNode;
  actionsAlways?: boolean;
  /** What stays listed under the header while folded. */
  folded?: React.ReactNode;
  children: React.ReactNode;
}) {
  const bodyId = useId();
  const open = fold?.open ?? true;
  return (
    <section className="flex flex-col gap-0.5">
      <BotPanelSectionHeader title={title} fold={fold} bodyId={bodyId} actions={actions} actionsAlways={actionsAlways} />
      {open ? <div id={bodyId} className="flex flex-col">{children}</div> : folded ? <div className="flex flex-col">{folded}</div> : null}
    </section>
  );
}
