/**
 * The SDK answer for the owner's answer to an approval or question row. The messages and the
 * question mapping follow Orca's journal/claude-structured-prompt-replies.ts (MIT).
 */
import type { JournalApproval, JournalQuestion, PromptAnswer, QuestionAnswer } from "../../../shared/bots/chat.ts";
import { DENIED_MESSAGE, allowForSession, allowOnce, denyResult, type PermissionRequest, type PermissionResult } from "./permission.ts";

export const PLAN_DENIED = "The user asked you to keep planning. Revise the plan and call ExitPlanMode again.";
export const QUESTIONS_DISMISSED = "The user dismissed these questions without answering. End your turn and wait for them.";
export const PLAN_DISMISSED = "The user dismissed the plan without approving or rejecting it. End your turn and wait for them.";
export const TOOL_DISMISSED = "The user dismissed this permission request. Do not retry it; end your turn and wait for them.";

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * AskUserQuestion's `answers`: the question's own text to the chosen label (one choice) or labels
 * (several). Free text replaces a single choice and joins several. A question with neither is skipped.
 */
function questionAnswers(input: Record<string, unknown>, body: JournalQuestion, given: readonly QuestionAnswer[]): Record<string, string | string[]> {
  const asked = Array.isArray(input.questions) ? input.questions : [];
  const entries = given.flatMap((answer): [string, string | string[]][] => {
    const question = body.questions.find((q) => q.id === answer.questionId);
    if (question === undefined) return [];
    // q<N> is the N-th entry of the tool's input, so its untrimmed text is the key Claude reads back
    const original = asRecord(asked[Number(question.id.slice(1)) - 1]).question;
    const key = typeof original === "string" ? original : question.question;
    const labels = answer.optionIds.flatMap((id) => question.options.filter((option) => option.id === id).map((option) => option.label));
    const other = answer.other?.trim() ? [answer.other.trim()] : [];
    if (question.multiSelect) {
      const all = [...labels, ...other];
      return all.length === 0 ? [] : [[key, all]];
    }
    const one = other[0] ?? labels[0];
    return one === undefined ? [] : [[key, one]];
  });
  return Object.fromEntries(entries);
}

/** Throws on an answer of the wrong kind; the host checks the answer fits the row before this. */
export function replyFor(request: PermissionRequest, body: JournalApproval | JournalQuestion, answer: PromptAnswer): PermissionResult {
  const plan = request.toolName === "ExitPlanMode";
  if (answer.kind === "dismiss") {
    return denyResult(request, body.kind === "question" ? QUESTIONS_DISMISSED : plan ? PLAN_DISMISSED : TOOL_DISMISSED);
  }
  if (answer.kind === "answers") {
    if (body.kind !== "question") throw new Error("answers fit a question only");
    return { behavior: "allow", updatedInput: { ...request.input, answers: questionAnswers(request.input, body, answer.answers) }, toolUseID: request.toolUseID };
  }
  if (body.kind === "question") throw new Error("a question takes answers");
  if (answer.optionId === "allow") return allowOnce(request);
  if (answer.optionId === "allowForSession") return allowForSession(request);
  return denyResult(request, plan ? PLAN_DENIED : DENIED_MESSAGE);
}

/** A push's one line: what is asked, never the tool's input (it can hold anything). */
export function promptPushBody(request: PermissionRequest): string {
  if (request.toolName === "AskUserQuestion") {
    const first = asRecord(Array.isArray(request.input.questions) ? request.input.questions[0] : undefined).question;
    return typeof first === "string" ? `Question: ${first.slice(0, 160)}` : "It has a question for you.";
  }
  if (request.toolName === "ExitPlanMode") return "Review a proposed plan.";
  return `Allow ${(request.displayName ?? request.toolName).slice(0, 80)}?`;
}
