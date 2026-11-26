import { describe, expect, test } from "bun:test";
import { LISTABLE_ON_REMOTE, parentFolder } from "./parentFolder.ts";

describe("parentFolder", () => {
  test.each([
    ["/srv/me/notes.txt", "/srv/me"],
    ["/notes.txt", "/"],
    ["~/src/app.ts", "~/src"],
    ["~/app.ts", "~"],
    ["src/app.ts", "src"],
    ["app.ts", "."],
    ["/srv/me/dir/", "/srv/me"],
    ["C:\\Users\\me\\a.txt", "C:\\Users\\me"],
    ["C:\\a.txt", "C:\\"],
  ])("%p is in %p", (path, parent) => {
    expect(parentFolder(path)).toBe(parent);
  });
  test.each(["", "/", "~", "C:\\"])("%p has no folder above it", (path) => {
    expect(parentFolder(path)).toBeNull();
  });
});

describe("LISTABLE_ON_REMOTE", () => {
  test("absolute and home paths are listable, relative ones are not", () => {
    expect(LISTABLE_ON_REMOTE.test("/srv")).toBe(true);
    expect(LISTABLE_ON_REMOTE.test("~")).toBe(true);
    expect(LISTABLE_ON_REMOTE.test("C:\\x")).toBe(true);
    expect(LISTABLE_ON_REMOTE.test(".")).toBe(false);
    expect(LISTABLE_ON_REMOTE.test("src")).toBe(false);
  });
});
