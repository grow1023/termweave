// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotAvatar.tsx;
// adapted for TermWeave: a bot's picture is always one of TermWeave's beasts of myth (no uploads, outfits or generated faces).
import type { CSSProperties } from "react";

import { botMascot } from "../../../shared/bots/avatar.ts";
import { mascotSrc } from "../../components/BotVisuals.tsx";
import { cn } from "../cn.ts";

/** The bot's picture: its beast on parchment. Size it with a class, as Orca's callers do (`size-8 rounded-md`). */
export function BotAvatar({ bot, className, style }: { bot: { id: string; avatar?: string | null }; className?: string; style?: CSSProperties }) {
  return <BotAvatarTile src={mascotSrc(botMascot(bot))} fallback="" className={className} style={style} />;
}

/** The tile itself, for a picture not yet saved to a bot (the New bot dialog). */
export function BotAvatarTile({ src, fallback, className, style }: { src: string | null; fallback: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-xs font-semibold text-foreground",
        src && "border-0 bg-transparent",
        className,
      )}
    >
      {src ? <img src={src} alt="" draggable={false} className="size-full object-cover" /> : fallback}
    </span>
  );
}
