import { expect, test } from "bun:test";

import { noteTerminalSelection, terminalSelection } from "./terminalSelection.ts";

test("a terminal's selection is held until that terminal clears it", () => {
  const a = {}, b = {};
  noteTerminalSelection(a, "npm test");
  noteTerminalSelection(b, "");
  expect(terminalSelection()).toBe("npm test");
  noteTerminalSelection(a, "");
  expect(terminalSelection()).toBe("");
});
