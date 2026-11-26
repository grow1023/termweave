// TermWeave's own mapping between a session bot's prompt rows (shared/bots/chat.ts) and the prompt
// cards' shapes, shaped after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
// src/shared/native-chat/input/native-chat-interactive-prompt.ts. Pure, so session-prompts.test.ts covers it.
import type { JournalApproval, JournalQuestion, PromptOption, QuestionAnswer } from "../../../../shared/bots/chat.ts";
import type { InteractivePrompt } from "../../../../shared/protocol.ts";
import type { Translate } from "../../../lib/i18n.ts";
import type { AskPrompt, ChatApproval, ChatPrompt, ChatPromptAnswer } from "../shared/index.ts";

/** The server's option ids (server/bots/session/translate/prompts.ts) in the owner's words. */
function optionWord(option: PromptOption, plan: boolean, t: Translate): string {
  switch (option.id) {
    case "allow": return plan ? t("Approve plan") : t("Allow");
    case "allowForSession": return t("Allow for this session");
    case "deny": return plan ? t("Keep planning") : t("Deny");
    default: return option.label;
  }
}

/** The approval card for a permission row; with `readOnly` it has no options, so no buttons draw. */
export function sessionApproval(body: JournalApproval, readOnly: boolean, t: Translate): ChatApproval {
  const plan = body.plan !== undefined;
  const tool = body.displayName ?? body.toolName;
  const description = [body.description, body.decisionReason, body.blockedPath].filter((part): part is string => Boolean(part)).join("\n");
  const detail = plan ? body.plan : body.detail;
  return {
    title: plan ? t("Review proposed plan") : t("Allow {tool}?", { tool }),
    ...(description.length > 0 ? { description } : {}),
    ...(detail ? { detail } : {}),
    options: readOnly ? [] : body.options.map((option, index) => ({ label: optionWord(option, plan, t), description: option.description ?? null, index })),
  };
}

/** The server's answer for the approval option at `index`: its `optionId`. */
export function approvalOptionId(body: JournalApproval, index: number): string {
  const option = body.options[index];
  if (option === undefined) throw new Error(`No option ${index + 1} in this prompt`);
  return option.id;
}

/**
 * Step `step` of a question row as the question card's prompt. The card asks one question at a time;
 * Claude's AskUserQuestion always takes a typed answer, so the card always shows the answer field.
 * Decision: the card reads its options from `ask`; `source` is a stand-in that gives it the typed-answer
 * row and a fresh id per step (the card's own state starts clean on each step).
 */
export function sessionQuestionStep(itemId: string, body: JournalQuestion, step: number, t: Translate): Extract<ChatPrompt, { kind: "question" }> | null {
  const question = body.questions[step];
  if (question === undefined) return null;
  const typedIndex = question.options.length;
  const source: InteractivePrompt = {
    id: `${itemId}#${question.id}`, agent: "claude", kind: "question",
    title: question.header ?? "", question: question.question, body: null,
    options: [...question.options.map((option) => ({ label: option.label, description: option.description ?? null })), { label: t("Type your answer"), description: null }],
    multi_select: question.multiSelect, custom_option_index: typedIndex,
  };
  const ask: AskPrompt = {
    questions: [{
      question: question.question, ...(question.header ? { header: question.header } : {}), multiSelect: question.multiSelect,
      options: question.options.map((option) => ({ label: option.label, ...(option.description ? { description: option.description } : {}) })),
    }],
    otherIndex: typedIndex,
    ...(body.questions.length > 1
      ? { steps: body.questions.map((each, at) => ({ label: each.header ?? t("Question {n}", { n: at + 1 }), answered: at < step, current: at === step })) }
      : {}),
  };
  return { kind: "question", id: source.id, source, ask };
}

/** The card's answer to step `step` as the server's answer to that question. */
export function questionAnswer(body: JournalQuestion, step: number, answer: ChatPromptAnswer): QuestionAnswer {
  const question = body.questions[step];
  if (question === undefined) throw new Error(`No question ${step + 1} in this prompt`);
  const idOf = (index: number): string => {
    const option = question.options[index];
    if (option === undefined) throw new Error(`No option ${index + 1} in this question`);
    return option.id;
  };
  switch (answer.kind) {
    case "option": return { questionId: question.id, optionIds: [idOf(answer.index)] };
    case "options": return { questionId: question.id, optionIds: answer.indices.map(idOf) };
    case "text": return { questionId: question.id, optionIds: [], other: answer.text };
  }
}
