// Adapted from stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/bot-avatar.ts and
// src/shared/bots/bot-avatar-color.ts: a bot's picture is one of Orca's mascots on a tile color.

/** The mascots, stored on a bot as `mascot:<id>`; ids are never renamed, since bots store them. */
export const BOT_MASCOT_IDS = ["A1", "B1", "D1", "E1", "F1", "G1", "H1", "H2", "I1", "J1", "K2", "L2", "M1", "N1", "O1", "P3", "Q1", "R3", "S2", "T1"] as const;
export type BotMascotId = (typeof BOT_MASCOT_IDS)[number];

/** The mascots' own sky blue, shown when a bot has no color. */
export const DEFAULT_BOT_AVATAR_COLOR = "#b3dbf4";
/** The picker's swatches, the default first. */
export const BOT_AVATAR_COLORS = [DEFAULT_BOT_AVATAR_COLOR, "#ffffff", "#c9b8e8", "#f4c4cf", "#f8cfa8", "#f6e3a1", "#c5dfb5", "#b5e3d8", "#8fa3b8", "#3a3f4b", "#1f2126"] as const;

const MASCOT = /^mascot:(.+)$/;
const COLOR = /^#[0-9a-f]{6}$/;

export function isBotAvatar(value: unknown): value is string {
  const id = typeof value === "string" ? MASCOT.exec(value)?.[1] : undefined;
  return id !== undefined && BOT_MASCOT_IDS.some((known) => known === id);
}
export function isBotAvatarColor(value: unknown): value is string {
  return typeof value === "string" && COLOR.test(value);
}

/** A bot's mascot: the one it stores, else one picked by its id, so a bot from before pictures keeps one face. */
export function botMascot(bot: { id: string; avatar?: string | null }): BotMascotId {
  if (isBotAvatar(bot.avatar)) return bot.avatar.slice("mascot:".length) as BotMascotId;
  let hash = 0;
  for (const char of bot.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BOT_MASCOT_IDS[hash % BOT_MASCOT_IDS.length]!;
}

export function randomBotAvatar(random = Math.random): string {
  return `mascot:${BOT_MASCOT_IDS[Math.min(BOT_MASCOT_IDS.length - 1, Math.floor(random() * BOT_MASCOT_IDS.length))]}`;
}

function channel(hex: string): number {
  const c = Number.parseInt(hex, 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
/** Dark enough that a dark mascot would sink into it, so the mascot gets a light rim. */
export function isDarkBotAvatarColor(color: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => channel(color.slice(i, i + 2))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
}

/** The mascot's SVG drawn on `color`; the mascots read their background and rim from these defaults. */
export function recolorMascotSvg(svg: string, color: string): string {
  const filled = svg.replace(`var(--avatar-bg,${DEFAULT_BOT_AVATAR_COLOR})`, color);
  return isDarkBotAvatarColor(color) ? filled.replace("var(--avatar-rim,0)", "1") : filled;
}
