/**
 * Deliberately narrow: prose mentioning passwords must not become an input prompt.
 * `columns` is the width (or the widths) the rows may have been wrapped at: after the terminal
 * grows, a prompt wrapped at the old width keeps its old row break, and only the old width
 * shows that its first row reached the right edge.
 */
export function secretPrompt(screen: string, columns: number | readonly number[] = Infinity): string | null {
  const widths = typeof columns === "number" ? [columns] : columns;
  const lines = screen.split(/\r?\n/);
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  let line = lines.pop()?.trimEnd() ?? "";
  for (;;) {
    const candidate = line.trimStart();
    if (!candidate || candidate.length > 120 || /\?|y\s*\/\s*n/i.test(candidate)) return null;
    if (/^(?:\[sudo\] password for [^:]+|[^\s@]+@[^\s:]+['’]s password|password(?: for [^:]+)?|enter passphrase(?: for key ['’][^\r\n]+['’])?|enter pin(?: for [^:]+)?|(?:repeat|verify|confirm) password):$/i.test(candidate)) return candidate;
    // herdr's screen-diff stream does not preserve xterm's soft-wrap flags. Only
    // continue a row that reached the right edge (a final space can be trimmed).
    const previous = lines.pop()?.trimEnd();
    if (!previous) return null;
    const width = widths.find((cols) => previous.length >= cols - 1 && previous.length <= cols);
    if (width === undefined) return null;
    line = (previous.padEnd(width) + line).trimStart();
  }
}

/** How many widths before the current one a wrap check still tries (the client keeps the same). */
export const PREVIOUS_WIDTHS = 3;

/**
 * The widths a terminal had before it became `next` columns wide, newest first, after a resize
 * from `old`: at most `PREVIOUS_WIDTHS`, never `next` itself. `secretPrompt(text, [next, ...it])`
 * then still finds a prompt that wrapped before the resize.
 */
export function rememberWidth(previous: readonly number[], old: number, next: number): number[] {
  return [old, ...previous.filter((cols) => cols !== old)].filter((cols) => cols !== next).slice(0, PREVIOUS_WIDTHS);
}

/**
 * Loose on purpose, the opposite of `secretPrompt`: does the end of the screen look like it may
 * be asking for a password, a passphrase or a PIN? A plain input line does not store its draft
 * while it does. A false alarm only keeps a draft in memory; a miss would write a secret to disk.
 * The last three rows are joined, so a prompt wrapped at any width is seen.
 */
export function mayAskForSecret(screen: string): boolean {
  const rows = screen.split(/\r?\n/).map((row) => row.trim()).filter((row) => row.length > 0).slice(-3);
  for (let start = rows.length - 1; start >= 0; start--) {
    if (/(?:password|passphrase|\bpin)\b[^:\r\n]*:\s*$/i.test(rows.slice(start).join(""))) return true;
  }
  return false;
}

/** A secret is one line of literal keystrokes; never allow terminal controls. */
export function validSecret(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}
