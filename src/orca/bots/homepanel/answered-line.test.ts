import { describe, expect, test } from "bun:test";

import { APPROVE, DENY } from "../../../../shared/bots/types.ts";
import type { Vars } from "../../../lib/i18n.ts";
import {
  ANSWERED_HIDDEN_MS,
  type AnsweredRecord,
  answeredText,
  guardKey,
  isHidden,
  layoutRows,
  liveLines,
  nextAnsweredChange,
  pruneAnswered,
} from "./answered-line.ts";

const t = (key: string, vars?: Vars): string => key.replace(/\{(\w+)\}/g, (match, name: string) => (vars && name in vars ? String(vars[name]) : match));
const where = `"api" (w1:p2)`;

function record(key: string, index: number, until: number, stamp = "s1"): AnsweredRecord {
  return { key, stamp, text: key, index, until };
}

describe("answeredText", () => {
  test("an approval says what was done, with the terminal's name and no pane id", () => {
    expect(answeredText(APPROVE, { kind: "send", paneId: "w1:p2", where, text: "ls" }, t)).toBe(`Approved · typed into "api"`);
    expect(answeredText(APPROVE, { kind: "keys", paneId: "w1:p2", where, keys: ["C-c", "Enter"] }, t)).toBe(`Approved · pressed C-c Enter in "api"`);
    expect(answeredText(APPROVE, { kind: "close", paneId: "w1:p2", where }, t)).toBe(`Approved · closed "api"`);
  });

  test("a denial and a question's answer", () => {
    expect(answeredText(DENY, { kind: "close", paneId: "w1:p2", where }, t)).toBe("Denied");
    expect(answeredText("Redis", null, t)).toBe("Answered: Redis");
  });
});

describe("answered records", () => {
  test("a line shows until its time, then the item stays hidden while the server lists it unchanged", () => {
    const records = [record("item:3", 0, 2_000)];
    expect(liveLines(records, 1_999)).toHaveLength(1);
    expect(liveLines(records, 2_000)).toHaveLength(0);
    expect(pruneAnswered(records, [{ key: "item:3", stamp: "s1" }], 2_500)).toHaveLength(1);
    expect(pruneAnswered(records, [], 2_500)).toHaveLength(0);
    expect(pruneAnswered(records, [{ key: "item:3", stamp: "s1" }], 2_000 + ANSWERED_HIDDEN_MS)).toHaveLength(0);
  });

  test("a new ask on the same item shows again", () => {
    const records = [record("item:3", 0, 2_000, "s1")];
    expect(isHidden(records, "item:3", "s1")).toBe(true);
    expect(isHidden(records, "item:3", "s2")).toBe(false);
    expect(pruneAnswered(records, [{ key: "item:3", stamp: "s2" }], 2_500)).toHaveLength(0);
  });

  test("the next change by time", () => {
    expect(nextAnsweredChange([record("item:3", 0, 2_000)], 0)).toBe(2_000);
    expect(nextAnsweredChange([record("item:3", 0, 2_000)], 2_000)).toBe(2_000 + ANSWERED_HIDDEN_MS);
    expect(nextAnsweredChange([], 0)).toBeNull();
  });
});

describe("layoutRows", () => {
  test("a line takes its card's place; the card below counts it", () => {
    const rows = layoutRows(["a", "c"], [record("item:b", 1, 2_000)]);
    expect(rows.map((row) => (row.kind === "card" ? `${row.card}@${row.linesAbove}` : "line"))).toEqual(["a@0", "line", "c@1"]);
  });

  test("lines past the last card go at the end, older first", () => {
    const rows = layoutRows(["a"], [record("item:z", 4, 3_000), record("item:y", 4, 2_000)]);
    expect(rows.map((row) => (row.kind === "card" ? row.card : row.line.key))).toEqual(["a", "item:y", "item:z"]);
  });

  test("the guard key changes when a line appears above a card and again when it leaves", () => {
    const before = guardKey("item:4", 0);
    const during = guardKey("item:4", 1);
    expect(during).not.toBe(before);
    expect(during).not.toContain(" ");
  });
});
