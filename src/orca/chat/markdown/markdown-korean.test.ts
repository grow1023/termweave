// TermWeave's own check of SPEC 7.3: Orca needs remark-cjk-friendly for `**굵게**는`; does TermWeave's parser?
import { describe, expect, test } from "bun:test";

import { parseInline, parseMarkdown } from "../../../lib/markdown.ts";

describe("Korean emphasis next to Hangul (SPEC 7.3)", () => {
  test("bold followed by a particle", () => {
    expect(parseInline("**굵게**는")).toEqual([
      { type: "strong", children: [{ type: "text", value: "굵게" }] },
      { type: "text", value: "는" },
    ]);
  });

  test("bold inside a sentence, Hangul on both sides", () => {
    expect(parseInline("이건**굵게**다음")).toEqual([
      { type: "text", value: "이건" },
      { type: "strong", children: [{ type: "text", value: "굵게" }] },
      { type: "text", value: "다음" },
    ]);
  });

  test("bold that ends in punctuation before a particle (CommonMark's failing case)", () => {
    expect(parseInline("**\"인용\"**은")).toEqual([
      { type: "strong", children: [{ type: "text", value: "\"인용\"" }] },
      { type: "text", value: "은" },
    ]);
  });

  test("italic and strikethrough before a particle", () => {
    expect(parseInline("*기울임*은 ~~취소~~는")).toEqual([
      { type: "em", children: [{ type: "text", value: "기울임" }] },
      { type: "text", value: "은 " },
      { type: "del", children: [{ type: "text", value: "취소" }] },
      { type: "text", value: "는" },
    ]);
  });

  test("underscore bold before a particle stays text, by the parser's identifier rule", () => {
    expect(parseInline("__굵게__는")).toEqual([{ type: "text", value: "__굵게__는" }]);
  });

  test("a paragraph keeps the bold", () => {
    expect(parseMarkdown("결과는 **성공**입니다.")).toEqual([
      { type: "paragraph", lines: [[
        { type: "text", value: "결과는 " },
        { type: "strong", children: [{ type: "text", value: "성공" }] },
        { type: "text", value: "입니다." },
      ]] },
    ]);
  });
});
