// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/bot-upcoming-copy.ts (upcomingShort); adapted for TermWeave.
import type { Translate } from "../../../lib/i18n.ts";

const MINUTE = 60_000;

function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** A next run said short: "in 12m", "6:30 PM" today, "Thu 3 AM" within the week, then "Nov 24". */
export function whenShort(at: number, now: number, locale: string, t: Translate): string {
  const ahead = at - now;
  if (ahead < 60 * MINUTE) return t("in {minutes}m", { minutes: Math.min(59, Math.max(1, Math.ceil(ahead / MINUTE))) });
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  const clock = { hour: "numeric", minute: "2-digit" } as const;
  const options: Intl.DateTimeFormatOptions = days === 0 ? clock : days < 7 ? { weekday: "short", ...clock } : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(locale, options).format(at);
}

/** The age beside a row; Orca's formatShortTimeAgo is `botAge` here. */
export function ageText(age: string | null, t: Translate): string {
  return age === "now" ? t("now") : (age ?? "");
}
