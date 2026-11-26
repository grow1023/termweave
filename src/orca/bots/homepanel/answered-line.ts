// After an answer goes through, its card stays for a moment as one line that says what happened, then
// leaves (BOT-23). The list keeps these records, not the card: the item can leave the server's list
// before the line does. Pure, so `answered-line.test.ts` covers it; the hook is use-answered-lines.ts.
import { APPROVE, DENY } from "../../../../shared/bots/types.ts";
import type { Translate } from "../../../lib/i18n.ts";
import type { BotPaneAction } from "../data.ts";
import { splitWhere } from "./pane-where.ts";

/** How long the line stays. */
export const ANSWERED_SHOWN_MS = 2_000;
/** After the line, how long the answered item stays hidden while the server's list still shows it unchanged. */
export const ANSWERED_HIDDEN_MS = 10_000;

export interface AnsweredRecord {
  /** The card's key in its list, such as `item:3`. */
  key: string;
  /** The item's `updatedAt` when answered: a new ask on the same item has a new stamp and shows again. */
  stamp: string;
  text: string;
  /** Where the card stood among the cards; the line takes its place. */
  index: number;
  /** When the line leaves. */
  until: number;
}

/** What the line says. Approvals answer exactly APPROVE or DENY; anything else is a question's answer. */
export function answeredText(answer: string, action: BotPaneAction | null, t: Translate): string {
  if (!action) return t("Answered: {answer}", { answer });
  if (answer === DENY) return t("Denied");
  if (answer !== APPROVE) return t("Answered: {answer}", { answer });
  const where = splitWhere(action.where).name;
  switch (action.kind) {
    case "send": return t("Approved · typed into {where}", { where });
    case "keys": return t("Approved · pressed {keys} in {where}", { keys: action.keys.join(" "), where });
    case "close": return t("Approved · closed {where}", { where });
  }
}

/** The lines on screen now. */
export function liveLines(records: readonly AnsweredRecord[], now: number): AnsweredRecord[] {
  return records.filter((record) => record.until > now);
}

/** True while the answered card must not show again as a card. */
export function isHidden(records: readonly AnsweredRecord[], key: string, stamp: string): boolean {
  return records.some((record) => record.key === key && record.stamp === stamp);
}

/**
 * The records to keep: a line on screen, or an answered item the server still lists unchanged (for at
 * most ANSWERED_HIDDEN_MS after the line, so a lost update never hides an item for good).
 */
export function pruneAnswered(records: readonly AnsweredRecord[], present: readonly { key: string; stamp: string }[], now: number): AnsweredRecord[] {
  return records.filter((record) =>
    record.until > now
    || (now < record.until + ANSWERED_HIDDEN_MS && present.some((each) => each.key === record.key && each.stamp === record.stamp)));
}

/** When the records next change by time alone; null when nothing waits. */
export function nextAnsweredChange(records: readonly AnsweredRecord[], now: number): number | null {
  const times = records.flatMap((record) => [record.until, record.until + ANSWERED_HIDDEN_MS]).filter((at) => at > now);
  return times.length === 0 ? null : Math.min(...times);
}

export type AnsweredRow<T> =
  | { kind: "card"; card: T; linesAbove: number }
  | { kind: "line"; line: AnsweredRecord };

/** The cards with each line in its card's old place (a line at index k stands before the card now at k). */
export function layoutRows<T>(cards: readonly T[], lines: readonly AnsweredRecord[]): AnsweredRow<T>[] {
  const sorted = [...lines].sort((a, b) => a.index - b.index || a.until - b.until);
  const rows: AnsweredRow<T>[] = [];
  let next = 0;
  cards.forEach((card, index) => {
    while (next < sorted.length && sorted[next]!.index <= index) rows.push({ kind: "line", line: sorted[next++]! });
    rows.push({ kind: "card", card, linesAbove: next });
  });
  while (next < sorted.length) rows.push({ kind: "line", line: sorted[next++]! });
  return rows;
}

/**
 * A card's key for the 500 ms guard (use-settled-cards.ts). It holds the number of lines above the card:
 * when a line appears or leaves, the card under it moves without changing its index, and must count as moved.
 */
export function guardKey(key: string, linesAbove: number): string {
  return `${key}@${linesAbove}`;
}
