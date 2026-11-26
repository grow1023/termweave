// Schedules the owner picks instead of recalling cron (BOT-29). The When field stays for anything else.

export interface AutomationPreset {
  /** English key for `t`. */
  label: "Every morning 9:00" | "Weekdays 9:00" | "Every hour" | "Mondays 9:00";
  cron: string;
}

export const AUTOMATION_PRESETS: readonly AutomationPreset[] = [
  { label: "Every morning 9:00", cron: "0 9 * * *" },
  { label: "Weekdays 9:00", cron: "0 9 * * 1-5" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Mondays 9:00", cron: "0 9 * * 1" },
];

/** The preset the field holds now (spaces as typed do not matter); null for any other schedule. */
export function presetOf(when: string): AutomationPreset | null {
  const value = when.trim().split(/\s+/).join(" ");
  return AUTOMATION_PRESETS.find((preset) => preset.cron === value) ?? null;
}
