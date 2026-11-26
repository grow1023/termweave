// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotSidebarRow.tsx; adapted for TermWeave.
// One row of the Bots section: picture with its corner badge, name and time, then its newest line. The
// right-click menu and the hover card are Orca's; Mark Read/Unread, the drag handle and the host are left out.
import { useState, type ReactNode } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "../../ui/context-menu.tsx";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../ui/hover-card.tsx";
import StatusIndicator from "../../ui/StatusIndicator.tsx";
import { BotAvatarStatusBadge, botAvatarBadgeCutout } from "./BotAvatarStatusBadge.tsx";
import type { BotBadge } from "./bot-facts.ts";

// WORKTREE_CARD_SURFACE_CLASS_NAME, from Orca's worktree-card-surface.tsx.
const SURFACE_CLASS_NAME =
  "relative ml-1 cursor-pointer overflow-hidden rounded-lg border border-transparent pr-1.5 outline-none select-none transition-[background-color,border-color,opacity,box-shadow] duration-200";

export interface BotSidebarRowProps {
  /** The row's picture. */
  avatar: ReactNode;
  badge: BotBadge;
  isActive: boolean;
  dimmed: boolean;
  /** Set for a row that folds: whether it is unfolded. */
  expanded?: boolean;
  onOpen: () => void;
  /** Both lines, under the picture's right: the open button, or the rename field. */
  main: ReactNode;
  /** The bot works: the row's end shows it unless `trailing` does. */
  working: boolean;
  /** A column after both lines at the row's right edge, such as the fold toggle's strip. */
  trailing?: ReactNode;
  /** The row's hover buttons, over its right end. */
  actions: ReactNode;
  /** What the hover card shows, rendered only while it is open. */
  hoverDetails: ReactNode;
  menuItems: ReactNode;
}

function BotRowWorkingMark(): JSX.Element {
  const t = useT();
  return (
    // A chevron-wide slot follows it, so it lines up with the marks on fold rows' strips; a narrow
    // row's slimmer strip ends 2px nearer the edge, so the mark does too.
    <span role="img" aria-label={t("Working")} className="flex shrink-0 items-center gap-0.5 can-hover:pointer-fine:@max-[15rem]/bot-row:-mr-0.5">
      <StatusIndicator status="working" showTooltip={false} aria-hidden />
      <span className="size-4" />
    </span>
  );
}

export function BotSidebarRow({ avatar, badge, isActive, dimmed, expanded, onOpen, main, working, trailing = null, actions, hoverDetails, menuItems }: BotSidebarRowProps): JSX.Element {
  const [hoverOpen, setHoverOpen] = useState(false);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-worktree-card-surface="true"
          data-worktree-card-active={isActive ? "primary" : undefined}
          aria-expanded={expanded}
          className={cn(
            SURFACE_CLASS_NAME,
            // A two-line workspace card's padding, so bots sit as tight as Projects' rows.
            // A size container: the fold strip slims down in a narrow sidebar.
            "group/bot-row @container/bot-row flex items-center pt-1.25 pb-1.25 pl-1.25",
            !isActive && "worktree-sidebar-card-hover",
            dimmed && "opacity-60"
          )}
          onClick={onOpen}
          onContextMenu={() => setHoverOpen(false)}
        >
          {/* Exceptions sit on the picture's corner. */}
          <span className="relative mr-2 shrink-0">
            <span className="flex" style={botAvatarBadgeCutout(badge)}>{avatar}</span>
            <BotAvatarStatusBadge badge={badge} />
          </span>
          {/* Opens on pointer rest, so sweeping across rows doesn't flash them. The trigger runs to the
              row's end, fold toggle included, so the card always opens past the sidebar's edge. */}
          <HoverCard open={hoverOpen} onOpenChange={setHoverOpen} openDelay={400} closeDelay={120}>
            <HoverCardTrigger asChild>
              <div className="flex min-w-0 flex-1 gap-1 self-stretch">
                {main}
                {trailing ?? (working ? <BotRowWorkingMark /> : null)}
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" sideOffset={8} variant="workspace-details" onClick={(event) => event.stopPropagation()}>
              {hoverOpen ? hoverDetails : null}
            </HoverCardContent>
          </HoverCard>
          {actions}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">{menuItems}</ContextMenuContent>
    </ContextMenu>
  );
}
