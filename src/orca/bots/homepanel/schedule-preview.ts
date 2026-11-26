// What a typed schedule means, while it is typed: its next two runs, read by the same schedule engine
// the server runs (shared/bots/schedule), so the preview cannot disagree with what will happen.
import { nextRunAfter, validateBotSchedule } from "../../../../shared/bots/schedule/index.ts";

/** The next two runs after `now`, or null when the server would refuse the schedule (or it never runs). */
export function nextTwoRuns(schedule: string, now: number, timezone?: string): [number, number] | null {
  const value = schedule.trim();
  if (value === "" || validateBotSchedule(value, timezone) !== null) return null;
  try {
    const input = { schedule: value, dtstart: now, ...(timezone ? { timezone } : {}) };
    const first = nextRunAfter(input, now).getTime();
    return [first, nextRunAfter(input, first).getTime()];
  } catch {
    return null;
  }
}

/** A run said with its weekday, date and time, in the owner's language: "Mon, Nov 30 at 9:00 AM". */
export function runText(at: number, locale: string, timezone?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timezone ? { timeZone: timezone } : {}) }).format(at);
}
