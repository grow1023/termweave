import { expect, test } from "bun:test";

import type { CompanionNotice } from "../../shared/companion.ts";
import { AUTO_LOOK_MS, nextAutoLook } from "./Companion.tsx";

const notice = (key: string): CompanionNotice => ({ key, kind: "finished", pane_id: "w1:p1", terminal: "P3 api" });

test("the companion looks by itself at a new notice, once, and not again within five minutes", () => {
  const now = 10 * AUTO_LOOK_MS;
  expect(nextAutoLook([notice("a"), notice("b")], new Set(), -Infinity, now)?.key).toBe("a");
  expect(nextAutoLook([notice("a"), notice("b")], new Set(["a"]), now - 1000, now)).toBeNull();
  expect(nextAutoLook([notice("a"), notice("b")], new Set(["a"]), now - AUTO_LOOK_MS, now)?.key).toBe("b");
  expect(nextAutoLook([notice("a")], new Set(["a"]), -Infinity, now)).toBeNull();
});
