import { expect, it } from "bun:test";

import type { BotsView } from "../../shared/bots/types.ts";
import { botWorkspaceIds } from "./bots.ts";
import { fullOrderIndex } from "./workspaceReorder.ts";

it("hides a bot's chat and its running workers, and gives a finished worker back to the list", () => {
  const view = {
    bots: [{ id: "b", paneId: "p1" }],
    workers: [{ id: "w1", paneId: "p2", status: "working" }, { id: "w2", paneId: "p3", status: "done" }, { id: "w3", paneId: "p9", status: "blocked" }],
    items: [], automations: [],
  } as unknown as BotsView;
  const panes = [{ pane_id: "p1", workspace_id: "W1" }, { pane_id: "p2", workspace_id: "W2" }, { pane_id: "p3", workspace_id: "W3" }, { pane_id: "p4", workspace_id: "W4" }];
  expect([...botWorkspaceIds(view, panes)].sort()).toEqual(["W1", "W2"]);
  expect(botWorkspaceIds(null, panes).size).toBe(0);
});

it("turns a place in the shown list into herdr's order around hidden workspaces", () => {
  const order = ["a", "H", "b", "c"];
  const shown = ["a", "b", "c"];
  expect(fullOrderIndex(order, shown, 2)).toBe(3); // a dragged below c: after c, past the hidden H
  expect(fullOrderIndex(order, shown, 0)).toBe(0); // c dragged to the top
  expect(fullOrderIndex(order, shown, 1)).toBe(2);
  expect(fullOrderIndex(order, shown, -1)).toBeNull(); // Alt+Up on the first: nothing moves
  expect(fullOrderIndex(order, shown, 3)).toBeNull();
  expect(fullOrderIndex(["a", "b"], ["a", "b"], 1)).toBe(1); // nothing hidden: the same index as before
});
