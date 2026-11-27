/**
 * The project companion: one read-only chat per project that knows which terminal the owner is
 * viewing. Shared by the server (server/companion.ts) and the screen (src/components/Companion.tsx).
 */

/** A companion's id starts with this, so its chat routes are told from a bot's. */
export const COMPANION_PREFIX = "companion-";
export const isCompanionId = (value: string): boolean => value.startsWith(COMPANION_PREFIX);

/** What POST /api/companion/view answers. */
export interface CompanionView {
  /** the companion's id: its chat lives at /api/bots/<id>/chat like a session bot's */
  id: string;
  /** the project folder: the repository root of the viewed terminal's folder, or that folder */
  project: string;
  /** the folder's own name, for the window's title */
  name: string;
  /** the terminal the companion takes as "the one you are viewing" */
  pane: { pane_id: string; label: string; number: number | null };
}

/** The canned question behind the "Where am I?" strip. */
export const COMPANION_STATUS_ASK = "/status";

const CONTEXT_OPEN = "<termweave-context>";
const CONTEXT_CLOSE = "</termweave-context>";

/** A message as it goes to the companion: the server's context block, then the owner's words. */
export function withCompanionContext(context: string, text: string): string {
  // the block cannot be closed from inside: a closing tag in terminal text is defanged
  return `${CONTEXT_OPEN}\n${context.replaceAll(CONTEXT_CLOSE, "</termweave-context-quoted>")}\n${CONTEXT_CLOSE}\n${text}`;
}

/** The owner's own words of a sent message: the chat shows these, never the context block. */
export function stripCompanionContext(text: string): string {
  if (!text.startsWith(CONTEXT_OPEN)) return text;
  const end = text.indexOf(`${CONTEXT_CLOSE}\n`);
  return end < 0 ? text : text.slice(end + CONTEXT_CLOSE.length + 1);
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
];
const NAMED_SECRET = /(\b(?:authorization|bearer|token|api[_-]?key|secret|password|passwd)\b["']?\s*[:=]\s*["']?(?:bearer\s+)?)(?!\[masked\])[^\s"']{8,}/gi;

/** Terminal text with strings that look like credentials masked, before it goes to a model. */
export function maskSecrets(text: string): string {
  const shaped = SECRET_PATTERNS.reduce((masked, pattern) => masked.replace(pattern, "[masked]"), text);
  return shaped.replace(NAMED_SECRET, (_match, lead: string) => `${lead}[masked]`);
}
