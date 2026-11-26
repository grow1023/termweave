import { describe, expect, test } from "bun:test";

import { nextTwoRuns, runText } from "./schedule-preview.ts";

// Wednesday 2026-11-25 12:00 UTC
const NOW = Date.parse("2026-11-25T12:00:00.000Z");

describe("nextTwoRuns", () => {
  test("weekdays at 9 run Thursday, then Friday", () => {
    expect(nextTwoRuns("0 9 * * 1-5", NOW, "UTC")).toEqual([Date.parse("2026-11-26T09:00:00.000Z"), Date.parse("2026-11-27T09:00:00.000Z")]);
  });

  test("every hour runs on the next two hours", () => {
    expect(nextTwoRuns("0 * * * *", NOW, "UTC")).toEqual([Date.parse("2026-11-25T13:00:00.000Z"), Date.parse("2026-11-25T14:00:00.000Z")]);
  });

  test("a schedule the server refuses has no preview", () => {
    expect(nextTwoRuns("nope", NOW, "UTC")).toBeNull();
    expect(nextTwoRuns("", NOW, "UTC")).toBeNull();
    expect(nextTwoRuns("61 9 * * *", NOW, "UTC")).toBeNull();
  });
});

describe("runText", () => {
  test("says the weekday, the date and the time", () => {
    // the joining words differ between ICU versions ("," or " at "): check the parts
    const text = runText(Date.parse("2026-11-26T09:00:00.000Z"), "en-US", "UTC");
    for (const part of ["Thu", "Nov 26", "9:00", "AM"]) expect(text).toContain(part);
  });
});
