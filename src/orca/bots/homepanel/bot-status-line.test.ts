import { describe, expect, test } from "bun:test";

import type { Translate } from "../../../lib/i18n.ts";
import type { Bot, BotItem } from "../data.ts";
import { botStatusLine } from "./BotPanelHeader.tsx";

const t: Translate = (key, vars) => key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ""));
const AT = "2026-11-27T09:00:00.000Z";
const bot: Bot = { id: "b1", name: "Fixer", agent: "claude", home: "/tmp/fixer", repo: null, paused: false, paneId: "p1", createdAt: AT };
const item = (n: number, status: BotItem["status"]): BotItem => ({ botId: "b1", n, title: `Item ${n}`, doneMeans: null, status, ask: null, options: [], waitingOn: null, comments: [], createdAt: AT, updatedAt: AT });
const line = (items: BotItem[], paused = false): string => botStatusLine({ ...bot, paused }, items, [], Date.parse(AT), "en", t);

describe("the Home header's status line", () => {
  test("one waiting question says Needs you, not Idle", () => {
    expect(line([item(1, "needs_you")])).toBe("Needs you");
  });

  test("several waiting questions are counted, before what is running", () => {
    expect(line([item(1, "needs_you"), item(2, "needs_you"), item(3, "working")])).toBe("2 questions wait for you");
  });

  test("Paused still comes first", () => {
    expect(line([item(1, "needs_you")], true)).toBe("Paused");
  });

  test("with nothing waiting it says what runs, else Idle", () => {
    expect(line([item(3, "working")])).toBe("Running Item 3");
    expect(line([])).toBe("Idle");
  });
});
