// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/bot-avatar-status-badge.tsx; adapted for TermWeave.
// A bot picture's corner badge: the question mark when the bot needs the owner, the moon when its chat is not running
// (a session bot's chat always runs: the moon there means it is paused).
import type { CSSProperties } from "react";
import { Moon } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import StatusIndicator from "../../ui/StatusIndicator.tsx";
import type { BotBadge } from "./bot-facts.ts";

/** A 2px gap around the badge, cut from the picture so the row's own background (hover and
 *  selection included) shows through instead of a painted disc. */
export function botAvatarBadgeCutout(badge: BotBadge): CSSProperties | undefined {
  if (badge === null) return undefined;
  const radius = 8;
  return { maskImage: `radial-gradient(circle at calc(100% - 3px) calc(100% - 3px), transparent ${radius}px, #000 ${radius + 0.5}px)` };
}

/** The badge, centred 3px in from the picture's bottom-right corner; pair it with the cutout. */
export function BotAvatarStatusBadge({ badge }: { badge: BotBadge }): JSX.Element | null {
  const t = useT();
  if (badge === null) return null;
  const label = badge === "needs-you" ? t("Needs you") : badge === "paused" ? t("Paused") : t("Chat not running");
  return (
    <span data-worktree-card-status-slot="" className="absolute right-[3px] bottom-[3px] flex size-0 items-center justify-center">
      <span className="flex size-3 shrink-0 items-center justify-center" aria-hidden>
        {badge === "sleeping" || badge === "paused" ? <Moon className="size-3 text-muted-foreground" /> : <StatusIndicator status="permission" showTooltip={false} />}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
