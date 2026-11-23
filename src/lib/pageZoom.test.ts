import { describe, expect, test } from "bun:test";
import { nextZoom } from "./pageZoom.ts";

describe("nextZoom", () => {
  test("steps like Cmd+= and Cmd+-", () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(0.8, -1)).toBe(0.75);
  });
  test("stops at the ends", () => {
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.5, -1)).toBe(0.5);
  });
});
