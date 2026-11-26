import { describe, expect, test } from "bun:test";
import { matchesWords, queryWords, rowMatches, sectionMatches } from "./settingsSearch.ts";

describe("queryWords", () => {
  test("splits on any space and folds case", () => {
    expect(queryWords("  Pair   QR ")).toEqual(["pair", "qr"]);
  });
  test("a blank query has no words", () => {
    expect(queryWords("   ")).toEqual([]);
  });
  test("full-width letters fold to ASCII", () => {
    expect(queryWords("ＱＲ")).toEqual(["qr"]);
  });
});

describe("matchesWords", () => {
  test("Korean words match in any order", () => {
    expect(matchesWords("테스트 알림", queryWords("알림 테스트"))).toBe(true);
  });
  test("every word must occur", () => {
    expect(matchesWords("테스트 알림", queryWords("알림 페어링"))).toBe(false);
  });
  test("no words match nothing", () => {
    expect(matchesWords("anything", [])).toBe(false);
  });
});

const devices = { title: "페어링된 기기", keywords: "페어링 코드 QR 폐기 이름 pair code" };
const android = { title: "Android screen mirroring", keywords: "Android mirror ADB scrcpy USB Wi-Fi LTE relay" };
const alerts = { title: "알림", keywords: "알림 푸시 테스트 켜기 끄기" };

describe("sectionMatches", () => {
  test.each([
    [devices, "페어링"],
    [devices, "QR"],
    [devices, "qr 페어링"],
    [android, "android"],
    [android, "Android"],
    [android, "mirror adb"],
    [alerts, "알림 테스트"],
    [alerts, "테스트 알림"],
  ])("%p finds %p", (section, query) => {
    expect(sectionMatches(section, queryWords(query))).toBe(true);
  });
  test("a word the section lacks hides it", () => {
    expect(sectionMatches(devices, queryWords("android"))).toBe(false);
  });
});

describe("rowMatches", () => {
  test("one word names the section, another the row", () => {
    const appearance = { title: "Appearance", keywords: "export import" };
    expect(rowMatches("Terminal font size Applied to every terminal pane", appearance, queryWords("appearance size"))).toBe(true);
  });
  test("a row without the word stays hidden", () => {
    const chat = { title: "Chat", keywords: "" };
    expect(rowMatches("Show thinking", chat, queryWords("font"))).toBe(false);
  });
});
