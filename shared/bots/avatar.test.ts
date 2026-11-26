import { expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BOT_MASCOT_IDS, botMascot, isBotAvatar, randomBotAvatar } from "./avatar.ts";

it("gives every bot one beast, and every beast has its picture", () => {
  expect(BOT_MASCOT_IDS.length).toBe(20);
  expect(botMascot({ id: "c6ce872e", avatar: "mascot:haetae" })).toBe("haetae");
  // a picture from the first mascot set, or none: the bot's id picks, and always the same one
  expect(botMascot({ id: "c6ce872e", avatar: "mascot:A1" })).toBe(botMascot({ id: "c6ce872e" }));
  expect(isBotAvatar("mascot:kraken")).toBe(true);
  expect(isBotAvatar("upload:x")).toBe(false);
  expect(isBotAvatar(randomBotAvatar(() => 0.999))).toBe(true);
  for (const id of BOT_MASCOT_IDS) expect(existsSync(join(import.meta.dir, "../../src/assets/bot-beasts", `${id}.webp`))).toBe(true);
});
