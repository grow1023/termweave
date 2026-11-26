// The terminal an approval acts on, as the owner reads it. The server writes `where` as
// `"workspace" · title (paneId)` (server/bots/runtime.ts); the pane id is jargon on the card, so the card
// shows the name and keeps the id for a tooltip. Pure, so `pane-where.test.ts` covers it.

export interface PaneWhere {
  /** What the card shows: everything before the pane id, such as `"api" · zsh`. */
  name: string;
  /** The pane id from the parentheses, for a `title` tooltip; null when `where` has no id. */
  id: string | null;
}

// greedy name, so a name that itself holds parentheses keeps them; the id is the last "(…)" group
const WHERE = /^(.*\S)\s+\(([^()\s]+)\)$/s;

/** Splits the server's `where` into its name and pane id; a string of another shape is shown as it is. */
export function splitWhere(where: string): PaneWhere {
  const match = WHERE.exec(where);
  if (!match) return { name: where, id: null };
  return { name: match[1]!, id: match[2]! };
}

/**
 * The text around the first `name` in `text`, so the name can carry its own tooltip; null when `name`
 * is empty or not in `text` (the caller then shows `text` as it is).
 */
export function aroundName(text: string, name: string): [before: string, after: string] | null {
  if (name === "") return null;
  const at = text.indexOf(name);
  if (at < 0) return null;
  return [text.slice(0, at), text.slice(at + name.length)];
}
