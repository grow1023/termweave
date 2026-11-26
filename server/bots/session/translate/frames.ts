/** Narrowing for SDK frames: they arrive as untyped JSON, and a malformed one must not throw. */

export type Obj = Record<string, unknown>;

export const obj = (value: unknown): Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
export const str = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
export const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/** The text of a tool result's content: a string, or text blocks (images and others are named). */
export function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  return list(content).map((part) => {
    const block = obj(part);
    if (block.type === "text") return str(block.text) ?? "";
    if (block.type === "image") return "[image]";
    return "";
  }).join("");
}

/** A user message's text blocks joined, and the images it carried (by type only). */
export function userContent(content: unknown): { text: string; images: { mediaType: string }[] } {
  if (typeof content === "string") return { text: content, images: [] };
  const blocks = list(content).map(obj);
  const text = blocks.filter((block) => block.type === "text").map((block) => str(block.text) ?? "").join("\n");
  const images = blocks.filter((block) => block.type === "image")
    .map((block) => ({ mediaType: str(obj(block.source).media_type) ?? "image" }));
  return { text, images };
}

export const hasToolResults = (content: unknown): boolean => list(content).some((block) => obj(block).type === "tool_result");

/** Claude Code's own user-seat lines (an interrupt marker, a slash command's envelope): not a send. */
export function isBookkeeping(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("[Request interrupted") || trimmed.startsWith("<command-") || trimmed.startsWith("<local-command");
}

const USAGE_LIMIT = /usage limit|hit your limit|limit reached|out of extra usage/i;

/** Plain words for an assistant frame's `error` field (the SDK's SDKAssistantMessageError). */
export function apiErrorText(kind: string, said: string): { text: string; code: string } {
  if (kind === "rate_limit" || USAGE_LIMIT.test(said)) {
    return { text: "Claude's usage limit is reached. The bot can answer again when the limit resets.", code: "usage_limit" };
  }
  const words: Record<string, string> = {
    authentication_failed: "Claude could not sign in. Sign in to Claude Code again on this computer.",
    billing_error: "Claude refused the request because of a billing problem on the account.",
    invalid_request: "Claude refused the request as invalid.",
    server_error: "Claude's service had an error. Try again in a moment.",
  };
  return { text: words[kind] ?? "Claude's service returned an error.", code: "api_error" };
}

/** Plain words for a `result` frame that failed, from its subtype and result text. */
export function resultErrorText(subtype: string, said: string): { text: string; code: string } {
  if (USAGE_LIMIT.test(said)) return apiErrorText("rate_limit", said);
  if (subtype === "error_max_turns") return { text: "The turn stopped at its limit of steps.", code: "max_turns" };
  if (subtype === "error_max_budget_usd") return { text: "The turn stopped at its spending limit.", code: "max_budget" };
  if (subtype === "error_during_execution") return { text: "The turn stopped with an error.", code: "execution_error" };
  return { text: "Claude ended the turn with an error.", code: "result_error" };
}

/** The one-line summary a collapsed tool chip shows (the same fields the transcript chat reads). */
export function toolSummary(name: string, input: Obj): string {
  const skill = name === "Skill" ? str(input.skill) : undefined;
  const first = skill ?? input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.description ?? input.url;
  return typeof first === "string" ? first.slice(0, 120) : name;
}

export function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "[input could not be shown]";
  }
}
