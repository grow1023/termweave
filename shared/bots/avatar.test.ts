import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BOT_MASCOT_IDS, botMascot, isBotAvatar, isBotAvatarColor, recolorMascotSvg } from "./avatar.ts";

it("gives every bot one mascot and draws each mascot on a tile color", () => {
  expect(botMascot({ id: "c6ce872e", avatar: "mascot:T1" })).toBe("T1");
  expect(botMascot({ id: "c6ce872e", avatar: "mascot:nope" })).toBe(botMascot({ id: "c6ce872e" }));
  expect(isBotAvatar("mascot:A1")).toBe(true);
  expect(isBotAvatar("upload:x")).toBe(false);
  expect(isBotAvatarColor("#1f2126")).toBe(true);
  expect(isBotAvatarColor("red")).toBe(false);
  for (const id of BOT_MASCOT_IDS) {
    const svg = readFileSync(join(import.meta.dir, "../../src/assets/bot-mascots", `${id}.svg`), "utf8");
    const dark = recolorMascotSvg(svg, "#1f2126");
    expect(dark).toContain("#1f2126");
    expect(dark).not.toContain("var(--avatar-bg");
    expect(dark).not.toContain("var(--avatar-rim,0)");
    expect(recolorMascotSvg(svg, "#ffffff")).toContain("var(--avatar-rim,0)");
  }
});
