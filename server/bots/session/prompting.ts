/**
 * Permission prompts of a live session: held until the owner answers (no time limit, spec 9.4),
 * pushed to the phone at once and once more later, and settled exactly once.
 */
import type { PromptAnswer, PromptRequest } from "../../../shared/bots/chat.ts";
import { BotError } from "../runtime.ts";
import type { BotJournal } from "./journal.ts";
import { withPrompt, withoutPrompt, type Live } from "./live.ts";
import type { PermissionRequest, PermissionResult } from "./permission.ts";
import { promptPushBody, replyFor } from "./replies.ts";
import type { Translator, TranslatorClock } from "./translate.ts";

export interface PromptContext {
  clock: TranslatorClock;
  repushMs: number;
  /** a web push with this tag; failures are the push service's to log */
  push(body: string, tag: string): void;
  /** the prompt set changed: status and idle clock follow */
  changed(): void;
  /** the host's own card for this request (host-types.ts PromptGate) */
  card?: PromptRequest["card"];
}

/** The SDK request as the journal records it; absent fields stay absent. */
function promptRequest(request: PermissionRequest, card: PromptRequest["card"]): PromptRequest {
  const optional = {
    title: request.title, displayName: request.displayName, description: request.description,
    decisionReason: request.decisionReason, blockedPath: request.blockedPath,
  };
  return {
    promptKey: request.requestId, toolName: request.toolName, input: request.input, toolUseId: request.toolUseID,
    ...(card ? { card } : {}),
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
  };
}

/** Writes the prompt's row, pushes, and waits for `answerPrompt`, an abort, or the session's end. */
export function holdPrompt(live: Live, translator: Translator, request: PermissionRequest, ctx: PromptContext): Promise<PermissionResult | null> {
  const key = request.requestId;
  const tag = `bot-${live.botId}-prompt-${key}`;
  const body = promptPushBody(request);
  return new Promise((resolve) => {
    const repush = ctx.clock.setTimer(() => ctx.push(body, tag), ctx.repushMs);
    let settled = false;
    const settle = (result: PermissionResult | null): void => {
      if (settled) return;
      settled = true;
      ctx.clock.clearTimer(repush);
      live.prompts = withoutPrompt(live.prompts, key);
      resolve(result);
      ctx.changed();
    };
    live.prompts = withPrompt(live.prompts, key, { request, settle });
    request.signal.addEventListener("abort", () => {
      if (settled) return;
      translator.promptCancelled(key, ctx.clock.now());
      settle(null);
    }, { once: true });
    translator.prompt(promptRequest(request, ctx.card), ctx.clock.now());
    ctx.changed();
    ctx.push(body, tag);
  });
}

/** Settles a waiting prompt once. Every check runs before the settle with no await between them. */
export function answerPrompt(journal: BotJournal, live: Live | undefined, botId: string, itemId: string, answer: PromptAnswer, by: string, at: number): void {
  const chat = journal.chat(botId);
  const row = chat === null ? null : journal.row(chat.sessionId, itemId);
  if (row === null || (row.body.kind !== "approval" && row.body.kind !== "question")) throw new BotError("unknown_prompt", "this chat has no such prompt");
  if (row.body.resolution.state !== "pending") throw new BotError("prompt_already_answered", "this prompt was already answered");
  const waiting = live?.prompts.get(row.body.promptKey);
  const translator = live?.translator ?? null;
  if (waiting === undefined || translator === null) throw new BotError("prompt_gone", "the session that asked this has ended; ask the bot again");
  let reply: PermissionResult;
  try { reply = replyFor(waiting.request, row.body, answer); } catch {
    throw new BotError("invalid_answer", "that answer does not fit this prompt");
  }
  if (translator.promptAnswered(row.body.promptKey, answer, by, at) === null) throw new BotError("invalid_answer", "that answer does not fit this prompt");
  waiting.settle(reply);
}
