// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/markdown/NativeChatMarkdown.tsx
// and src/renderer/src/components/comment-markdown/comment-markdown-element-renderers.tsx (document variant); adapted for TermWeave.
// Decision: Orca renders through react-markdown; TermWeave keeps its own parser (src/lib/markdown.ts,
// SPEC 3.1) and draws its blocks with Orca's element classes. The look rules live in shared/chat.css.
// Raw HTML is never drawn: the parser has no HTML node, so tags in agent text show as text.
import { useMemo, type ReactNode } from "react";

import { parseMarkdown, type ListBlock, type MarkdownBlock } from "../../../lib/markdown.ts";
import { cn } from "../../cn.ts";
import type { ChatMarkdownProps } from "../shared/index.ts";
import { ChatCodeBlock } from "./ChatCodeBlock.tsx";
import { MarkdownInline, MathExpression } from "./MarkdownInline.tsx";

const HEADING: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "mb-2 mt-4 text-[18px] font-semibold leading-tight first:mt-0",
  2: "mb-2 mt-4 text-[16px] font-semibold leading-tight first:mt-0",
  3: "mb-2 mt-3 text-[15px] font-semibold leading-tight first:mt-0",
  4: "mb-1 mt-3 font-semibold first:mt-0",
  5: "mb-1 mt-3 font-semibold first:mt-0",
  6: "mb-1 mt-3 font-semibold first:mt-0",
};

// SPEC 4.3: Orca's quote is `border-l-2 border-border/70 pl-3`, a left bar; a light tint replaces it.
const BLOCKQUOTE = "my-3 rounded-md bg-chat-foreground/5 px-3 py-1.5 text-muted-foreground";

// The owner forbids row and cell separator lines (2026-11-27): Orca's cell borders are left out; cells are
// parted by padding, and the header row by a light tint.
const TABLE_WRAP = "my-3 max-w-full overflow-x-auto rounded-md";
const TABLE = "min-w-full border-collapse text-[13px] [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top [&_th]:bg-chat-foreground/5 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th:first-child]:rounded-l-md [&_th:last-child]:rounded-r-md";

function List({ block }: { block: ListBlock }) {
  const items = block.items.map((item, index) => (
    <li key={index} className="[&>input]:pointer-events-none">
      <MarkdownInline nodes={item.content} />
      {item.blocks !== undefined ? <Blocks blocks={item.blocks} /> : null}
    </li>
  ));
  return block.ordered
    ? <ol start={block.start} className="my-2.5 ml-5 list-decimal space-y-0.75">{items}</ol>
    : <ul className="my-2.5 ml-5 list-disc space-y-0.75">{items}</ul>;
}

function Table({ block }: { block: Extract<MarkdownBlock, { type: "table" }> }) {
  return (
    <div className={TABLE_WRAP}>
      <table className={TABLE}>
        <thead>
          <tr>{block.header.map((cell, n) => <th key={n}><MarkdownInline nodes={cell} /></th>)}</tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>{row.map((cell, n) => <td key={n}><MarkdownInline nodes={cell} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ block }: { block: MarkdownBlock }): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as const;
      return <Tag className={HEADING[block.level]}><MarkdownInline nodes={block.content} /></Tag>;
    }
    case "paragraph":
      return (
        <p className="my-2.5 first:mt-0 last:mb-0">
          {block.lines.map((line, n) => (
            <span key={n}><MarkdownInline nodes={line} />{n < block.lines.length - 1 ? <br /> : null}</span>
          ))}
        </p>
      );
    case "list": return <List block={block} />;
    case "blockquote": return <blockquote className={BLOCKQUOTE}><Blocks blocks={block.blocks} /></blockquote>;
    case "code": return <ChatCodeBlock code={block.value} language={block.language || null} />;
    case "math": return <MathExpression value={block.value} displayMode />;
    case "hr": return <hr className="my-4 border-border/60" />;
    case "table": return <Table block={block} />;
  }
}

function Blocks({ blocks }: { blocks: MarkdownBlock[] }) {
  return <>{blocks.map((block, index) => <Block key={`${block.type}-${index}`} block={block} />)}</>;
}

/** Agent text as markdown, with Orca's look (root class `native-chat-markdown`). */
export function ChatMarkdown({ content, className, tone = "normal" }: ChatMarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const body = (
    <div className={cn("native-chat-markdown", className)}>
      <Blocks blocks={blocks} />
    </div>
  );
  // chat.css dims headings, bold, links and code under a faint-tone ancestor.
  return tone === "faint"
    ? <div data-native-chat-message-tone="faint" className="text-chat-foreground-faint">{body}</div>
    : body;
}
