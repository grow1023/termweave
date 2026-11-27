import { describe, expect, test } from "bun:test";

import type { Translate } from "../../lib/i18n.ts";
import { BotApiError, botErrorText } from "./data.ts";

const t: Translate = (key, vars) => `T:${key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ""))}`;

describe("botErrorText", () => {
  test("a refusal the owner meets is said in the owner's language", () => {
    expect(botErrorText(new BotApiError("invalid_repo", "the project must be a git repository"), t)).toBe("T:This folder is not a git repository.");
    expect(botErrorText(new BotApiError("name_taken", "another bot has this name"), t)).toBe("T:Another bot has this name.");
    expect(botErrorText(new BotApiError("already_answered", "item #3 was already answered"), t)).toBe("T:This was already answered.");
  });

  test("a server with no session host says what the owner can do instead", () => {
    expect(botErrorText(new BotApiError("sessions_unavailable", "chat sessions are not available on this server"), t))
      .toBe("T:This server cannot run chat bots. Create the bot as a terminal bot, or start the app's server with chat sessions turned on.");
  });

  test("a failed terminal action keeps the server's reason", () => {
    expect(botErrorText(new BotApiError("action_failed", "no terminal w1:p2"), t)).toBe("T:The terminal action failed: no terminal w1:p2");
  });

  test("any other refusal shows as it came", () => {
    expect(botErrorText(new BotApiError("invalid_schedule", "Invalid bot schedule."), t)).toBe("Invalid bot schedule.");
    expect(botErrorText(new BotApiError(null, "500"), t)).toBe("500");
    expect(botErrorText(new Error("offline"), t)).toBe("offline");
    expect(botErrorText("plain", t)).toBe("plain");
  });
});
