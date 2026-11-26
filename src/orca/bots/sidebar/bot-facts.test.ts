import { describe, expect, test } from "bun:test";

import type { Translate } from "../../../lib/i18n.ts";
import type { Bot, BotItem } from "../data.ts";
import type { BotChatStatus } from "../../../../shared/bots/chat.ts";
import type { BotsView } from "../data.ts";
import { botBadge, botFacts, botNeedsOwner, botRowLine, elapsedTick, formatElapsed, type BotFacts } from "./bot-facts.ts";

const t: Translate = (key, vars) => key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ""));
const AT = "2026-11-27T09:00:00.000Z";
const bot: Bot = { id: "b1", name: "Fixer", agent: "claude", home: "/tmp/fixer", repo: null, paused: false, paneId: "p1", createdAt: AT };
const ask: BotItem = { botId: "b1", n: 1, title: "Ship the fix today?", doneMeans: null, status: "needs_you", ask: "Ship it?", options: [], waitingOn: null, comments: [], createdAt: AT, updatedAt: AT };

function facts(over: Partial<BotFacts>): BotFacts {
  return { bot, items: [], needs: [], workers: [], running: true, agentStatus: "idle", working: false, session: false, ...over };
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

describe("a session bot's row reads the server's chat status", () => {
  const session: Bot = { ...bot, paneId: null, runtime: "session", purpose: "Keeps the docs tidy" };
  const of = (status: BotChatStatus | undefined, over: Partial<Bot> = {}, items: BotItem[] = []): BotFacts => {
    const view = { bots: [{ ...session, ...over }], items, automations: [], workers: [], chatStatus: status ? { b1: status } : {} } as BotsView;
    return botFacts({ ...session, ...over }, view, []);
  };

  test("working: the row says Working and shows the spinner", () => {
    const facts = of("working");
    expect(facts.working).toBe(true);
    expect(botRowLine(facts, t)).toEqual({ text: "Working", attention: false });
    expect(botBadge(facts, botRowLine(facts, t))).toBeNull();
  });

  test("waiting or blocked: it needs the owner", () => {
    for (const status of ["waiting", "blocked"] as const) {
      const facts = of(status);
      expect(botRowLine(facts, t)).toEqual({ text: "Waiting for you", attention: true });
      expect(botBadge(facts, botRowLine(facts, t))).toBe("needs-you");
      expect(botNeedsOwner(facts)).toBe(true);
    }
  });

  test("offline or done: the purpose line, no moon, never 'not running'", () => {
    for (const status of ["offline", "done", undefined] as const) {
      const facts = of(status);
      expect(facts.running).toBe(true);
      expect(botRowLine(facts, t)).toEqual({ text: "Keeps the docs tidy", attention: false });
      expect(botBadge(facts, botRowLine(facts, t))).toBeNull();
      expect(botNeedsOwner(facts)).toBe(false);
    }
  });

  test("no purpose: the agent's name, not 'Starts on the next message'", () => {
    expect(botRowLine(of("offline", { purpose: "" }), t).text).toBe("Claude Code");
  });

  test("paused: the moon, labelled as paused", () => {
    const facts = of("offline", { paused: true });
    expect(botRowLine(facts, t)).toEqual({ text: "Paused", attention: false });
    expect(botBadge(facts, botRowLine(facts, t))).toBe("paused");
  });

  test("an open question still comes first", () => {
    const facts = of("working", {}, [ask]);
    expect(botRowLine(facts, t).text).toBe("Ship the fix today?");
    expect(botBadge(facts, botRowLine(facts, t))).toBe("needs-you");
  });

  test("a terminal bot that is not running keeps its moon and its line", () => {
    const pane: Bot = { ...bot, paneId: "p9" };
    const facts = botFacts(pane, { bots: [pane], items: [], automations: [], workers: [] } as BotsView, []);
    expect(facts.session).toBe(false);
    expect(botRowLine(facts, t).text).toBe("Starts on the next message");
    expect(botBadge(facts, botRowLine(facts, t))).toBe("sleeping");
  });
});

describe("a worker's elapsed time (BOT-30)", () => {
  test("seconds only in the first minute, then minutes, then hours and minutes", () => {
    expect([0, 45, 59.9, 60, 192, 3599, 3600, 3900, -5].map(formatElapsed)).toEqual(["0s", "45s", "59s", "1m", "3m", "59m", "1h 00m", "1h 05m", "0s"]);
  });

  test("redrawn each second in the first minute, then once a minute", () => {
    expect([elapsedTick(0), elapsedTick(59), elapsedTick(60), elapsedTick(4000)]).toEqual([1_000, 1_000, 60_000, 60_000]);
  });
});
