// Dev-only sample data for review screenshots (SPEC 5.0); TermWeave's own, shaped after stablyai/orca (MIT,
// Copyright (c) 2026 Lovecast Inc.) fixtures. Not imported by the app.
import type { NativeChatImageRefBlock } from "../shared/index.ts";

const longCode = Array.from({ length: 42 }, (_, n) => `line ${n + 1}: const value${n} = ${n} * 2;`).join("\n");

/** Every block type of `parseMarkdown`, in one message. */
export const markdownEveryBlock = [
  "# Heading 1",
  "## Heading 2",
  "### Heading 3",
  "",
  "A paragraph with **bold**, *em*, ~~del~~, `inline code`, a [link](https://example.com) and a file [report](/repo/out/REPORT.md).",
  "결과는 **성공**입니다. 이건 **굵게**는 한글 옆의 굵은 글씨입니다.",
  "Inline math \\(e^{i\\pi} + 1 = 0\\) and a bare address https://example.com/docs.",
  "",
  "\\[\\int_0^1 x^2\\,dx = \\tfrac{1}{3}\\]",
  "",
  "- first",
  "- second",
  "  - nested",
  "",
  "3. three",
  "4. four",
  "",
  "| Name | Value |",
  "| --- | --- |",
  "| alpha | `1` |",
  "| beta | **2** |",
  "",
  "> A quote: tinted, never a left bar.",
  "",
  "---",
  "",
  "```ts",
  "export const answer: number = 42;",
  "```",
  "",
  "```",
  "no language: actions float on hover",
  "```",
  "",
  "```py",
  longCode,
  "```",
].join("\n");

/** Tags in agent text show as text. */
export const markdownRawHtml = "<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))";

export const sampleImages: NativeChatImageRefBlock[] = [
  { type: "image-ref", url: "/api/pane/conversation/image?pane_id=p1&ref=u1:0", mediaType: "image/png", alt: "Screenshot" },
  { type: "image-ref", url: "/api/pane/conversation/image?pane_id=p1&ref=u1:1", mediaType: "image/jpeg" },
  { type: "image-ref", url: "javascript:alert(1)", mediaType: "image/png", alt: "Refused URL" },
];
