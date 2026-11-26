import { describe, expect, test } from "bun:test";

import { aroundName, splitWhere } from "./pane-where.ts";

describe("splitWhere", () => {
  test("a quoted label with the pane id in parentheses", () => {
    expect(splitWhere(`"api" (w1:p2)`)).toEqual({ name: `"api"`, id: "w1:p2" });
  });

  test("a label with the pane's title, as the server writes it", () => {
    expect(splitWhere(`"api" · zsh (w1:p2)`)).toEqual({ name: `"api" · zsh`, id: "w1:p2" });
  });

  test("a label that holds parentheses keeps them; the id is the last group", () => {
    expect(splitWhere(`"web (old)" (w3:p1)`)).toEqual({ name: `"web (old)"`, id: "w3:p1" });
  });

  test("a string of another shape is shown as it is", () => {
    expect(splitWhere("the build pane")).toEqual({ name: "the build pane", id: null });
    expect(splitWhere("(w1:p2)")).toEqual({ name: "(w1:p2)", id: null });
    expect(splitWhere("")).toEqual({ name: "", id: null });
  });
});

describe("aroundName", () => {
  test("the text before and after the name", () => {
    expect(aroundName(`Close "api"?`, `"api"`)).toEqual(["Close ", "?"]);
  });

  test("null when the name is empty or missing", () => {
    expect(aroundName("Close it?", "")).toBeNull();
    expect(aroundName("Close it?", `"api"`)).toBeNull();
  });
});
