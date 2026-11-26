import { describe, expect, test } from "bun:test";

import type { Translate } from "../../../lib/i18n.ts";
import type { Bot, BotItem } from "../data.ts";
import { botBadge, botNeedsOwner, botRowLine, type BotFacts } from "./bot-facts.ts";

const t: Translate = (key, vars) => key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ""));
const AT = "2026-11-27T09:00:00.000Z";
const bot: Bot = { id: "b1", name: "Fixer", agent: "claude", home: "/tmp/fixer", repo: null, paused: false, paneId: "p1", createdAt: AT };
const ask: BotItem = { botId: "b1", n: 1, title: "Ship the fix today?", doneMeans: null, status: "needs_you", ask: "Ship it?", options: [], waitingOn: null, comments: [], createdAt: AT, updatedAt: AT };

function facts(over: Partial<BotFacts>): BotFacts {
  return { bot, items: [], needs: [], workers: [], running: true, agentStatus: "idle", working: false, ...over };
}

describe("a paused bot with an open question", () => {
  const paused = facts({ bot: { ...bot, paused: true }, items: [ask], needs: [ask] });

  test("its line is the question, not Paused", () => {
    expect(botRowLine(paused, t)).toEqual({ text: "Ship the fix today?", at: AT, attention: true });
  });

  test("its picture keeps the question badge", () => {
    expect(botBadge(paused, botRowLine(paused, t))).toBe("needs-you");
  });

  test("it counts as needing the owner", () => {
    expect(botNeedsOwner(paused)).toBe(true);
  });
});

describe("a paused bot with nothing open", () => {
  const paused = facts({ bot: { ...bot, paused: true }, agentStatus: "blocked" });

  test("says Paused, with no badge", () => {
    expect(botRowLine(paused, t)).toEqual({ text: "Paused", attention: false });
    expect(botBadge(paused, botRowLine(paused, t))).toBeNull();
  });

  test("a blocked chat of a paused bot does not count", () => {
    expect(botNeedsOwner(paused)).toBe(false);
  });
});

describe("a running bot", () => {
  test("a blocked chat needs the owner", () => {
    expect(botNeedsOwner(facts({ agentStatus: "blocked" }))).toBe(true);
  });

  test("two questions are counted", () => {
    const two = facts({ needs: [ask, { ...ask, n: 2 }] });
    expect(botRowLine(two, t).text).toBe("2 questions wait for you");
  });
});
