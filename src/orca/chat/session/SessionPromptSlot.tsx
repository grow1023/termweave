// The card for a session bot's waiting prompt, in the composer's slot as OrcaChat's PromptSlot draws it
// (after stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc., native-chat/prompts/NativeChatInteractiveCard.tsx).
// The cards are Orca's (src/orca/chat/prompts); the answers go to the journal's prompt route.
import { useEffect, useMemo, useState } from "react";

import type { JournalApproval, JournalQuestion, QuestionAnswer } from "../../../../shared/bots/chat.ts";
import { useT } from "../../../lib/i18n.ts";
import { ApprovalCard } from "../prompts/index.ts";
import { QuestionCard } from "../prompts/QuestionCard.tsx";
import type { ChatPromptAnswer } from "../shared/index.ts";
import { approvalOptionId, questionAnswer, sessionApproval, sessionQuestionStep } from "./session-prompts.ts";
import type { SessionFeed, SessionPromptRow } from "./use-session-feed.ts";

interface SlotProps {
  row: SessionPromptRow;
  readOnly: boolean;
  answer: SessionFeed["answer"];
}

/** One send at a time, its error kept on the card until the next try. */
function useSubmit(answer: SessionFeed["answer"], itemId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [itemId]);
  const run = (send: Parameters<SessionFeed["answer"]>[1], after?: () => void): void => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    void answer(itemId, send)
      .then(() => after?.())
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setSubmitting(false));
  };
  return { submitting, error, run };
}

function ApprovalSlot({ row, body, readOnly, answer }: SlotProps & { body: JournalApproval }) {
  const t = useT();
  const approval = useMemo(() => sessionApproval(body, readOnly, t), [body, readOnly, t]);
  const { submitting, error, run } = useSubmit(answer, row.itemId);
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <ApprovalCard approval={approval} submitting={submitting} submittingIndex={submitting ? chosen : null} error={error} shouldFocus={false}
      detailAs={body.plan !== undefined ? "markdown" : "code"}
      onChoose={(index) => {
        setChosen(index);
        run({ kind: "option", optionId: approvalOptionId(body, index) });
      }} />
  );
}

/**
 * Claude may ask several questions in one prompt, and the server takes their answers together: the
 * card asks them one by one and sends once the last one is answered.
 */
function QuestionSlot({ row, body, answer }: SlotProps & { body: JournalQuestion }) {
  const t = useT();
  const [given, setGiven] = useState<QuestionAnswer[]>([]);
  useEffect(() => { setGiven([]); }, [row.itemId]);
  const step = Math.min(given.length, body.questions.length - 1);
  const prompt = useMemo(() => sessionQuestionStep(row.itemId, body, step, t), [row.itemId, body, step, t]);
  const { submitting, error, run } = useSubmit(answer, row.itemId);
  if (prompt === null) return null;
  const onAnswer = (choice: ChatPromptAnswer): void => {
    const all = [...given.slice(0, step), questionAnswer(body, step, choice)];
    if (all.length < body.questions.length) { setGiven(all); return; }
    // a refused send starts the questions over, so a stale answer is never sent twice
    run({ kind: "answers", answers: all }, () => setGiven([]));
  };
  return <QuestionCard key={prompt.id} prompt={prompt} submitting={submitting} error={error} shouldFocus={false} onAnswer={onAnswer} />;
}

/** A watching device sees what is asked, with no buttons. */
function WatchedQuestion({ body }: { body: JournalQuestion }) {
  const t = useT();
  const approval = useMemo(() => ({ title: body.question, ...(body.questions.length > 1 ? { description: t("{n} questions", { n: body.questions.length }) } : {}), options: [] }), [body, t]);
  return <ApprovalCard approval={approval} submitting={false} submittingIndex={null} error={null} shouldFocus={false} onChoose={() => undefined} />;
}

/** The oldest waiting prompt in the composer's slot; the rest wait their turn behind it. */
export function SessionPromptSlot({ prompts, readOnly, answer }: { prompts: SessionPromptRow[]; readOnly: boolean; answer: SessionFeed["answer"] }) {
  const row = prompts[0];
  if (row === undefined) return null;
  const body = row.body;
  return (
    // shrinks (its card scrolls inside) rather than push the composer out, as OrcaChat's slot does
    <div className="flex min-h-0 shrink flex-col" data-orca-chat-prompt="" data-session-prompt={row.itemId}>
      {body.kind === "approval"
        ? <ApprovalSlot key={row.itemId} row={row} body={body} readOnly={readOnly} answer={answer} />
        : readOnly
          ? <WatchedQuestion body={body} />
          : <QuestionSlot key={row.itemId} row={row} body={body} readOnly={readOnly} answer={answer} />}
    </div>
  );
}
