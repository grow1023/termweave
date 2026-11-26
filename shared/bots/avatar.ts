// A bot's picture: one of twenty beasts of myth, drawn as ink on old parchment (src/assets/bot-beasts).
// The `mascot:<id>` form and the pick-by-id fallback follow stablyai/orca (MIT, Copyright (c) 2026
// Lovecast Inc.), src/shared/bot-avatar.ts; the pictures are TermWeave's own.

/** Stored on a bot as `mascot:<id>`; ids are never renamed, since bots store them. */
export const BOT_MASCOT_IDS = ["haetae", "dragon", "phoenix", "kumiho", "bulgasari", "qilin", "kraken", "griffin", "hydra", "cerberus", "minotaur", "chimera", "pegasus", "basilisk", "sphinx", "fenrir", "jormungandr", "thunderbird", "manticore", "cyclops"] as const;
export type BotMascotId = (typeof BOT_MASCOT_IDS)[number];

const MASCOT = /^mascot:(.+)$/;

export function isBotAvatar(value: unknown): value is string {
  const id = typeof value === "string" ? MASCOT.exec(value)?.[1] : undefined;
  return id !== undefined && BOT_MASCOT_IDS.some((known) => known === id);
}

/** A bot's beast: the one it stores, else one picked by its id, so a bot without a stored picture keeps one face. */
export function botMascot(bot: { id: string; avatar?: string | null }): BotMascotId {
  if (isBotAvatar(bot.avatar)) return bot.avatar.slice("mascot:".length) as BotMascotId;
  let hash = 0;
  for (const char of bot.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BOT_MASCOT_IDS[hash % BOT_MASCOT_IDS.length]!;
}

export function randomBotAvatar(random = Math.random): string {
  return `mascot:${BOT_MASCOT_IDS[Math.min(BOT_MASCOT_IDS.length - 1, Math.floor(random() * BOT_MASCOT_IDS.length))]}`;
}
