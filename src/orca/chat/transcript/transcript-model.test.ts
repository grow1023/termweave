import { describe, expect, test } from "bun:test";

import { followsEnd, jumpToLatestShown, READER_GESTURE_MS } from "./transcript-model.ts";

const view = (scrollTop: number, scrollHeight: number, clientHeight: number) => ({ scrollTop, scrollHeight, clientHeight });

describe("following the end", () => {
  test("at the end it follows, whoever scrolled", () => {
    expect(followsEnd(true, false, 0)).toBe(true);
    expect(followsEnd(true, true, Number.POSITIVE_INFINITY)).toBe(true);
  });

  test("a scroll off the end right after the reader's gesture stops following", () => {
    expect(followsEnd(false, true, 30)).toBe(false);
    expect(followsEnd(false, true, READER_GESTURE_MS)).toBe(false);
  });

  test("a scroll off the end with no gesture (a layout change) keeps following", () => {
    expect(followsEnd(false, true, READER_GESTURE_MS + 1)).toBe(true);
    expect(followsEnd(false, true, Number.POSITIVE_INFINITY)).toBe(true);
  });

  test("a reader who already left stays away until they reach the end", () => {
    expect(followsEnd(false, false, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("Jump to latest", () => {
  test("hidden while the reader follows the end", () => {
    expect(jumpToLatestShown(true, view(0, 5_000, 300))).toBe(false);
  });

  test("hidden when less than one screen lies below", () => {
    // 300px view, 250px below: the end is one flick away
    expect(jumpToLatestShown(false, view(450, 1_000, 300))).toBe(false);
    // exactly one screen below still counts as near
    expect(jumpToLatestShown(false, view(400, 1_000, 300))).toBe(false);
  });

  test("shown when more than one screen lies below", () => {
    expect(jumpToLatestShown(false, view(399, 1_000, 300))).toBe(true);
    expect(jumpToLatestShown(false, view(0, 5_000, 300))).toBe(true);
  });

  test("never under Orca's 48px, even in a tiny view", () => {
    expect(jumpToLatestShown(false, view(0, 60, 20))).toBe(false);
    expect(jumpToLatestShown(false, view(0, 80, 20))).toBe(true);
  });
});
