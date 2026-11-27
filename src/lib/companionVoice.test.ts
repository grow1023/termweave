import { expect, test } from "bun:test";

import { spokenPart, spokenSentences } from "./companionVoice.ts";

test("the spoken part is the first two sentences without Markdown or code", () => {
  expect(spokenPart("**total()** adds the prices. It ignores `quantity`.\n\n```ts\nconst x = 1;\n```\nSee [cart.ts](src/cart.ts) line 3.")).toBe("total() adds the prices. It ignores quantity.");
  expect(spokenPart("테스트가 실패했습니다. 원인은 수량입니다. 세 번째 문장입니다.")).toBe("테스트가 실패했습니다. 원인은 수량입니다.");
  expect(spokenPart("- one line with no end")).toBe("one line with no end");
  expect(spokenPart("v0.3.68 is live. Done.")).toBe("v0.3.68 is live. Done.");
  expect(spokenPart(`${"word ".repeat(200)}.`).length).toBeLessThanOrEqual(321);
  expect(spokenPart("")).toBe("");
});

test("while an answer still grows, only its finished sentences are said, four at most", () => {
  expect(spokenSentences("The test failed. The cause is the quan", false)).toEqual(["The test failed."]);
  expect(spokenSentences("The test failed. The cause is the quantity.", false)).toEqual(["The test failed.", "The cause is the quantity."]);
  expect(spokenSentences("The test failed. The cause is the quan")).toEqual(["The test failed.", "The cause is the quan"]);
  expect(spokenSentences("One. Two. Three. Four. Five. Six.")).toHaveLength(4);
  expect(spokenSentences("Look:\n```ts\nconst x = 1", false)).toEqual([]);
});
