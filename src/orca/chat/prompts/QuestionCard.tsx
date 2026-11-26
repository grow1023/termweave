// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/prompts/NativeChatQuestionCard.tsx; adapted for TermWeave.
// Decision: a TermWeave prompt holds one question (its server steps a form), and its answer is exactly one of
// an option, a set of options, or typed text (PromptAnswer). So an option pick and the typed answer exclude
// each other, Back/Skip and the × are left out, and Submit stays off until there is an answer.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { ChatMarkdown } from "../markdown/index.ts";
import type { ChatPrompt, ChatPromptAnswer } from "../shared/index.ts";
import { AnswerField, ConfirmButton, QuestionCardHeader, QuestionOption } from "./QuestionParts.tsx";
import { isImeKey, usePromptCardFocus } from "./use-prompt-card-focus.ts";
import { useQuestionKeys } from "./use-question-keys.ts";

// Orca's NATIVE_CHAT_QUESTION_AUTO_ADVANCE_MS: a single-select pick shows as chosen before it is sent.
const AUTO_SUBMIT_MS = 200;

type QuestionPrompt = Extract<ChatPrompt, { kind: "question" }>;

function useAutoSubmit(blocked: boolean) {
  const timer = useRef<number | undefined>(undefined);
  const cancel = (): void => window.clearTimeout(timer.current);
  useEffect(() => {
    if (blocked) window.clearTimeout(timer.current);
    return () => window.clearTimeout(timer.current);
  }, [blocked]);
  return {
    cancel,
    schedule: (step: () => void): void => {
      cancel();
      timer.current = window.setTimeout(step, AUTO_SUBMIT_MS);
    },
  };
}

/** Holds a sent answer until the next commit; after it, `submitting` decides, so a failed send can retry. */
function useSendLatch(submitting: boolean, onAnswer: (answer: ChatPromptAnswer) => void) {
  const latch = useRef(false);
  const blocked = useRef(submitting);
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    latch.current = false;
  }, [attempt]);
  useLayoutEffect(() => {
    blocked.current = submitting;
  }, [submitting]);
  return (answer: ChatPromptAnswer): void => {
    if (latch.current || blocked.current) return;
    latch.current = true;
    setAttempt((value) => value + 1);
    onAnswer(answer);
  };
}

/** The card's picks and typed text, and how they become one answer. */
function useQuestionAnswer(args: { multi: boolean; submitting: boolean; onAnswer: (answer: ChatPromptAnswer) => void }) {
  const { multi, submitting } = args;
  const [selected, setSelected] = useState<number[]>([]);
  const [typed, setTyped] = useState("");
  const [typedChosen, setTypedChosen] = useState(false);
  const auto = useAutoSubmit(submitting);
  const send = useSendLatch(submitting, args.onAnswer);

  const typedAnswer = typedChosen && typed.trim().length > 0;
  const answered = selected.length > 0 || typedAnswer;
  const answerOf = (picked: number[], useTyped: boolean): ChatPromptAnswer | null => {
    if (useTyped && typed.trim().length > 0) return { kind: "text", text: typed.trim() };
    if (picked.length === 0) return null;
    return multi ? { kind: "options", indices: picked } : { kind: "option", index: picked[0]! };
  };
  const confirm = (): void => {
    auto.cancel();
    const answer = submitting ? null : answerOf(selected, typedChosen);
    if (answer !== null) send(answer);
  };
  const pick = (index: number, via: "pointer" | "digit" | "enter"): void => {
    if (submitting) return;
    if (selected.includes(index) && !multi && via === "enter") return confirm();
    const next = multi
      ? (selected.includes(index) ? selected.filter((n) => n !== index) : [...selected, index].sort((a, b) => a - b))
      : (selected.includes(index) ? [] : [index]);
    setSelected(next);
    setTypedChosen(false);
    auto.cancel();
    if (!multi && next.length === 1) auto.schedule(() => send({ kind: "option", index }));
  };
  const setOther = (value: string): void => {
    auto.cancel();
    setTyped(value);
    if (value.trim().length > 0) {
      setTypedChosen(true);
      setSelected([]);
    }
  };
  const chooseTyped = (): void => {
    auto.cancel();
    if (typed.trim().length > 0) {
      setTypedChosen(true);
      setSelected([]);
    }
  };
  return { selected, typed, typedAnswer, answered, confirm, pick, setOther, chooseTyped };
}

export function QuestionCard({ prompt, submitting, error, shouldFocus, onAnswer }: {
  prompt: QuestionPrompt;
  submitting: boolean;
  error: string | null;
  shouldFocus: boolean;
  onAnswer: (answer: ChatPromptAnswer) => void;
}) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const q = prompt.ask.questions[0];
  const options = q?.options ?? [];
  const multi = q?.multiSelect ?? false;
  const answer = useQuestionAnswer({ multi, submitting, onAnswer });
  const { selected, typed, typedAnswer, answered, confirm, pick, setOther, chooseTyped } = answer;
  usePromptCardFocus(cardRef, shouldFocus, prompt.id);
  useQuestionKeys(cardRef, shouldFocus && !submitting, options.length, (index) => pick(index, "digit"));

  const source = prompt.source;
  const otherIndex = prompt.ask.otherIndex;
  const placeholder = (otherIndex !== null && options.length === 0 ? source.options[otherIndex]?.label : undefined) ?? t("Type your answer");
  return (
    <div
      ref={cardRef}
      data-native-chat-prompt-card-focus={shouldFocus || undefined}
      data-native-chat-question-card
      data-native-chat-question-options={options.length}
      role="group"
      aria-label={q?.question ?? source.title}
      aria-busy={submitting}
      tabIndex={-1}
      className="flex min-h-0 shrink flex-col bg-chat-pane outline-none"
      onKeyDown={(event) => {
        const modified = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat;
        if (event.key !== "Enter" || event.target !== event.currentTarget || event.defaultPrevented || isImeKey(event.nativeEvent) || modified) return;
        event.preventDefault();
        if (answered) confirm();
      }}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-(--chat-content-max-width) flex-col px-3 pt-2 pb-4 sm:px-4">
        <div className="native-chat-question-card-surface relative z-[1] flex min-h-0 flex-col overflow-hidden rounded-xl border border-primary/28 bg-chat-canvas bg-[linear-gradient(var(--color-chat-composer-surface),var(--color-chat-composer-surface))] shadow-sm">
          <QuestionCardHeader steps={prompt.ask.steps} title={q?.header} />
          <div className="native-chat-question-card-body scrollbar-sleek flex min-h-0 shrink flex-col">
            <div className="native-chat-question-card-question min-h-[1lh] max-h-[calc(4lh+var(--spacing)*3)] shrink overflow-y-auto px-3.5 pt-3 text-[length:calc(var(--text-sm)*15/13)] leading-snug font-semibold text-foreground scrollbar-sleek">
              <ChatMarkdown content={q?.question ?? source.title} className="break-words [&_p]:my-0 [&_p+p]:mt-2" />
            </div>
            <QuestionContext source={source} />
            {options.length > 0 ? (
              <div className="native-chat-question-card-options min-h-[calc(var(--spacing)*12)] shrink-[100] overflow-y-auto px-3.5 pt-2.5 pb-1 scrollbar-sleek">
                <div className="flex flex-col gap-1.5">
                  {options.map((option, index) => (
                    <QuestionOption
                      key={`${index}:${option.label}`}
                      badge={String(index + 1)}
                      option={option}
                      selected={selected.includes(index)}
                      disabled={submitting}
                      onSelect={() => pick(index, "pointer")}
                      onEnter={() => pick(index, "enter")}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {otherIndex !== null ? (
              <AnswerField
                value={typed}
                chosen={typedAnswer}
                disabled={submitting}
                takesFocus={options.length === 0}
                placeholder={placeholder}
                onChange={setOther}
                onPointerChoose={chooseTyped}
                onEnter={confirm}
              />
            ) : null}
          </div>
          {error !== null ? <p role="alert" className="break-words px-3.5 pt-2 text-xs text-destructive">{error}</p> : null}
          <div className="native-chat-question-card-footer relative flex shrink-0 items-center gap-2 px-3.5 pt-3 pb-3.5">
            <span className="flex-1" />
            <ConfirmButton
              label={submitting ? t("Sending…") : t("Submit")}
              answered={answered}
              enterHint={answered && !submitting && !multi}
              disabled={submitting || !answered}
              onConfirm={confirm}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** What TermWeave's prompt adds around the question: Codex's queue note and the screen's body text. */
function QuestionContext({ source }: { source: QuestionPrompt["source"] }) {
  const t = useT();
  const hint = source.queued === "open"
    ? t("Codex keeps working meanwhile. Answer here; the question holds the terminal's input until it is answered or closed.")
    : source.queued === "collapsed"
      ? t("Codex keeps working meanwhile. Answer here; the message box still talks to Codex.")
      : null;
  if (hint === null && !source.body) return null;
  return (
    <div className="px-3.5 pt-2 text-xs text-muted-foreground">
      {hint !== null ? <p className="break-words">{hint}</p> : null}
      {source.body ? (
        <pre className="scrollbar-sleek mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-chat-code-surface px-2.5 py-2 font-mono text-chat-code leading-snug text-chat-foreground">{source.body}</pre>
      ) : null}
    </div>
  );
}
