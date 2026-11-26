// A bot's picture file and the short age shown beside names; the pictures are TermWeave's own beasts of myth (src/assets/bot-beasts).

import haetae from "../assets/bot-beasts/haetae.webp";
import dragon from "../assets/bot-beasts/dragon.webp";
import phoenix from "../assets/bot-beasts/phoenix.webp";
import kumiho from "../assets/bot-beasts/kumiho.webp";
import bulgasari from "../assets/bot-beasts/bulgasari.webp";
import qilin from "../assets/bot-beasts/qilin.webp";
import kraken from "../assets/bot-beasts/kraken.webp";
import griffin from "../assets/bot-beasts/griffin.webp";
import hydra from "../assets/bot-beasts/hydra.webp";
import cerberus from "../assets/bot-beasts/cerberus.webp";
import minotaur from "../assets/bot-beasts/minotaur.webp";
import chimera from "../assets/bot-beasts/chimera.webp";
import pegasus from "../assets/bot-beasts/pegasus.webp";
import basilisk from "../assets/bot-beasts/basilisk.webp";
import sphinx from "../assets/bot-beasts/sphinx.webp";
import fenrir from "../assets/bot-beasts/fenrir.webp";
import jormungandr from "../assets/bot-beasts/jormungandr.webp";
import thunderbird from "../assets/bot-beasts/thunderbird.webp";
import manticore from "../assets/bot-beasts/manticore.webp";
import cyclops from "../assets/bot-beasts/cyclops.webp";
import type { BotMascotId } from "../../shared/bots/avatar.ts";

const MASCOT_URLS: Record<BotMascotId, string> = { haetae, dragon, phoenix, kumiho, bulgasari, qilin, kraken, griffin, hydra, cerberus, minotaur, chimera, pegasus, basilisk, sphinx, fenrir, jormungandr, thunderbird, manticore, cyclops };

export function mascotSrc(id: BotMascotId): string {
  return MASCOT_URLS[id];
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
