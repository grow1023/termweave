// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/prompts/NativeChatQuestionOption.tsx,
// NativeChatQuestionAnswerField.tsx, NativeChatQuestionConfirmButton.tsx and NativeChatQuestionCardHeader.tsx; adapted for TermWeave.
import { Check, MessageCircleQuestionMark, Pencil } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import type { AskOption, AskStep } from "../shared/index.ts";
import { isImeKey } from "./use-prompt-card-focus.ts";

const LINE_BREAKS = /[\r\n\u2028\u2029]/g;

export function QuestionOption({ badge, option, selected, disabled, onSelect, onEnter }: {
  badge: string;
  option: AskOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  /** Enter on the row: the card picks it, or confirms when it is the chosen single-select row. */
  onEnter: () => void;
}) {
  const t = useT();
  return (
    // Focus is an outline outside the tile and picked is a ring inside it, so a focused row never reads as picked.
    <div
      className={cn(
        "rounded-[10px] outline-offset-2 outline-foreground/45 transition-colors has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-solid",
        selected ? "bg-accent text-accent-foreground ring-[1.5px] ring-inset ring-foreground/45" : "bg-foreground/5 text-foreground has-[>button:hover]:bg-foreground/8",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || isImeKey(event.nativeEvent)) return;
          event.preventDefault();
          if (!event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) onEnter();
        }}
        aria-pressed={selected}
        className="flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left focus-visible:outline-none disabled:pointer-events-none pointer-coarse:min-h-11"
      >
        <span className={cn("flex size-5.5 shrink-0 items-center justify-center rounded-md text-xs font-semibold", selected ? "bg-primary text-primary-foreground" : "bg-chat-composer-surface ring-1 ring-inset ring-question-option-border")}>
          {selected ? <Check className="size-3.5" strokeWidth={3} /> : badge}
        </span>
        <span className="min-w-0">
          <span className="block break-words text-sm font-medium">
            <span>{option.label}</span>
            {option.recommended ? (
              <span data-native-chat-question-recommended className="ml-1.5 inline-block rounded-full bg-status-success/16 px-1.5 align-[1px] text-2xs leading-4 font-semibold whitespace-nowrap text-status-success">
                {t("Recommended")}
              </span>
            ) : null}
          </span>
          {option.description ? (
            <span className="mt-px block whitespace-pre-wrap break-words text-[length:calc(var(--text-sm)*13/14)] leading-snug text-muted-foreground">{option.description}</span>
          ) : null}
        </span>
      </button>
    </div>
  );
}

/** The typed answer, filled like the option tiles; one line at rest, two while focused; Enter confirms. */
export function AnswerField({ value, chosen, disabled, takesFocus, placeholder, onChange, onPointerChoose, onEnter }: {
  value: string;
  chosen: boolean;
  disabled: boolean;
  /** The card has no options, so opening it focuses this field. */
  takesFocus: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onPointerChoose: () => void;
  onEnter: () => void;
}) {
  const t = useT();
  return (
    <div className="mx-3.5 mt-2 flex shrink-0 items-center gap-2.5 rounded-[10px] bg-foreground/5 px-3 py-2 outline-offset-2 outline-foreground/45 has-[textarea:focus-visible]:outline-[1.5px] has-[textarea:focus-visible]:outline-solid pointer-coarse:min-h-11">
      <span aria-hidden className={cn("flex size-5.5 shrink-0 items-center justify-center rounded-md", chosen ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
        {chosen ? <Check className="size-3.5" strokeWidth={3} /> : <Pencil className="size-3.5" />}
      </span>
      <textarea
        rows={1}
        aria-label={t("Answer")}
        data-native-chat-answer-field
        data-native-chat-prompt-card-focus-target={takesFocus || undefined}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onFocus={(event) => {
          const field = event.currentTarget;
          requestAnimationFrame(() => field.scrollIntoView?.({ block: "nearest" }));
        }}
        // Enter sends, so a line break becomes a space.
        onChange={(event) => onChange(event.currentTarget.value.replace(LINE_BREAKS, " "))}
        onClick={onPointerChoose}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || isImeKey(event.nativeEvent)) return;
          event.preventDefault();
          // A held Enter would answer each following prompt in turn.
          if (!event.repeat) onEnter();
        }}
        className={cn(
          "scrollbar-sleek max-h-[6lh] min-h-[1lh] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground focus:min-h-[2lh] disabled:cursor-default disabled:opacity-50",
          chosen || !value ? "text-foreground" : "text-muted-foreground",
        )}
      />
    </div>
  );
}

/** Outlined until there is an answer, then a filled Submit. */
export function ConfirmButton({ label, answered, enterHint, disabled, onConfirm }: { label: string; answered: boolean; enterHint: boolean; disabled: boolean; onConfirm: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onConfirm}
      className={cn(
        "inline-flex h-8 min-w-23 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3.5 text-[length:calc(var(--chat-ui-size,var(--text-sm))*13/14)] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/45 disabled:cursor-default disabled:opacity-50 pointer-coarse:h-11",
        answered ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-question-option-border text-foreground hover:bg-foreground/5",
      )}
    >
      {label}
      {enterHint ? <span aria-hidden className="ml-1.5 text-2xs font-medium opacity-70">↵</span> : null}
    </button>
  );
}

/**
 * The card's band. Decision: TermWeave's server steps a form (omo) itself, so `steps` only show where the
 * card is ("Database · 2 of 3", a check when answered); there are no step buttons and no × (no dismiss call).
 */
export function QuestionCardHeader({ steps, title }: { steps: AskStep[] | undefined; title: string | undefined }) {
  const t = useT();
  const at = steps ? steps.findIndex((step) => step.current) : -1;
  const current = steps && at !== -1 ? steps[at] : undefined;
  return (
    <div className="flex min-h-9 shrink-0 items-center gap-1.5 bg-primary/9 py-1 pr-1.5 pl-3.5 text-xs font-semibold text-foreground">
      <MessageCircleQuestionMark aria-hidden className="size-3.5 shrink-0 text-primary" />
      {steps && current ? (
        <>
          <span className="flex min-w-0 items-baseline gap-1">
            <span className="min-w-0 truncate">{current.label}</span>
            <span className="shrink-0 font-medium whitespace-nowrap text-muted-foreground">
              {"· "}
              {t("{value0} of {value1}", { value0: at + 1, value1: steps.length })}
            </span>
          </span>
          {current.answered ? <Check aria-label={t("Answered")} className="size-3 shrink-0 text-status-success" strokeWidth={3} /> : null}
        </>
      ) : (
        <span className="min-w-0 truncate">{title ?? t("Question")}</span>
      )}
      <span className="flex-1" />
    </div>
  );
}
