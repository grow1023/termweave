import { beforeEach, expect, test } from "bun:test";

import { CompanionActions, parseAction, type ActionPane } from "./companion-actions.ts";

let panes: ActionPane[];
let screen: string;
let done: string[];
let actions: CompanionActions;
beforeEach(() => {
  panes = [{ pane_id: "w1:p1", label: "api", number: 3 }];
  screen = "$ ";
  done = [];
  actions = new CompanionActions({
    panes: async () => panes,
    readScreen: async () => screen,
    sendText: async (paneId, text) => { done = [...done, `send ${paneId} ${text}`]; },
    openTerminal: async (label) => { done = [...done, `open ${label}`]; return label ?? "new"; },
    appendNote: async (paneId, text) => { done = [...done, `note ${paneId} ${text}`]; },
  }, "/srv/app");
});

const SEND = "mcp__termweave__send_to_terminal";
const send = { pane_id: "w1:p1", text: "run the tests" };

test("an action is parsed strictly: control characters and missing fields are refused", () => {
  expect(parseAction(SEND, send)).toEqual({ tool: "send_to_terminal", ...send });
  expect(typeof parseAction(SEND, { pane_id: "w1:p1", text: "ls\u001b[2J" })).toBe("string");
  expect(typeof parseAction(SEND, { text: "ls" })).toBe("string");
  expect(typeof parseAction("mcp__termweave__add_note_line", { pane_id: "w1:p1", text: "a\nb" })).toBe("string");
  expect(parseAction("mcp__termweave__open_terminal", {})).toEqual({ tool: "open_terminal", label: null });
  expect(parseAction("mcp__termweave__rm", {})).toBe("no such action");
});

test("nothing runs without an approval, and one approval runs one action", async () => {
  expect(await actions.run(SEND, send)).toStartWith("Not done: the owner did not approve");
  const gate = await actions.gate(SEND, send);
  expect(gate.card).toEqual({ once: true, detail: "run the tests", action: { kind: "send", target: "P3 api" } });
  // the card is up, nobody pressed Allow
  expect(await actions.run(SEND, send)).toStartWith("Not done");
  expect(done).toEqual([]);
  gate.allowed?.();
  // an approval is for exactly what the card showed
  expect(await actions.run(SEND, { ...send, text: "rm -rf build" })).toStartWith("Not done");
  expect(await actions.run(SEND, { text: "run the tests", pane_id: "w1:p1" })).toStartWith("Done");
  expect(done).toEqual(["send w1:p1 run the tests"]);
  expect(await actions.run(SEND, send)).toStartWith("Not done");
  expect(done).toHaveLength(1);
});

test("a tool of another server is refused, and a terminal outside the project gets no card", async () => {
  expect(await actions.gate("mcp__claude_ai_Docs__delete", { id: "1" })).toEqual({ deny: "The companion cannot use this tool." });
  expect((await actions.gate(SEND, { pane_id: "w9:p9", text: "ls" })).deny).toContain("not open in this project");
  expect((await actions.gate(SEND, { pane_id: "w1:p1" })).deny).toContain("not shown to the owner");
  // a read outside the project still asks, with no lasting option
  expect(await actions.gate("Read", { file_path: "/etc/hosts" })).toEqual({ card: { once: true } });
});

test("an approved send is not typed into a terminal that closed or now asks for a password", async () => {
  (await actions.gate(SEND, send)).allowed?.();
  screen = "Password: ";
  expect(await actions.run(SEND, send)).toContain("asking for a password");
  (await actions.gate(SEND, send)).allowed?.();
  screen = "$ ";
  panes = [];
  expect(await actions.run(SEND, send)).toContain("closed before");
  expect(done).toEqual([]);
});

test("a send to a terminal with an agent names that agent on the card", async () => {
  panes = [{ pane_id: "w1:p1", label: "api", number: 3, agent: "claude" }];
  expect((await actions.gate(SEND, send)).card?.action).toEqual({ kind: "send", target: "P3 api", agent: "claude" });
});

test("opening a terminal and adding a note line run after their approval", async () => {
  const open = await actions.gate("mcp__termweave__open_terminal", { label: "tests" });
  expect(open.card).toEqual({ once: true, detail: "tests", action: { kind: "open", target: "/srv/app" } });
  open.allowed?.();
  expect(await actions.run("open_terminal", { label: "tests" })).toBe('Done: opened the terminal "tests".');
  const note = await actions.gate("mcp__termweave__add_note_line", { pane_id: "w1:p1", text: "check the login test" });
  note.allowed?.();
  expect(await actions.run("add_note_line", { pane_id: "w1:p1", text: "check the login test" })).toStartWith("Done");
  expect(done).toEqual(["open tests", "note w1:p1 check the login test"]);
});

test("the server lists the three tools, each asked before every call", async () => {
  const server = await actions.server();
  expect(server).toMatchObject({ type: "sdk", name: "termweave" });
  expect(server.tools).toEqual(["send_to_terminal", "open_terminal", "add_note_line"].map((name) => ({ name, permission_policy: "always_ask" })));
});
