import { describe, expect, test } from "bun:test";

import { nextPlacements, SETTLE_MS, settled } from "./card-placement.ts";

describe("card placement", () => {
  test("the cards of the first render are settled", () => {
    const placed = nextPlacements(null, ["item:1", "item:2"], 1_000);
    expect(settled(placed.get("item:1"), 1_000)).toBe(true);
    expect(settled(placed.get("item:2"), 1_000)).toBe(true);
  });

  test("the card that moves into an answered card's place ignores answers for a moment", () => {
    const first = nextPlacements(null, ["item:3", "item:4"], 0);
    const after = nextPlacements(first, ["item:4"], 10_000);
    expect(after.get("item:4")).toEqual({ index: 0, since: 10_000 });
    expect(settled(after.get("item:4"), 10_000 + SETTLE_MS - 1)).toBe(false);
    expect(settled(after.get("item:4"), 10_000 + SETTLE_MS)).toBe(true);
  });

  test("a card that keeps its place keeps its time", () => {
    const first = nextPlacements(null, ["item:1"], 0);
    const after = nextPlacements(first, ["item:1", "item:2"], 5_000);
    expect(after.get("item:1")).toBe(first.get("item:1"));
    expect(settled(after.get("item:1"), 5_000)).toBe(true);
  });

  test("a card that appears after the first render ignores answers for a moment", () => {
    const empty = nextPlacements(null, [], 0);
    const after = nextPlacements(empty, ["item:3"], 2_000);
    expect(settled(after.get("item:3"), 2_100)).toBe(false);
    expect(settled(after.get("item:3"), 2_000 + SETTLE_MS)).toBe(true);
  });

  test("a card pushed down by a new card above it ignores answers for a moment", () => {
    const first = nextPlacements(null, ["item:1"], 0);
    const after = nextPlacements(first, ["item:9", "item:1"], 3_000);
    expect(settled(after.get("item:1"), 3_000)).toBe(false);
  });

  test("an unknown card is not held back", () => {
    expect(settled(undefined, 0)).toBe(true);
  });
});
