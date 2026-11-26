// Adapted from stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.): BotAvatar.tsx,
// bot-avatar-status-badge.tsx and items/BotItemStatusIcon.tsx, with their sizes and glyphs.
// The mascot pictures in src/assets/bot-mascots are Orca's, under the same licence.
import { CircleCheck, CircleSlash, Moon } from "lucide-react";
import type { CSSProperties } from "react";

import A1 from "../assets/bot-mascots/A1.svg?raw";
import B1 from "../assets/bot-mascots/B1.svg?raw";
import D1 from "../assets/bot-mascots/D1.svg?raw";
import E1 from "../assets/bot-mascots/E1.svg?raw";
import F1 from "../assets/bot-mascots/F1.svg?raw";
import G1 from "../assets/bot-mascots/G1.svg?raw";
import H1 from "../assets/bot-mascots/H1.svg?raw";
import H2 from "../assets/bot-mascots/H2.svg?raw";
import I1 from "../assets/bot-mascots/I1.svg?raw";
import J1 from "../assets/bot-mascots/J1.svg?raw";
import K2 from "../assets/bot-mascots/K2.svg?raw";
import L2 from "../assets/bot-mascots/L2.svg?raw";
import M1 from "../assets/bot-mascots/M1.svg?raw";
import N1 from "../assets/bot-mascots/N1.svg?raw";
import O1 from "../assets/bot-mascots/O1.svg?raw";
import P3 from "../assets/bot-mascots/P3.svg?raw";
import Q1 from "../assets/bot-mascots/Q1.svg?raw";
import R3 from "../assets/bot-mascots/R3.svg?raw";
import S2 from "../assets/bot-mascots/S2.svg?raw";
import T1 from "../assets/bot-mascots/T1.svg?raw";
import { botMascot, DEFAULT_BOT_AVATAR_COLOR, isBotAvatarColor, recolorMascotSvg, type BotMascotId } from "../../shared/bots/avatar.ts";
import type { BotItemStatus } from "../../shared/bots/types.ts";
import "./BotVisuals.css";

const MASCOT_SVGS: Record<BotMascotId, string> = { A1, B1, D1, E1, F1, G1, H1, H2, I1, J1, K2, L2, M1, N1, O1, P3, Q1, R3, S2, T1 };

// one data URL per mascot and color: the picker's swatches make a few dozen at most
const drawn = new Map<string, string>();
export function mascotSrc(id: BotMascotId, color: string | null | undefined): string {
  const tile = isBotAvatarColor(color) ? color : DEFAULT_BOT_AVATAR_COLOR;
  const key = `${id} ${tile}`;
  let src = drawn.get(key);
  if (src === undefined) {
    src = `data:image/svg+xml;utf8,${encodeURIComponent(recolorMascotSvg(MASCOT_SVGS[id], tile))}`;
    drawn.set(key, src);
  }
  return src;
}

/** What sits on a picture's corner: nothing while the bot is simply there or working (the row's end shows work). */
export type BotBadge = "blocked" | "sleeping" | null;

/** The bot's picture: its mascot on its tile color, with an exception on its bottom-right corner. */
export function BotAvatar({ bot, size = 32, badge = null, badgeLabel }: { bot: { id: string; avatar?: string | null; avatarColor?: string | null }; size?: number; badge?: BotBadge; badgeLabel?: string }) {
  // a 2px gap around the badge, cut from the picture so the row's own background shows through
  const radius = badge === "sleeping" ? 8 : 6;
  const cutout: CSSProperties | undefined = badge === null ? undefined
    : { maskImage: `radial-gradient(circle at calc(100% - 3px) calc(100% - 3px), transparent ${radius}px, #000 ${radius + 0.5}px)` };
  return <span className="bot-avatar-slot" style={{ width: size, height: size }}>
    <span className="bot-avatar" style={cutout} aria-hidden="true"><img src={mascotSrc(botMascot(bot), bot.avatarColor)} alt="" draggable={false} /></span>
    {badge !== null && <span className="bot-avatar-badge" role={badgeLabel ? "img" : undefined} aria-label={badgeLabel} aria-hidden={badgeLabel ? undefined : true}>
      {badge === "sleeping" ? <Moon aria-hidden="true" /> : <span className="bot-dot is-question" aria-hidden="true" />}
    </span>}
  </span>;
}

/** The working mark every working row ends with. */
export function BotSpinner({ label }: { label?: string }) {
  return <span className="bot-spinner" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

/**
 * An item's status glyph: Planned a dashed ring, In progress a spinner while a worker runs (a ring
 * otherwise), Waiting a grey ring with its lower half filled, Needs you a dot, Done a check,
 * Canceled a slashed circle. Every glyph shares one 10px box and 2px stroke.
 */
export function BotItemStatusIcon({ status, live = false }: { status: BotItemStatus; live?: boolean }) {
  switch (status) {
    case "needs_you": return <span className="bot-glyph bot-dot is-question" aria-hidden="true" />;
    case "working": return live ? <BotSpinner /> : <span className="bot-glyph bot-ring is-working" aria-hidden="true" />;
    case "waiting": return <svg className="bot-glyph bot-waiting" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4.8}>
      <circle cx="12" cy="12" r="10" /><path d="M4.4 12a7.6 7.6 0 0 0 15.2 0z" fill="currentColor" stroke="none" />
    </svg>;
    case "planned": return <span className="bot-glyph bot-ring is-planned" aria-hidden="true" />;
    case "done": return <CircleCheck className="bot-glyph is-done" aria-hidden="true" size={10} strokeWidth={2} absoluteStrokeWidth />;
    case "canceled": return <CircleSlash className="bot-glyph is-canceled" aria-hidden="true" size={10} strokeWidth={2} absoluteStrokeWidth />;
  }
}

/** A short age beside a name: now, 3m, 2h, 5d. */
export function botAge(iso: string | null | undefined, now = Date.now()): string | null {
  const at = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(at)) return null;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (60 * 24))}d`;
}
