import type {
  JournalApproval, JournalQuestion, PromptAnswer, PromptOption, PromptQuestion, PromptRequest, PromptResolution,
} from "../../../../shared/bots/chat.ts";
import { clip, FIELD_MAX_BYTES, TOOL_OUTPUT_MAX_BYTES } from "../journal.ts";
import { list, obj, pretty, str } from "./frames.ts";

export const PENDING: PromptResolution = { state: "pending", answer: null, resolvedBy: null, resolvedAt: null };

/** Prompt rows are keyed by the SDK request id, so a repeat of the same prompt revises one row. */
export const promptItemId = (promptKey: string): string => `prompt:${promptKey}`;

const TOOL_OPTIONS: PromptOption[] = [
  { id: "allow", label: "Allow", intent: "allow_once" },
  { id: "allowForSession", label: "Allow for this session", intent: "allow_always" },
  { id: "deny", label: "Deny", intent: "reject_once" },
];
const PLAN_OPTIONS: PromptOption[] = [
  { id: "allow", label: "Approve plan", intent: "allow_once" },
  { id: "deny", label: "Keep planning", intent: "reject_once" },
];

const field = (value: string | undefined): string | undefined => value === undefined ? undefined : clip(value, FIELD_MAX_BYTES);

/** Option ids say which question and which choice, escaped so a `:` in either cannot confuse them. */
export const optionId = (questionId: string, choice: number): string =>
  `${encodeURIComponent(questionId)}:${encodeURIComponent(`choice-${choice}`)}`;

/** AskUserQuestion's `questions`, or null when the input does not hold any well-formed one. */
function questionsOf(input: Record<string, unknown>): PromptQuestion[] | null {
  const questions = list(input.questions).flatMap((value, at): PromptQuestion[] => {
    const entry = obj(value);
    const text = str(entry.question);
    if (text === undefined || text.trim().length === 0) return [];
    const id = `q${at + 1}`;
    const options = list(entry.options).flatMap((option, k): PromptOption[] => {
      const label = str(obj(option).label);
      const description = field(str(obj(option).description));
      return label === undefined ? [] : [{ id: optionId(id, k + 1), label: clip(label, FIELD_MAX_BYTES), ...(description ? { description } : {}) }];
    });
    const header = field(str(entry.header));
    return [{ id, question: clip(text, FIELD_MAX_BYTES), ...(header ? { header } : {}), multiSelect: entry.multiSelect === true, options }];
  });
  return questions.length > 0 ? questions : null;
}

export function promptBody(p: PromptRequest): JournalApproval | JournalQuestion {
  const callId = p.toolUseId === undefined ? {} : { callId: p.toolUseId };
  if (p.toolName === "AskUserQuestion") {
    const questions = questionsOf(p.input);
    if (questions !== null) {
      return { kind: "question", promptKey: p.promptKey, ...callId, question: questions[0]?.question ?? "", questions, resolution: PENDING };
    }
  }
  const plan = p.toolName === "ExitPlanMode" ? str(p.input.plan) : undefined;
  const optional = {
    displayName: field(p.displayName), description: field(p.description),
    decisionReason: field(p.decisionReason), blockedPath: field(p.blockedPath),
  };
  return {
    kind: "approval", promptKey: p.promptKey, ...callId,
    title: plan !== undefined ? "Review proposed plan" : clip(p.title ?? `Allow ${p.displayName ?? p.toolName}?`, FIELD_MAX_BYTES),
    toolName: clip(p.toolName, FIELD_MAX_BYTES),
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
    ...(plan !== undefined ? { plan: clip(plan, TOOL_OUTPUT_MAX_BYTES) } : {}),
    detail: plan !== undefined ? null : clip(pretty(p.input), TOOL_OUTPUT_MAX_BYTES),
    options: plan !== undefined ? PLAN_OPTIONS : TOOL_OPTIONS,
    resolution: PENDING,
  };
}

/** Whether `answer` fits the row: a known option, or answers to known questions with known choices. */
export function answerFits(body: JournalApproval | JournalQuestion, answer: PromptAnswer): boolean {
  if (answer.kind === "dismiss") return true;
  if (body.kind === "approval") return answer.kind === "option" && body.options.some((option) => option.id === answer.optionId);
  if (answer.kind !== "answers") return false;
  return answer.answers.every((given) => {
    const question = body.questions.find((q) => q.id === given.questionId);
    if (question === undefined) return false;
    if (!question.multiSelect && given.optionIds.length > 1) return false;
    return given.optionIds.every((id) => question.options.some((option) => option.id === id));
  });
}

/** The answer as stored: free text is data like any other and is bounded. */
export function storedAnswer(answer: PromptAnswer): PromptAnswer {
  if (answer.kind !== "answers") return answer;
  return {
    kind: "answers",
    answers: answer.answers.map((given) => ({
      questionId: given.questionId, optionIds: [...given.optionIds],
      ...(given.other !== undefined ? { other: clip(given.other, FIELD_MAX_BYTES) } : {}),
    })),
  };
}
