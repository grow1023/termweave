import { describe, expect, test } from "bun:test";
import { isCloseKey, isComposingKey, trapIndex } from "./modalFocus.ts";

const key = (over: Partial<Pick<KeyboardEvent, "key" | "isComposing" | "keyCode" | "defaultPrevented">>) => ({ key: "Escape", isComposing: false, keyCode: 27, defaultPrevented: false, ...over });

describe("isCloseKey", () => {
  test("a plain Escape closes", () => {
    expect(isCloseKey(key({}))).toBe(true);
  });
  test("Escape during an IME composition does not close", () => {
    expect(isCloseKey(key({ isComposing: true }))).toBe(false);
  });
  test("WebKit's key code 229 counts as composing", () => {
    expect(isCloseKey(key({ keyCode: 229 }))).toBe(false);
    expect(isComposingKey({ isComposing: false, keyCode: 229 })).toBe(true);
  });
  test("an Escape a control already handled does not close", () => {
    expect(isCloseKey(key({ defaultPrevented: true }))).toBe(false);
  });
  test("other keys do not close", () => {
    expect(isCloseKey(key({ key: "Enter", keyCode: 13 }))).toBe(false);
  });
});

describe("trapIndex", () => {
  test("Tab on the last control wraps to the first", () => {
    expect(trapIndex(4, 3, false)).toBe(0);
  });
  test("Shift+Tab on the first control wraps to the last", () => {
    expect(trapIndex(4, 0, true)).toBe(3);
  });
  test("inside the list the browser moves the focus", () => {
    expect(trapIndex(4, 1, false)).toBeNull();
    expect(trapIndex(4, 2, true)).toBeNull();
  });
  test("focus outside the dialog comes back in", () => {
    expect(trapIndex(4, -1, false)).toBe(0);
    expect(trapIndex(4, -1, true)).toBe(3);
  });
  test("nothing to focus leaves the key alone", () => {
    expect(trapIndex(0, -1, false)).toBeNull();
  });
});
