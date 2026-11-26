// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/comment-markdown/comment-markdown-element-renderers.tsx (document anchor); adapted for TermWeave.
// The inline nodes of TermWeave's parser (src/lib/markdown.ts), drawn with Orca's classes. File paths,
// KaTeX and link rules follow TermWeave's own renderer (src/components/Markdown.tsx).
import katex from "katex";
import { useContext } from "react";

import { codeIsFilePath, OpenFileContext, splitFilePaths } from "../../../lib/filePaths.ts";
import { useT } from "../../../lib/i18n.ts";
import { safeMarkdownHref, type InlineNode } from "../../../lib/markdown.ts";
import { fileUriPath } from "../../../lib/terminalFileLinks.ts";
import { cn } from "../../cn.ts";

// Orca's document anchor without `break-all` (PORT-BRIEF 13); chat.css breaks a long address.
const LINK = "text-primary underline underline-offset-2 hover:text-primary/80";
// A file opens in TermWeave's viewer: a button that reads as the link or code it replaced.
const FILE = "inline cursor-pointer border-0 bg-transparent p-0 text-left [font:inherit] text-(--chat-link) underline decoration-dotted underline-offset-[0.25em] [overflow-wrap:anywhere] hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** KaTeX output: KaTeX escapes the text and rejects untrusted commands by default. */
export function MathExpression({ value, displayMode = false }: { value: string; displayMode?: boolean }) {
  try {
    const html = katex.renderToString(value, { displayMode, strict: "ignore" });
    return (
      <span
        className={displayMode ? "my-2.5 block max-w-full overflow-x-auto" : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <span>{displayMode ? `\\[${value}\\]` : `\\(${value}\\)`}</span>;
  }
}

function FileButton({ path, code, open, children }: { path: string; code: boolean; open: (path: string) => void; children?: React.ReactNode }) {
  const t = useT();
  return (
    <button type="button" className={cn(FILE, code && "no-underline")} title={t("Open {path}", { path })} onClick={() => open(path)}>
      {children ?? (code ? <code>{path}</code> : path)}
    </button>
  );
}

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  // The parser only makes http(s) and mailto links; checked again here so no other scheme is ever drawn.
  const safe = safeMarkdownHref(href);
  if (safe === null) return <span>{children}</span>;
  return <a href={safe} target="_blank" rel="noopener noreferrer" className={LINK}>{children}</a>;
}

function TextNode({ value, open }: { value: string; open: ((path: string) => void) | null }) {
  if (open === null) return <span>{value}</span>;
  return (
    <span>
      {splitFilePaths(value).map((part, n) => (typeof part === "string" ? part : <FileButton key={n} path={part.path} code={false} open={open} />))}
    </span>
  );
}

function CodeNode({ value, open, interactive }: { value: string; open: ((path: string) => void) | null; interactive: boolean }) {
  const file = fileUriPath(value);
  if (open !== null && file !== null) return <FileButton path={file} code open={open} />;
  // An address in backticks stays code to the eye, and opens.
  if (interactive && /^https?:\/\/\S+$/i.test(value)) return <Anchor href={value}><code>{value}</code></Anchor>;
  if (open !== null && codeIsFilePath(value)) return <FileButton path={value} code open={open} />;
  return <code>{value}</code>;
}

/** `interactive` is false inside a link or file label: nothing clickable nests in another. */
export function MarkdownInline({ nodes, interactive = true }: { nodes: InlineNode[]; interactive?: boolean }) {
  const context = useContext(OpenFileContext);
  const open = interactive ? context : null;
  return (
    <>
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`;
        switch (node.type) {
          case "text": return <TextNode key={key} value={node.value} open={open} />;
          case "code": return <CodeNode key={key} value={node.value} open={open} interactive={interactive} />;
          case "math": return <MathExpression key={key} value={node.value} />;
          case "strong": return <strong key={key}><MarkdownInline nodes={node.children} interactive={interactive} /></strong>;
          case "em": return <em key={key}><MarkdownInline nodes={node.children} interactive={interactive} /></em>;
          case "del": return <del key={key}><MarkdownInline nodes={node.children} interactive={interactive} /></del>;
          case "link": return <Anchor key={key} href={node.href}><MarkdownInline nodes={node.children} interactive={false} /></Anchor>;
          case "file": {
            const label = <MarkdownInline nodes={node.children} interactive={false} />;
            // Where nothing can open a file, the path shows after the label, as Codex's terminal does.
            return open !== null
              ? <FileButton key={key} path={node.path} code={false} open={open}>{label}</FileButton>
              : <span key={key}>{label} (<code>{node.path}</code>)</span>;
          }
        }
      })}
    </>
  );
}
