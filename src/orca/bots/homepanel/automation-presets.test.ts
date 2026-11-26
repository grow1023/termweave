import { describe, expect, test } from "bun:test";

import { AUTOMATION_PRESETS, presetOf } from "./automation-presets.ts";
import { nextTwoRuns } from "./schedule-preview.ts";

describe("automation presets", () => {
  test("the field's value picks its preset, whatever the spacing", () => {
    expect(presetOf("0 9 * * 1-5")?.label).toBe("Weekdays 9:00");
    expect(presetOf("  0  9 * *   *  ")?.label).toBe("Every morning 9:00");
    expect(presetOf("0 * * * *")?.label).toBe("Every hour");
    expect(presetOf("0 9 * * 1")?.label).toBe("Mondays 9:00");
  });

  test("any other schedule picks none", () => {
    expect(presetOf("30 9 * * *")).toBeNull();
    expect(presetOf("")).toBeNull();
  });

  test("every preset is a schedule the server takes", () => {
    for (const preset of AUTOMATION_PRESETS) expect(nextTwoRuns(preset.cron, Date.UTC(2026, 10, 27), "UTC")).not.toBeNull();
  });
});
