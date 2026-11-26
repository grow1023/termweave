// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotCollapsedPreview.tsx; adapted for TermWeave.
// The folded section's small faces: each bot's picture with a pip for "needs you" or "working", most urgent first.
// Orca's paging edges and virtual window are left out: the faces scroll sideways.
import { useMemo } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../ui/hover-card.tsx";
import StatusIndicator from "../../ui/StatusIndicator.tsx";
import { BotAvatar } from "../BotAvatar.tsx";
import type { Bot, BotAutomation } from "../data.ts";
import { BotHoverDetails } from "./BotHoverDetails.tsx";
import { botNeedsOwner, type BotFacts } from "./bot-facts.ts";

type Signal = "attention" | "working" | null;

function signalOf(facts: BotFacts): Signal {
  if (botNeedsOwner(facts)) return "attention";
  if (facts.bot.paused) return null;
  return facts.working || facts.workers.length > 0 ? "working" : null;
}

const RANK: Record<NonNullable<Signal> | "none", number> = { attention: 0, working: 1, none: 2 };

/** Most urgent first; bots that tie keep their order. */
export function rankBotFacts(facts: readonly BotFacts[]): { fact: BotFacts; signal: Signal }[] {
  return facts.map((fact, index) => ({ fact, signal: signalOf(fact), index }))
    .sort((a, b) => RANK[a.signal ?? "none"] - RANK[b.signal ?? "none"] || a.index - b.index)
    .map(({ fact, signal }) => ({ fact, signal }));
}

function Pip({ signal }: { signal: Signal }): JSX.Element | null {
  if (signal === null) return null;
  return (
    <span aria-hidden className="absolute -right-1 -bottom-1 z-10 flex size-3 items-center justify-center rounded-full bg-worktree-sidebar">
      <StatusIndicator status={signal === "attention" ? "permission" : "working"} showTooltip={false} />
    </span>
  );
}

export function BotCollapsedPreview({ facts, automations, selectedPaneId, onOpenBot }: {
  facts: readonly BotFacts[];
  automations: readonly BotAutomation[];
  selectedPaneId: string | null;
  onOpenBot: (bot: Bot) => void;
}): JSX.Element {
  const t = useT();
  const ordered = useMemo(() => rankBotFacts(facts), [facts]);
  const label = ({ fact, signal }: { fact: BotFacts; signal: Signal }): string => {
    const state = signal === "attention" ? t("Needs you") : signal === "working" ? t("Working") : fact.bot.paused ? t("Paused") : t("Idle");
    return `${fact.bot.name} · ${state}`;
  };
  // Each face is its own target, over the header's fold button; the rest of the header still folds.
  return (
    <span className="pointer-events-none relative isolate flex min-w-0 flex-1 items-center justify-center pr-1 pl-0.5" data-bot-preview="">
      <span className="bots-faces-track pointer-events-auto flex min-w-0 items-center overflow-x-auto px-1.5 py-1.5 pointer-coarse:py-0">
        <span className="flex shrink-0 -space-x-1">
          {ordered.map((entry) => {
            const { bot } = entry.fact;
            const current = bot.paneId !== null && bot.paneId === selectedPaneId;
            return (
              <HoverCard key={bot.id} openDelay={400} closeDelay={120}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    aria-label={label(entry)}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "relative size-5 shrink-0 cursor-pointer rounded-full ring-2 outline-none focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid pointer-coarse:size-11",
                      current ? "ring-sidebar-foreground" : "ring-sidebar hover:ring-sidebar-ring"
                    )}
                    onClick={() => onOpenBot(bot)}
                  >
                    <BotAvatar bot={bot} className="size-full rounded-full text-2xs" />
                    <Pip signal={entry.signal} />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent side="top" sideOffset={8} collisionPadding={8} variant="workspace-details" motion="none">
                  <BotHoverDetails facts={entry.fact} automations={automations} />
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </span>
      </span>
    </span>
  );
}
