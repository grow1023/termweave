// Schedule API for the TermWeave bots server. Wraps the schedule engine ported from
// stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/automations/scheduling/.
import { isKnownTimeZone, unknownTimeZoneMessage } from "./automation-schedule-calendar.ts"
import { nextAutomationOccurrenceAfter } from "./automation-schedule-occurrences.ts"
import {
  getAutomationScheduleInputError,
  parseSchedule,
  type ParsedSchedule
} from "./automation-schedule-parsing.ts"

export type { ParsedSchedule } from "./automation-schedule-parsing.ts"

// Input for nextRunAfter: a cron string or an RRULE string, plus dtstart and timezone.
export type BotSchedule = {
  /** Five-field cron expression or RRULE without the "RRULE:" prefix. */
  schedule: string
  /** First moment a run may fire, as epoch ms or a Date. */
  dtstart: number | Date
  /** IANA zone such as "Asia/Seoul". Absent means the host clock. */
  timezone?: string
}

const toMs = (value: number | Date): number => (value instanceof Date ? value.getTime() : value)

/** Parses a cron or RRULE string; throws on an unsupported or malformed schedule. */
export function parseBotSchedule(schedule: string): ParsedSchedule {
  return parseSchedule(schedule)
}

/** Why new input is refused (schedule and timezone), or null when both are accepted. */
export function validateBotSchedule(
  schedule: string,
  timezone?: string
): string | null {
  if (timezone && !isKnownTimeZone(timezone)) {
    return unknownTimeZoneMessage(timezone)
  }
  return getAutomationScheduleInputError(schedule, "Invalid bot schedule.")
}

/** The first run strictly after `after` and not before dtstart. Throws if none exists in about 9 years. */
export function nextRunAfter(input: BotSchedule, after: Date | number): Date {
  const next = nextAutomationOccurrenceAfter(
    input.schedule,
    toMs(input.dtstart),
    toMs(after),
    input.timezone
  )
  return new Date(next)
}
