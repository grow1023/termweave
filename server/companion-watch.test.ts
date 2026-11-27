import { expect, test } from "bun:test";

import { CompanionWatch, repeatedError } from "./companion-watch.ts";

const pane = (status: string, id = "w1:p1") => ({ pane_id: id, terminal: "P3 api", status });

test("the first look raises only a waiting agent; later changes raise started and finished", () => {
  const watch = new CompanionWatch();
  expect(watch.observe([pane("working"), pane("blocked", "w1:p2")], null).map((n) => n.kind)).toEqual(["waiting"]);
  expect(watch.observe([pane("done"), pane("working", "w1:p2")], null).map((n) => `${n.kind} ${n.pane_id}`)).toEqual(["finished w1:p1", "started w1:p2"]);
  // nothing changed: the same notices stand, none is added
  expect(watch.observe([pane("done"), pane("working", "w1:p2")], null)).toHaveLength(2);
  // the state ended, and so did its notice
  expect(watch.observe([pane("working"), pane("working", "w1:p2")], null).map((n) => `${n.kind} ${n.pane_id}`)).toEqual(["started w1:p2", "started w1:p1"]);
});

test("a dismissed notice stays away, a later run of the same kind comes back, a closed terminal's goes", () => {
  const watch = new CompanionWatch();
  watch.observe([pane("working")], null);
  const [finished] = watch.observe([pane("done")], null);
  watch.dismiss(finished!.key);
  expect(watch.observe([pane("done")], null)).toEqual([]);
  watch.observe([pane("working")], null);
  expect(watch.observe([pane("done")], null).map((n) => n.kind)).toEqual(["finished"]);
  expect(watch.observe([], null)).toEqual([]);
});

test("the same error twice on the viewed terminal is a notice; numbers that differ do not hide it", () => {
  const screen = "$ bun test\nerror: expected 3 but got 41 at cart.ts:12\n$ bun test\nerror: expected 3 but got 57 at cart.ts:12\n";
  expect(repeatedError(screen)?.line).toBe("error: expected 3 but got 57 at cart.ts:12");
  expect(repeatedError("error: one thing went wrong\nall good\n")).toBeNull();
  expect(repeatedError("0 errors\n0 errors\n")).toBeNull();
  const watch = new CompanionWatch();
  const notices = watch.observe([pane("idle")], { pane_id: "w1:p1", screen });
  expect(notices).toMatchObject([{ kind: "repeated", line: "error: expected 3 but got 57 at cart.ts:12" }]);
  expect(watch.observe([pane("idle")], { pane_id: "w1:p1", screen: "$ " })).toEqual([]);
});
