import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Submission } from "../../shared/bots/chat.ts";
import { handleBotCliRequest, handleBotsRequest } from "./api.ts";
import { BotRuntime } from "./runtime.ts";
import type { ClaudeConnection, ClaudeHandlers, ClaudeLaunch } from "./session/connection.ts";
import { BotJournal } from "./session/journal.ts";
import { BotSessionHost } from "./session/session.ts";
import { BotStore } from "./store.ts";

const dirs: string[] = [];
const hosts: Array<{ host: BotSessionHost; journal: BotJournal }> = [];
afterEach(async () => {
  for (const { host, journal } of hosts.splice(0)) { await host.closeAll(); journal.close(); }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const CLAUDE_ID = "22222222-3333-4444-8555-666666666666";

/** A stand-in session connection: records what is sent; it never answers, so its first turn stays open. */
function fakeSessions() {
  const launches: ClaudeLaunch[] = [];
  const sent: string[] = [];
  const open = async (launch: ClaudeLaunch, handlers: ClaudeHandlers): Promise<ClaudeConnection> => {
    launches.push(launch);
    let ended = false;
    return {
      sessionId: launch.sessionId, pid: 1, exited: new Promise<Error>(() => {}),
      send: async (text) => { sent.push(text); },
      interrupt: async () => ({ cancelled: true }),
      setPermissionMode: async () => {}, setModel: async () => {}, setEffort: async () => {}, models: async () => [],
      close: async () => { if (!ended) { ended = true; handlers.onExit(new Error("closed"), true); } },
    };
  };
  return { launches, sent, open };
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(5);
  }
}

/**
 * A stand-in agent: idle once started, and a typed message starts a turn ("working"), unless its
 * pane is in `lostEnter`: then the text sits in its input line until Enter is pressed again
 * (`lostEnter` counts how many Enters are lost; Infinity: never starts).
 */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "tw-bots-"));
  dirs.push(root);
  const repo = join(root, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  let clock = new Date("2026-11-24T00:00:00Z");
  let pane = 0;
  const submitted: Array<{ paneId: string; text: string }> = [];
  const entered: string[] = [];
  const started: Array<{ paneId: string; cwd: string }> = [];
  const git: string[][] = [];
  const notified: string[] = [];
  const alive = new Set<string>();
  const lostEnter = new Map<string, number>();
  const pressed: Array<{ paneId: string; keys: string[] }> = [];
  const closed: string[] = [];
  const resumed: Array<string | null | undefined> = [];
  const store = new BotStore(join(root, "state"));
  const fake = fakeSessions();
  const journal = new BotJournal(join(root, "state", "bot-journal.sqlite"));
  let paneSession: string | null = CLAUDE_ID;
  const sessions = new BotSessionHost({
    journal, store, env: async () => ({ PATH: "/usr/bin" }), changed: () => {}, statusChanged: () => {},
    notify: async () => {}, paneLive: async (made) => made.paneId !== null && alive.has(made.paneId),
    open: fake.open, resolveBinary: () => "/opt/claude",
  });
  hosts.push({ host: sessions, journal });
  const http = (method: string, path: string, body?: unknown, readOnly = false): Promise<Response> =>
    handleBotsRequest(new Request(`http://x${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path.split("?")[0]!, runtime, store, readOnly, sessions);
  const turn = (paneId: string): void => {
    const lost = lostEnter.get(paneId) ?? 0;
    if (lost > 0) { lostEnter.set(paneId, lost - 1); return; }
    queueMicrotask(() => runtime.onPaneStatus(paneId, "working"));
  };
  const runtime: BotRuntime = new BotRuntime({
    store,
    homeRoot: join(root, "homes"),
    serverUrl: () => "http://127.0.0.1:1",
    cliPath: "/opt/termweave/server/bots/cli.ts",
    createWorkspace: async () => { const paneId = `p${++pane}`; alive.add(paneId); return { workspaceId: `w${pane}`, paneId }; },
    startAgent: async (_kind, paneId, cwd, resume) => { started.push({ paneId, cwd }); resumed.push(resume); setTimeout(() => runtime.onPaneStatus(paneId, "idle"), 5); },
    submit: async (paneId, text) => { submitted.push({ paneId, text }); turn(paneId); },
    pressEnter: async (paneId) => { entered.push(paneId); turn(paneId); },
    paneAlive: async (paneId) => alive.has(paneId),
    readTail: async () => "all tests pass\nbranch pushed",
    snapshot: async () => ({
      workspaces: [...alive].map((paneId) => ({ workspace_id: `w-${paneId}`, label: `ws ${paneId}` })) as never,
      panes: [...alive].map((paneId) => ({ pane_id: paneId, workspace_id: `w-${paneId}`, agent_status: "idle", cwd: "/x" })) as never,
    }),
    sendKeys: async (paneId, keys) => { pressed.push({ paneId, keys }); },
    closePane: async (paneId) => { closed.push(paneId); alive.delete(paneId); },
    git: async (args) => { git.push(args); return args[0] === "rev-parse" ? `${repo}\n` : ""; },
    notify: async (title, body) => { notified.push(`${title}: ${body}`); },
    changed: () => {},
    now: () => clock,
    timing: { readyMs: 500, startedMs: 30, settleMs: 0 },
    sessions,
    paneClaudeSession: async () => paneSession,
  });
  /** what reached the bot's chat session, and who it says sent it */
  const mail = (botId: string): Submission[] => { const chat = journal.chat(botId); return chat === null ? [] : journal.submissions(chat.sessionId); };
  /** a bot that has greeted and finished that turn */
  const bot = async (name: string, agent: "claude" | "codex" = "claude") => {
    const made = await runtime.createBot({ name, agent, purpose: `${name} purpose.`, repo });
    await until(() => submitted.some((entry) => entry.paneId === store.bot(made.id)?.paneId && entry.text.includes("You were just created")));
    runtime.onPaneStatus(store.bot(made.id)!.paneId!, "done");
    return store.bot(made.id)!;
  };
  return {
    root, repo, store, runtime, submitted, entered, started, git, notified, alive, lostEnter, pressed, closed, bot, tick: (ms: number) => { clock = new Date(clock.getTime() + ms); },
    fake, mail, resumed, http, setPaneSession: (id: string | null) => { paneSession = id; },
  };
}

describe("bots", () => {
  it("creates a bot with its home and greets in its own pane once the agent is up", async () => {
    const { runtime, submitted, started, bot } = setup();
    const made = await bot("Fixer");
    expect(made.paneId).toBe("p1");
    expect(started).toEqual([{ paneId: "p1", cwd: made.home }]);
    for (const file of ["SOUL.md", "MEMORY.md", "CLAUDE.md", "AGENTS.md", "tw-bot", ".termweave-bot.json", ".claude/settings.json"]) expect(existsSync(join(made.home, file))).toBe(true);
    expect(readFileSync(join(made.home, "CLAUDE.md"), "utf8")).toContain("Fixer purpose.");
    expect(readFileSync(join(made.home, "tw-bot"), "utf8")).toContain("/opt/termweave/server/bots/cli.ts");
    expect(submitted).toEqual([{ paneId: "p1", text: expect.stringContaining("You were just created") }]);
    await expect(runtime.createBot({ name: "fixer", agent: "codex", purpose: "", repo: null })).rejects.toThrow("another bot has this name");
  });

  it("holds messages while the bot is mid-turn and types them once it is idle", async () => {
    const { runtime, submitted, bot } = setup();
    const made = await bot("Q");
    runtime.onPaneStatus("p1", "working");
    await runtime.tell(made.id, "first");
    await runtime.tell(made.id, "second");
    expect(submitted).toHaveLength(1);
    runtime.onPaneStatus("p1", "done");
    await until(() => submitted.length === 2);
    expect(submitted.at(-1)).toEqual({ paneId: "p1", text: "first\n\nsecond" });
  });

  it("starts a worker in its own worktree, prompts it once it is up, and reports its finish to the bot", async () => {
    const { runtime, submitted, git, store, started, bot } = setup();
    const made = await bot("Builder");
    const item = runtime.addItem(made.id, { title: "Fix login", doneMeans: "tests green" });
    const worker = await runtime.startWorker(made.id, { repo: null, agent: "codex", itemN: item.n, spec: "Fix the login test." });
    const worktree = join(made.home, "worktrees", worker.id);
    expect(git.at(-1)).toEqual(["worktree", "add", "-b", `bot/builder/${worker.id}`, worktree, "HEAD"]);
    expect(started.at(-1)).toEqual({ paneId: "p2", cwd: worktree });
    expect(worker).toMatchObject({ paneId: "p2", agent: "codex", status: "starting" });
    expect(store.item(made.id, item.n)?.status).toBe("working");
    // a start-up flicker before the agent is idle is no turn and no finish
    runtime.onPaneStatus("p2", "working");
    await until(() => store.view().workers[0]?.status === "working");
    expect(submitted.at(-1)).toEqual({ paneId: "p2", text: expect.stringContaining("Fix the login test.") });
    runtime.onPaneStatus("p2", "done");
    await until(() => store.view().workers[0]?.status === "done");
    expect(store.view().workers[0]).toMatchObject({ result: "all tests pass\nbranch pushed" });
    await until(() => submitted.at(-1)?.paneId === "p1");
    expect(submitted.at(-1)?.text).toContain(`Worker ${worker.id} (item #1) finished`);
  });

  it("presses Enter again when a start-up agent dropped it, and tells the bot when no turn ever starts", async () => {
    const { runtime, submitted, entered, store, lostEnter, bot } = setup();
    const made = await bot("Retry");
    lostEnter.set("p2", 1);
    const once = await runtime.startWorker(made.id, { repo: null, agent: null, itemN: null, spec: "x" });
    await until(() => store.view().workers.find((entry) => entry.id === once.id)?.status === "working");
    expect(entered).toEqual(["p2"]);
    lostEnter.set("p3", Infinity);
    const never = await runtime.startWorker(made.id, { repo: null, agent: null, itemN: null, spec: "y" });
    await until(() => store.view().workers.find((entry) => entry.id === never.id)?.status === "blocked");
    expect(entered.filter((paneId) => paneId === "p3")).toHaveLength(2);
    runtime.onPaneStatus("p3", "done"); // the text never ran: that is no finish
    expect(store.view().workers.find((entry) => entry.id === never.id)?.status).toBe("blocked");
    await until(() => submitted.at(-1)?.paneId === "p1");
    expect(submitted.at(-1)?.text).toContain(`Worker ${never.id} did not start on its task`);
  });

  it("fails a worker whose terminal closes, and tells the bot", async () => {
    const { runtime, submitted, repo, store, bot } = setup();
    const made = await bot("B");
    const worker = await runtime.startWorker(made.id, { repo, agent: null, itemN: null, spec: "x" });
    await until(() => store.view().workers[0]?.status === "working");
    runtime.onPaneEnded(worker.paneId!);
    expect(store.view().workers[0]?.status).toBe("failed");
    await until(() => submitted.at(-1)?.paneId === "p1");
    expect(submitted.at(-1)?.text).toContain("its terminal closed");
  });

  it("asks the owner through a needs-you item and passes the answer back", async () => {
    const { runtime, submitted, notified, store, bot } = setup();
    const made = await bot("Asker");
    const item = runtime.addItem(made.id, { title: "Release", doneMeans: null });
    expect(() => runtime.setItem(made.id, item.n, { status: "needs_you" })).toThrow("needs-you takes --ask");
    runtime.setItem(made.id, item.n, { status: "needs_you", ask: "Ship today?", options: ["yes", "no"] });
    expect(notified).toEqual(["Asker needs you: #1 Release: Ship today?"]);
    await runtime.answerItem(made.id, item.n, "yes");
    expect(store.item(made.id, item.n)).toMatchObject({ status: "working", ask: null, options: [] });
    expect(submitted.at(-1)?.text).toContain('"Ship today?": yes');
  });

  it("lets the owner rename a bot, edit its notes, close an item and run a schedule now", async () => {
    const { runtime, submitted, store, bot } = setup();
    const made = await bot("Keeper");
    expect(runtime.updateBot(made.id, { name: "Keeper 2" }).name).toBe("Keeper 2");
    expect(() => runtime.updateBot(made.id, { name: "" })).toThrow("a name is");
    runtime.writeNote(made.id, "soul", "Watches the build.\nSecond line.");
    expect(runtime.readNote(made.id, "soul")).toBe("Watches the build.\nSecond line.\n");
    expect(store.bot(made.id)?.purpose).toBe("Watches the build.");
    expect(readFileSync(join(made.home, "CLAUDE.md"), "utf8")).toContain("# Keeper 2");
    expect(readFileSync(join(made.home, "CLAUDE.md"), "utf8")).toContain("Watches the build.");

    const item = runtime.addItem(made.id, { title: "Ship", doneMeans: null });
    await runtime.ownerItem(made.id, item.n, { status: "done", comment: "merged by hand" });
    expect(store.item(made.id, item.n)).toMatchObject({ status: "done" });
    expect(store.item(made.id, item.n)?.comments.at(-1)).toMatchObject({ by: "owner", text: "merged by hand" });
    expect(submitted.at(-1)?.text).toContain("Your owner marked it done on item #1 (Ship): merged by hand");
    await expect(runtime.ownerItem(made.id, item.n, {})).rejects.toThrow("a status or a comment");

    const automation = runtime.addAutomation(made.id, { name: "Nightly", prompt: "Look at CI.", schedule: "0 3 * * *", timezone: null, once: false });
    runtime.onPaneStatus(store.bot(made.id)!.paneId!, "done");
    await runtime.runAutomation(made.id, automation.id);
    expect(store.view().automations[0]).toMatchObject({ enabled: true, nextRunAt: automation.nextRunAt });
    expect(store.view().automations[0]?.lastRunAt).not.toBeNull();
  });

  it("runs a schedule when it is due, once per due time, and a one-time run turns itself off", async () => {
    const { runtime, submitted, store, tick, bot } = setup();
    const made = await bot("Cron");
    expect(() => runtime.addAutomation(made.id, { name: "bad", prompt: "x", schedule: "nope", timezone: null, once: false })).toThrow();
    const every = runtime.addAutomation(made.id, { name: "check", prompt: "Look at CI.", schedule: "*/5 * * * *", timezone: null, once: false });
    const once = runtime.addAutomation(made.id, { name: "remind", prompt: "Remind me.", schedule: "*/5 * * * *", timezone: null, once: true });
    expect(every.nextRunAt).toBe("2026-11-24T00:05:00.000Z");
    await runtime.tick();
    expect(submitted).toHaveLength(1);
    tick(16 * 60_000); // three due times passed while the server was down: one run
    await runtime.tick();
    expect(submitted.at(-1)?.text).toContain("[TermWeave schedule] check");
    // the second waits for the turn the first started
    runtime.onPaneStatus("p1", "done");
    await until(() => submitted.at(-1)?.text.includes("[TermWeave schedule] remind") === true);
    expect(store.view().automations.find((entry) => entry.id === every.id)?.nextRunAt).toBe("2026-11-24T00:20:00.000Z");
    expect(store.view().automations.find((entry) => entry.id === once.id)).toMatchObject({ enabled: false, nextRunAt: null });
  });

  it("lets the bot CLI in from this computer with its own secret only", async () => {
    const { runtime, repo, store, alive, bot } = setup();
    const made = await bot("Cli");
    const secret = JSON.parse(readFileSync(join(made.home, ".termweave-bot.json"), "utf8")).secret as string;
    const call = (loopback: boolean, key: string, command: string, body: object) => handleBotCliRequest(
      new Request(`http://127.0.0.1/api/bot-cli/${command}`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(body) }),
      `/api/bot-cli/${command}`, loopback, runtime, store, async () => [repo]);
    expect((await call(false, secret, "item-add", { title: "x" })).status).toBe(403);
    expect((await call(true, "wrong", "item-add", { title: "x" })).status).toBe(401);
    const added = await call(true, secret, "item-add", { title: "Ship it", doneMeans: "released" });
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({ n: 1, title: "Ship it", status: "planned" });
    const set = await call(true, secret, "item-set", { n: 1, status: "needs_you", ask: "OK?", options: ["yes"] });
    expect(await set.json()).toMatchObject({ status: "needs_you", ask: "OK?" });
    expect((await call(true, secret, "item-set", { n: 1, status: "bogus" })).status).toBe(400);
    alive.add("own3");
    expect(await (await call(true, secret, "pane-send", { id: "own3", text: "ls" })).json()).toEqual({ approval: 2 });
    // the bot cannot rewrite the question its owner approves
    const rewrite = await call(true, secret, "item-set", { n: 2, ask: "harmless?" });
    expect(rewrite.status).toBe(400);
    expect(store.item(made.id, 2)?.ask).toContain("ls");
  });
  it("lists and reads every terminal, and types into the owner's only after APPROVE", async () => {
    const { runtime, submitted, store, alive, bot } = setup();
    const made = await bot("Ops");
    alive.add("own1"); // a terminal the owner opened
    const listed = await runtime.listPanes(made.id);
    expect(listed.find((pane) => pane.paneId === "p1")?.owner).toBe("you");
    expect(listed.find((pane) => pane.paneId === "own1")).toMatchObject({ owner: null, workspace: "ws own1" });
    expect((await runtime.readPane(made.id, "own1", 10)).text).toContain("all tests pass");
    await expect(runtime.readPane(made.id, "nope", 10)).rejects.toThrow("no terminal nope");
    await expect(runtime.paneAction(made.id, { paneId: "p1", kind: "close" })).rejects.toThrow("your own chat");
    await expect(runtime.paneAction(made.id, { paneId: "own1", kind: "keys", keys: ["rm -rf"] })).rejects.toThrow("key names");

    const denied = await runtime.paneAction(made.id, { paneId: "own1", kind: "send", text: "npm test" });
    expect(denied).toEqual({ approval: 1 });
    expect(store.item(made.id, 1)).toMatchObject({ status: "needs_you", options: ["Approve", "Deny"], ask: expect.stringContaining("npm test") });
    await runtime.answerItem(made.id, 1, "Deny");
    expect(store.item(made.id, 1)?.status).toBe("canceled");
    expect(submitted.some((entry) => entry.paneId === "own1")).toBe(false);

    const asked = await runtime.paneAction(made.id, { paneId: "own1", kind: "send", text: "npm test" });
    expect(submitted.some((entry) => entry.paneId === "own1")).toBe(false);
    await runtime.answerItem(made.id, (asked as { approval: number }).approval, "Approve");
    expect(submitted.filter((entry) => entry.paneId === "own1")).toEqual([{ paneId: "own1", text: "npm test" }]);
    expect(store.item(made.id, 2)?.status).toBe("done");
    await expect(runtime.answerItem(made.id, 2, "Approve")).rejects.toThrow("already answered");
    expect(submitted.filter((entry) => entry.paneId === "own1")).toHaveLength(1);
  });

  it("acts on its own workers at once, and closes an owner's terminal only when approved", async () => {
    const { runtime, store, alive, pressed, closed, bot } = setup();
    const made = await bot("Ops2");
    const worker = await runtime.startWorker(made.id, { repo: null, agent: null, itemN: null, spec: "x" });
    expect(await runtime.paneAction(made.id, { paneId: worker.paneId!, kind: "keys", keys: ["Escape"] })).toEqual({ done: true });
    expect(pressed).toEqual([{ paneId: worker.paneId!, keys: ["Escape"] }]);
    alive.add("own2");
    const asked = await runtime.paneAction(made.id, { paneId: "own2", kind: "close" }) as { approval: number };
    expect(closed).toEqual([]);
    await runtime.answerItem(made.id, asked.approval, "Approve");
    expect(closed).toEqual(["own2"]);
    expect(store.item(made.id, asked.approval)?.status).toBe("done");
  });

  it("opens a workspace with an agent and gives it its first prompt", async () => {
    const { runtime, root, started, submitted, bot } = setup();
    const made = await bot("Opener");
    await expect(runtime.openWorkspace(made.id, { cwd: join(root, "missing"), agent: null, label: null, prompt: null })).rejects.toThrow("not a folder");
    await expect(runtime.openWorkspace(made.id, { cwd: root, agent: null, label: null, prompt: "hi" })).rejects.toThrow("needs --agent");
    const opened = await runtime.openWorkspace(made.id, { cwd: root, agent: "codex", label: null, prompt: "Look at the logs." });
    expect(started.at(-1)).toEqual({ paneId: opened.paneId, cwd: root });
    await until(() => submitted.at(-1)?.paneId === opened.paneId);
    expect(submitted.at(-1)?.text).toBe("Look at the logs.");
  });

  it("a session bot greets through its session, with no terminal", async () => {
    const { runtime, fake, mail, started, submitted } = setup();
    const made = await runtime.createBot({ name: "Chatty", agent: "claude", purpose: "Talks.", repo: null, runtime: "session" });
    await until(() => fake.sent.length === 1);
    expect(fake.sent[0]).toContain("You were just created");
    expect(fake.launches[0]).toMatchObject({ cwd: made.home, resume: false });
    expect(mail(made.id)[0]?.from).toEqual({ kind: "termweave", label: null });
    expect(existsSync(join(made.home, "CLAUDE.md"))).toBe(true);
    expect(started).toEqual([]);
    expect(submitted).toEqual([]);
    await expect(runtime.ensurePane(made.id)).rejects.toThrow("runs as a session");
    await expect(runtime.createBot({ name: "Codexy", agent: "codex", purpose: "x", repo: null, runtime: "session" })).rejects.toThrow("only a Claude bot");
  });

  it("a session bot's worker report and schedule reach its session as TermWeave mail; the owner's words as the owner's", async () => {
    const { runtime, repo, store, mail, tick } = setup();
    const made = await runtime.createBot({ name: "Sessy", agent: "claude", purpose: "Works.", repo, runtime: "session" });
    await until(() => mail(made.id).length === 1);
    const worker = await runtime.startWorker(made.id, { repo: null, agent: null, itemN: null, spec: "Fix the bug." });
    await until(() => store.view().workers[0]?.status === "working");
    runtime.onPaneStatus(worker.paneId!, "done");
    await until(() => mail(made.id).some((entry) => entry.text.includes(`Worker ${worker.id}`)));
    runtime.addAutomation(made.id, { name: "Daily", prompt: "Check the build.", schedule: "*/5 * * * *", timezone: null, once: false });
    tick(10 * 60_000);
    await runtime.tick();
    await until(() => mail(made.id).some((entry) => entry.text.includes("[TermWeave schedule] Daily")));
    for (const entry of mail(made.id)) expect(entry.from).toEqual({ kind: "termweave", label: null });
    const typed = await runtime.ownerMessage(made.id, "Status?");
    expect(typed?.state).toBe("queued");
    expect(mail(made.id).at(-1)).toMatchObject({ text: "Status?", from: { kind: "owner" } });
  });

  it("switches a terminal bot to a session and back, carrying its Claude session", async () => {
    const { runtime, store, closed, bot, fake, resumed, setPaneSession, submitted } = setup();
    const made = await bot("Mover");
    setPaneSession(null);
    await expect(runtime.switchRuntime(made.id, "session")).rejects.toThrow("could not find the Claude session");
    expect(store.bot(made.id)?.runtime).toBeUndefined();
    expect(closed).toEqual([]);
    setPaneSession(CLAUDE_ID);
    const switched = await runtime.switchRuntime(made.id, "session");
    expect(switched).toMatchObject({ runtime: "session", claudeSessionId: CLAUDE_ID, paneId: null });
    expect(closed).toEqual(["p1"]);
    await runtime.tell(made.id, "[TermWeave] hello again");
    expect(fake.launches[0]).toMatchObject({ resume: true, sessionId: CLAUDE_ID, cwd: made.home });
    const back = await runtime.switchRuntime(made.id, "pane");
    expect(back.runtime).toBe("pane");
    expect(fake.sent).toEqual(["[TermWeave] hello again"]);
    const paneId = await runtime.ensurePane(made.id);
    expect(paneId).toBe("p2");
    expect(resumed).toEqual([null, CLAUDE_ID]);
    await runtime.tell(made.id, "typed in the terminal");
    expect(submitted.at(-1)).toEqual({ paneId: "p2", text: "typed in the terminal" });
  });

  it("changes a session bot's permission mode", async () => {
    const { runtime, store } = setup();
    const made = await runtime.createBot({ name: "Careful", agent: "claude", purpose: "x", repo: null, runtime: "session" });
    expect(runtime.updateBot(made.id, { permissionMode: "accept-edits" }).permissionMode).toBe("accept-edits");
    expect(store.bot(made.id)?.permissionMode).toBe("accept-edits");
    expect(runtime.chatStatuses()).toEqual({ [made.id]: expect.any(String) });
  });

  it("serves a session bot's chat: pages and the conversation to a watcher, changes to a full device only", async () => {
    const { runtime, http } = setup();
    const made = await runtime.createBot({ name: "Shown", agent: "claude", purpose: "x", repo: null, runtime: "session" });
    const list = await (await http("GET", "/api/bots")).json() as { chatStatus: Record<string, string> };
    expect(Object.keys(list.chatStatus)).toEqual([made.id]);
    const page = await http("GET", `/api/bots/${made.id}/chat?direction=tail&limit=10`, undefined, true);
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({ items: [], status: expect.any(String), queued: expect.any(Array) });
    expect((await http("GET", `/api/bots/${made.id}/chat?direction=sideways`, undefined, true)).status).toBe(400);
    expect((await http("GET", `/api/bots/${made.id}/chat?limit=-1`, undefined, true)).status).toBe(400);
    expect(await (await http("GET", `/api/bots/${made.id}/chat/conversation`, undefined, true)).json()).toMatchObject({ source: "claude-transcript", turns: [] });
    expect((await http("POST", `/api/bots/${made.id}/message`, { text: "hi" }, true)).status).toBe(403);
    expect((await http("POST", `/api/bots/${made.id}/message`, { text: "hi", clientMessageId: "nope" })).status).toBe(400);
    const sent = await (await http("POST", `/api/bots/${made.id}/message`, { text: "hi" })).json() as { clientMessageId: string; state: string };
    expect(sent.state === "accepted" || sent.state === "queued").toBe(true);
    expect(await (await http("POST", `/api/bots/${made.id}/open`)).json()).toEqual({ session: true });
    expect((await http("POST", `/api/bots/${made.id}/prompts/prompt%3Anone`, { optionId: "allow" })).status).toBe(404);
    expect((await http("POST", `/api/bots/${made.id}/prompts/prompt%3Anone`, { answers: "x" })).status).toBe(400);
    expect((await http("PATCH", `/api/bots/${made.id}`, { permissionMode: "full-access" })).status).toBe(400);
    expect(await (await http("POST", `/api/bots/${made.id}/stop`)).json()).toEqual({ cancelled: true });
  });
});
