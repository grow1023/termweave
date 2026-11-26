// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/prompts/NativeChatInteractiveCard.tsx; adapted for TermWeave.
// The card that stands in the composer's slot while the agent's terminal shows a prompt: an approval or a question.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import type { ChatPrompt, PromptCardProps } from "../shared/index.ts";
import { ApprovalCard } from "./ApprovalCard.tsx";
import { QuestionCard } from "./QuestionCard.tsx";

function ApprovalPromptCard({ prompt, submitting, error, shouldFocus, onAnswer, onOpenTerminal }: PromptCardProps & { prompt: Extract<ChatPrompt, { kind: "approval" }> }) {
  const t = useT();
  const [chosen, setChosen] = useState<number | null>(null);
  const custom = prompt.source.custom_option_index;
  return (
    <ApprovalCard
      approval={prompt.approval}
      submitting={submitting}
      submittingIndex={submitting ? chosen : null}
      error={error}
      shouldFocus={shouldFocus}
      detailAs={prompt.source.kind === "plan" ? "markdown" : "code"}
      onOpenTerminal={onOpenTerminal}
      onChoose={(index) => {
        if (submitting) return;
        setChosen(index);
        onAnswer({ kind: "option", index });
      }}
      other={custom === null ? undefined : {
        placeholder: prompt.source.options[custom]?.label ?? t("Type your answer"),
        onSubmit: (text) => {
          if (!submitting) onAnswer({ kind: "text", text });
        },
      }}
    />
  );
}

/**
 * Answers go out as `ChatPromptAnswer`; the integrator turns them into `PromptAnswer` with `toPromptAnswer`
 * and owns the send, `submitting`, and the error (TermWeave's "The prompt changed — read it again" included).
 * Keyed by the prompt id, so a new prompt starts clean.
 */
export function ChatPromptCard(props: PromptCardProps) {
  const { prompt } = props;
  return prompt.kind === "approval"
    ? <ApprovalPromptCard key={prompt.id} {...props} prompt={prompt} />
    : <QuestionCard key={prompt.id} prompt={prompt} submitting={props.submitting} error={props.error} shouldFocus={props.shouldFocus} onAnswer={props.onAnswer} />;
}
