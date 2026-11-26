// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/markdown/code/code-fence-language-label.ts; adapted for TermWeave.
// Decision: Orca reads labels from shiki's language list; TermWeave has no shiki, so a short table of the
// fences agents write covers the common names, and any other tag shows as written.
const LABELS: Readonly<Record<string, string>> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsonc: "JSON with Comments",
  jsx: "JSX",
  kotlin: "Kotlin",
  kt: "Kotlin",
  markdown: "Markdown",
  md: "Markdown",
  php: "PHP",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  scss: "SCSS",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

/** A known fence tag's display name; any other tag as written. */
export function codeFenceLanguageLabel(tag: string): string {
  return LABELS[tag.trim().toLowerCase()] ?? tag;
}
