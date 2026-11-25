import { describe, expect, it } from "bun:test"
import { nextRunAfter, validateBotSchedule } from "./index.ts"

const dtstart = new Date("2026-01-01T00:00:00Z")

describe("bot schedule api", () => {
  it("computes the next cron run in a named timezone", () => {
    const next = nextRunAfter(
      { schedule: "30 9 * * *", dtstart, timezone: "Asia/Seoul" },
      new Date("2026-11-24T00:30:00Z")
    )
    expect(next.toISOString()).toBe("2026-11-25T00:30:00.000Z")
  })

  it("computes the next RRULE run", () => {
    const next = nextRunAfter(
      { schedule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0", dtstart, timezone: "UTC" },
      new Date("2026-11-24T08:00:00Z")
    )
    expect(next.toISOString()).toBe("2026-11-24T09:00:00.000Z")
  })

  it("validates schedules and zones", () => {
    expect(validateBotSchedule("*/10 * * * *", "Asia/Seoul")).toBeNull()
    expect(validateBotSchedule("not a rule")).toContain("Invalid bot schedule.")
    expect(validateBotSchedule("* * * * *", "Mars/Base")).toContain("Unknown time zone")
  })
})
