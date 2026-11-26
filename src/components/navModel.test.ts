import { describe, expect, it } from "bun:test";
import type { BotsView } from "../../shared/bots/types.ts";
import type { Machine } from "../../shared/machines.ts";
import type { SessionSnapshot } from "../../shared/protocol.ts";
import { botPageState, botQuestions, createFolderName, initialBotId, searchWithBot, dropletHold, needsYou, paletteEntries, paletteStart, queueDroplet, searchPalette, shortCwd, takeDroplet } from "./navModel.ts";

function machine(id: string, kind: Machine["kind"], panes: Array<{ id: string; status: string; label?: string }>, state: Machine["state"] = "connected"): Machine {
  return { id, name: `PC ${id}`, kind, enabled: true, state, error: null, snapshot: {
    workspaces: [{ workspace_id: "w", label: `Work ${id}` }],
    panes: panes.map((pane) => ({ workspace_id: "w", pane_id: pane.id, agent_status: pane.status, label: pane.label ?? null })),
  } as SessionSnapshot };
}

function bots(items: Array<{ botId: string; status: string }>): BotsView {
  return {
    bots: [{ id: "b1", name: "Scout", agent: "claude", paneId: "p-bot" }, { id: "b2", name: "Quiet", agent: "codex", paneId: null }],
    items: items.map((item, n) => ({ ...item, n })), automations: [], workers: [],
  } as unknown as BotsView;
}

describe("needsYou", () => {
  it("counts one row per bot with questions, beside the blocked panes", () => {
    const view = bots([{ botId: "b1", status: "needs_you" }, { botId: "b1", status: "needs_you" }, { botId: "b2", status: "done" }]);
    expect(botQuestions(view)).toEqual([{ botId: "b1", name: "Scout", agent: "claude", paneId: "p-bot", count: 2 }]);
    const result = needsYou([machine("local", "local", [{ id: "p1", status: "blocked" }])], view);
    expect(result.total).toBe(2);
  });

  it("does not count a bot's blocked pane twice", () => {
    const view = bots([{ botId: "b1", status: "needs_you" }]);
    const result = needsYou([machine("local", "local", [{ id: "p-bot", status: "blocked" }, { id: "p1", status: "blocked" }])], view);
    expect(result.panes.map(({ pane }) => pane.pane_id)).toEqual(["p1"]);
    expect(result.total).toBe(2);
  });

  it("keeps a remote pane whose id equals a bot pane id, and a bot pane without questions", () => {
    const view = bots([]);
    const result = needsYou([machine("local", "local", [{ id: "p-bot", status: "blocked" }]), machine("r", "ssh", [{ id: "p-bot", status: "blocked" }])], view);
    expect(result.total).toBe(2);
    expect(needsYou([], null).total).toBe(0);
  });

  it("a session bot whose chat waits on the owner has a row, with no item question", () => {
    const scribe = { id: "b9", name: "Scribe", agent: "claude" as const, home: "/tmp/b9", repo: null, paused: false, paneId: null, runtime: "session" as const, createdAt: "2026-11-27T00:00:00.000Z" };
    const waits: BotsView = { bots: [scribe], items: [], automations: [], workers: [], chatStatus: { b9: "blocked" } };
    expect(botQuestions(waits)).toEqual([{ botId: "b9", name: "Scribe", agent: "claude", paneId: null, count: 0 }]);
    expect(botQuestions({ ...waits, chatStatus: { b9: "working" } })).toEqual([]);
    expect(botQuestions({ ...waits, bots: [{ ...scribe, paused: true }] })).toEqual([]);
  });
});

describe("palette", () => {
  const machines = [
    machine("local", "local", [{ id: "p1", status: "idle", label: "alpha" }, { id: "p2", status: "blocked", label: "beta" }]),
    machine("r", "ssh", [{ id: "p1", status: "idle", label: "gamma" }]),
    machine("off", "ssh", [{ id: "p9", status: "idle", label: "gamma offline" }], "disconnected"),
  ];

  it("lists every connected PC, keyed by PC, and leaves offline PCs out", () => {
    expect(paletteEntries(machines).map((entry) => entry.key)).toEqual([
      paletteEntries(machines)[0]!.key, paletteEntries(machines)[1]!.key, paletteEntries(machines)[2]!.key,
    ]);
    expect(new Set(paletteEntries(machines).map((entry) => entry.key)).size).toBe(3);
    expect(paletteEntries(machines).map((entry) => entry.machineId)).toEqual(["local", "local", "r"]);
  });

  it("finds a pane on another PC and keeps its PC and workspace", () => {
    const found = searchPalette("gamma", paletteEntries(machines));
    expect(found.map((entry) => [entry.machineId, entry.pane.pane_id, entry.pane.workspace_id, entry.workspaceLabel])).toEqual([["r", "p1", "w", "Work r"]]);
    expect(searchPalette("Work r", paletteEntries(machines)).map((entry) => entry.machineId)).toEqual(["r"]);
  });

  it("starts with waiting panes, then the recent ones across PCs", () => {
    const entries = paletteEntries(machines);
    const [, local2, remote1] = entries;
    const start = paletteStart(entries, new Map([[remote1!.key, 0], [entries[0]!.key, 1]]));
    expect(start.waiting).toEqual([local2!]);
    expect(start.recent.map((entry) => entry.machineId)).toEqual(["r", "local"]);
    expect(paletteStart(entries, new Map()).recent.length).toBe(2);
  });
});

describe("new session folder", () => {
  it("names the folder the session starts in", () => {
    expect(createFolderName("~/code/app/")).toBe("app");
    expect(createFolderName("~")).toBe("~");
    expect(createFolderName("/")).toBe("/");
    expect(createFolderName("  ")).toBeNull();
  });
});

describe("shortCwd", () => {
  it("keeps the last two folders", () => {
    expect(shortCwd("/private/tmp/tw/herdr-web")).toBe("…/tw/herdr-web");
    expect(shortCwd("~/app")).toBe("~/app");
  });
});

describe("droplet queue", () => {
  const n = (kind: "blocked" | "done" | "ended", id: number) => ({ kind, id });
  it("holds a waiting agent longer", () => {
    expect(dropletHold("blocked")).toBeGreaterThan(dropletHold("done"));
  });
  it("keeps three and drops the oldest finished one first", () => {
    const queue = [n("blocked", 1), n("done", 2), n("blocked", 3)];
    expect(queueDroplet(queue, n("done", 4)).map((item) => item.id)).toEqual([1, 3, 4]);
    expect(queueDroplet([n("blocked", 1), n("blocked", 2), n("blocked", 3)], n("blocked", 4)).map((item) => item.id)).toEqual([2, 3, 4]);
    expect(queue.map((item) => item.id)).toEqual([1, 2, 3]);
  });
  it("shows the oldest waiting agent next", () => {
    const { next, rest } = takeDroplet([n("done", 1), n("blocked", 2), n("blocked", 3)]);
    expect(next?.id).toBe(2);
    expect(rest.map((item) => item.id)).toEqual([1, 3]);
    expect(takeDroplet([]).next).toBeNull();
  });
});

describe("bot page selection", () => {
  it("opens the bot the address names, before the stored one", () => {
    expect(initialBotId("?bot=b1", { bot_id: "b2" })).toBe("b1");
    expect(initialBotId("", { bot_id: "b2", pane_id: "p1" })).toBe("b2");
    expect(initialBotId("", { pane_id: "p1" })).toBeNull();
    expect(initialBotId("", null)).toBeNull();
    expect(initialBotId("", { bot_id: "" })).toBeNull();
  });

  it("a tapped notification's pane wins over a stored bot page", () => {
    expect(initialBotId("?pane=p3&machine=local", { bot_id: "b2" })).toBeNull();
  });

  it("puts the bot in the address and takes it out, keeping other parameters", () => {
    expect(searchWithBot("", "b1")).toBe("?bot=b1");
    expect(searchWithBot("?detached=1", "b1")).toBe("?detached=1&bot=b1");
    expect(searchWithBot("?detached=1&bot=b1", null)).toBe("?detached=1");
    expect(searchWithBot("?bot=b1", null)).toBe("");
    expect(searchWithBot("?bot=b1", "b 2")).toBe("?bot=b+2");
    expect(initialBotId(searchWithBot("", "b 2"), null)).toBe("b 2");
  });

  it("shows a session bot's page, lets a terminal bot's or a deleted bot's go, and waits for the bots", () => {
    const view = { bots: [{ id: "s", runtime: "session" }, { id: "p", runtime: "pane" }, { id: "old" }], items: [], automations: [], workers: [] } as unknown as BotsView;
    expect(botPageState(view, null)).toBe("none");
    expect(botPageState(null, "s")).toBe("wait");
    expect(botPageState(view, "s")).toBe("show");
    expect(botPageState(view, "p")).toBe("pane");
    expect(botPageState(view, "old")).toBe("pane");
    expect(botPageState(view, "gone")).toBe("gone");
  });
});
