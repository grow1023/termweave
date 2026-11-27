import { describe, expect, test } from "bun:test";

import { clampSidebarWidth, parseStoredWidth, SIDEBAR_MAX, SIDEBAR_MIN } from "./sidebarWidth.ts";

describe("sidebar width", () => {
  test("stays inside its limits", () => {
    expect(clampSidebarWidth(10, 1600)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(5000, 1600)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(333.4, 1600)).toBe(333);
  });
  test("never takes more than 60% of a narrow window, and never less than the minimum", () => {
    expect(clampSidebarWidth(600, 800)).toBe(480);
    expect(clampSidebarWidth(600, 300)).toBe(SIDEBAR_MIN);
  });
  test("a stored value that is not a usable width reads as none", () => {
    expect(parseStoredWidth(null)).toBeNull();
    expect(parseStoredWidth("wide")).toBeNull();
    expect(parseStoredWidth("90")).toBeNull();
    expect(parseStoredWidth("9000")).toBeNull();
    expect(parseStoredWidth("412")).toBe(412);
  });
});
