// TermWeave's own mapping between its prompt types (shared/protocol.ts) and the chat contract shaped after
// stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/input/native-chat-interactive-prompt.ts
// and input/questions/native-chat-ask-types.ts. Pure, so `prompt-mapping.test.ts` round-trips it.
import type { InteractivePrompt, PromptAnswer } from "../../../../shared/protocol.ts";
import type { BotPaneAction } from "../../../../shared/bots/types.ts";
import type { Translate } from "../../../lib/i18n.ts";
import type { AskOption, AskPrompt, ChatApproval, ChatPrompt, ChatPromptAnswer } from "../shared/index.ts";

// Claude writes its own pick as "Redis (Recommended)"; the card shows a pill instead (Orca's option label).
const RECOMMENDED_SUFFIX = /\s*\((?:recommended)\)\s*$/i;

/** The source indices of the options a card shows as choices: all but the typed-answer row. */
export function choiceIndices(prompt: InteractivePrompt): number[] {
  return prompt.options.flatMap((_, index) => (index === prompt.custom_option_index ? [] : [index]));
}

function askOption(label: string, description: string | null): AskOption {
  const shown = label.replace(RECOMMENDED_SUFFIX, "");
  const recommended = shown.length > 0 && shown !== label;
  return {
    label: recommended ? shown : label,
    ...(description !== null && description.length > 0 ? { description } : {}),
    ...(recommended ? { recommended: true as const } : {}),
  };
}

/**
 * Decision: an approval or plan is an approval card; a multi-select is always a question card. A typed
 * answer in an approval (Claude's plan "Tell Claude what to change") stays on the approval card, which
 * then shows an answer field (ApprovalCard `other`); its row is not a button, as the server refuses it.
 */
export function toChatPrompt(prompt: InteractivePrompt): ChatPrompt {
  const approvalKind = (prompt.kind === "approval" || prompt.kind === "plan") && !prompt.multi_select;
  if (approvalKind) {
    const approval: ChatApproval = {
      title: prompt.title,
      ...(prompt.question.length > 0 && prompt.question !== prompt.title ? { description: prompt.question } : {}),
      ...(prompt.body !== null && prompt.body.length > 0 ? { detail: prompt.body } : {}),
      options: choiceIndices(prompt).map((index) => ({
        label: prompt.options[index]!.label,
        description: prompt.options[index]!.description,
        index,
      })),
    };
    return { kind: "approval", id: prompt.id, source: prompt, approval };
  }
  const question = prompt.question.length > 0 ? prompt.question : prompt.title;
  const ask: AskPrompt = {
    questions: [{
      question,
      ...(prompt.title.length > 0 && prompt.title !== question ? { header: prompt.title } : {}),
      multiSelect: prompt.multi_select,
      options: choiceIndices(prompt).map((index) => askOption(prompt.options[index]!.label, prompt.options[index]!.description)),
    }],
    otherIndex: prompt.custom_option_index,
    ...(prompt.steps ? { steps: prompt.steps.map((step) => ({ ...step })) } : {}),
  };
  return { kind: "question", id: prompt.id, source: prompt, ask };
}

/**
 * Index meaning: for an approval, `index` is `ChatApprovalOption.index` (already the source index);
 * for a question, it is the position in `ask.questions[0].options`, mapped back past the typed-answer row.
 * Decision: SPEC 5.3 lists two parameters; `PromptAnswer` needs the pane, so `paneId` is a third.
 */
export function toPromptAnswer(prompt: ChatPrompt, answer: ChatPromptAnswer, paneId: string): PromptAnswer {
  const base: PromptAnswer = {
    pane_id: paneId,
    prompt_id: prompt.source.id,
    ...(prompt.source.target_terminal_id !== undefined ? { expected_terminal_id: prompt.source.target_terminal_id } : {}),
  };
  const choices = choiceIndices(prompt.source);
  const toSource = (index: number): number => {
    if (prompt.kind === "approval") return index;
    const source = choices[index];
    if (source === undefined) throw new Error(`No option ${index + 1} in this prompt`);
    return source;
  };
  switch (answer.kind) {
    case "option": return { ...base, option_index: toSource(answer.index) };
    case "options": return { ...base, option_indices: [...answer.indices].map(toSource).sort((a, b) => a - b) };
    case "text": return { ...base, custom_text: answer.text };
  }
}

/** The index of each answer of a pane-action approval (`paneActionApproval`). */
export const PANE_ACTION_APPROVE = 0;
export const PANE_ACTION_DENY = 1;

/**
 * A TermWeave bot's pane action as an approval: worded from the action, never from the bot's words
 * (same wording as src/orca/bots/home/BotItemQuestionStep.tsx); the text to type shows as code.
 * Options are exactly Approve (index 0, the default) and Deny (index 1); the caller answers
 * `APPROVE`/`DENY` from shared/bots/types.ts.
 */
export function paneActionApproval(action: BotPaneAction, t: Translate): ChatApproval {
  const title = action.kind === "send"
    ? t("Type this into {where} and press Enter?", { where: action.where })
    : action.kind === "keys"
      ? t("Press {keys} in {where}?", { keys: action.keys.join(" "), where: action.where })
      : t("Close {where}?", { where: action.where });
  return {
    title,
    ...(action.kind === "send" ? { detail: action.text } : {}),
    options: [
      { label: t("Approve"), description: null, index: PANE_ACTION_APPROVE },
      { label: t("Deny"), description: null, index: PANE_ACTION_DENY },
    ],
  };
}
