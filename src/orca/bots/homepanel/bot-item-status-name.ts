// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/bots/bot-item-status-name.ts and bot-item-groups.ts; adapted for TermWeave.
// An item status as people read it, a group's title, and the groups themselves: TermWeave has no Needs you
// group in the list (its asks are cards above it), no Snoozed and no Stale.
import type { Translate } from "../../../lib/i18n.ts";
import type { BotItem, BotItemStatus } from "../data.ts";

export function statusName(status: BotItemStatus, t: Translate): string {
  switch (status) {
    case "planned": return t("Planned");
    case "working": return t("In progress");
    case "waiting": return t("Waiting");
    case "needs_you": return t("Needs you");
    case "done": return t("Done");
    case "canceled": return t("Canceled");
  }
}

export const GROUP_IDS = ["working", "waiting", "planned", "closed"] as const;
export type GroupId = (typeof GROUP_IDS)[number];
/** Rows a group shows before "Show {count} more". */
export const GROUP_ROWS = 5;
export const GROUPS_FOLDED_BY_DEFAULT: ReadonlySet<GroupId> = new Set<GroupId>(["planned", "closed"]);

export function groupName(id: GroupId, t: Translate): string {
  switch (id) {
    case "working": return t("In progress");
    case "waiting": return t("Waiting");
    case "planned": return t("Planned");
    case "closed": return t("Closed");
  }
}

const stamp = (item: BotItem): number => Date.parse(item.updatedAt) || 0;
const newest = (a: BotItem, b: BotItem): number => stamp(b) - stamp(a) || b.n - a.n;

export type BotItemGroups = Readonly<Record<GroupId, readonly BotItem[]>>;

/** In progress, Waiting and Planned by their last change; Closed (done and canceled) newest first. Needs you is left out. */
export function groupItems(items: readonly BotItem[]): BotItemGroups {
  const of = (...statuses: BotItemStatus[]): BotItem[] => items.filter((item) => statuses.includes(item.status)).sort(newest);
  return { working: of("working"), waiting: of("waiting"), planned: of("planned"), closed: of("done", "canceled") };
}

export const isClosed = (item: BotItem): boolean => item.status === "done" || item.status === "canceled";
