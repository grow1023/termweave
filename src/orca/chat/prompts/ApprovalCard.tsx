// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/prompts/NativeChatApprovalCard.tsx,
// native-chat-approval-card-frame.ts and NativeChatApprovalOption.tsx; adapted for TermWeave.
// One look for every approval: a Claude tool permission (Allow / Allow for this session / Deny) and a bot's
// pane action (Approve / Deny, text to type as code) differ only in their data. The first option is the default.
// Left out: Orca's quiet transcript-row variant and dock placement, the URL sign-in subject, countdowns,
// decision reasons, blocked paths and the worker line (no TermWeave data), and the × (no cancel call).
import { ShieldQuestion, SquareTerminal } from "lucide-react";
import { useId, useRef, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { ChatCodeBlock, ChatMarkdown } from "../markdown/index.ts";
import { aroundName, type PaneWhere } from "../../bots/homepanel/pane-where.ts";
import type { ChatApproval } from "../shared/index.ts";
import { AnswerField } from "./QuestionParts.tsx";
import { PROMPT_CARD_FOCUS_TARGET_SELECTOR, usePromptCardFocus } from "./use-prompt-card-focus.ts";

export interface ApprovalCardProps {
  /** `where`: the terminal a bot's pane action acts on; its name in the title carries the pane id as a tooltip. */
  approval: ChatApproval & { where?: PaneWhere };
  submitting: boolean;
  /** The `index` of the option being sent, while `submitting`: its button shows a spinner. */
  submittingIndex: number | null;
  error: string | null;
  shouldFocus: boolean;
  /** Called with the chosen option's `index`. */
  onChoose: (index: number) => void;
  /** Shown when there are no options: only the terminal can answer. */
  onOpenTerminal?: () => void;
  /** composer: the card stands in the composer's slot; stacked: one of several above it. */
  placement?: "composer" | "stacked";
  /** Addition to SPEC 5.3: `markdown` draws the detail as text (a plan), `code` (default) as a code block. */
  detailAs?: "code" | "markdown";
  /** Addition to SPEC 5.3: a typed answer the approval also takes (Claude's plan "Tell Claude what to change"). */
  other?: { placeholder: string; onSubmit: (text: string) => void };
}

function frameClasses(stacked: boolean): { outer: string; gutter: string; card: string; actions: string } {
  const fill = !stacked && "h-full min-h-0 max-h-full";
  return {
    outer: stacked ? "bg-chat-pane" : "min-h-0 shrink overflow-hidden bg-chat-pane",
    gutter: cn("flex w-full mx-auto max-w-(--chat-content-max-width) px-3 pt-2 pb-1 sm:px-4", fill),
    // stacked: `clip`, not `hidden`, so the card is no scroll box and its action row can stick to the dock's edge
    card: cn(
      "flex min-h-0 w-full flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring gap-2 rounded-lg border border-input bg-card px-4 py-3 shadow-xs",
      stacked ? "overflow-clip" : "overflow-hidden",
    ),
    // stacked (the bot dock): the Home panel's order, Deny then Approve at the right end, 12px apart; the
    // row sticks to the bottom of the dock's scroll box, so a tall card never hides its answers (chat.css)
    actions: stacked
      ? "native-chat-approval-actions-stacked sticky bottom-0 z-[1] -mx-4 -mb-3 flex shrink-0 flex-wrap justify-end gap-3 bg-card px-4 pt-2 pb-3"
      : "flex shrink-0 flex-wrap gap-2",
  };
}

// Stacked (the bot dock), Approve acts on the owner's terminal. Inside a `group/settle` wrapper whose
// `data-settled` is false (the card has just appeared or moved), it is outlined like Deny, then fills
// (BOT-22). Both styles keep a 1px border, so the switch moves nothing. Without the wrapper it is filled.
const PRIMARY = "border border-primary bg-primary text-primary-foreground hover:bg-primary/90";
const QUIET = "border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground";
const PRIMARY_UNSETTLED =
  "group-data-[settled=false]/settle:border-border group-data-[settled=false]/settle:bg-background group-data-[settled=false]/settle:text-foreground group-data-[settled=false]/settle:hover:bg-accent group-data-[settled=false]/settle:hover:text-accent-foreground";

function ApprovalOption({ label, primary, describedBy, disabled, sending, onClick }: {
  label: string;
  primary: boolean;
  describedBy?: string;
  disabled: boolean;
  sending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-native-chat-prompt-card-focus-target={primary || undefined}
      aria-describedby={primary ? describedBy : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11",
        "px-4 py-1.5 text-sm font-semibold",
        primary ? cn(PRIMARY, PRIMARY_UNSETTLED) : QUIET,
      )}
    >
      {sending ? (
        <span className="inline-flex items-center gap-1.5">
          <LoadingSpinner className="size-3.5" />
          {label}
        </span>
      ) : label}
    </button>
  );
}

/** The title with the terminal's name carrying the pane id as its tooltip (BOT-28). */
function ApprovalTitle({ title, where }: { title: string; where?: PaneWhere }) {
  const parts = where?.id ? aroundName(title, where.name) : null;
  if (!where || !parts) return title;
  return <>{parts[0]}<span title={where.id ?? undefined} className="underline decoration-dotted decoration-foreground/40 underline-offset-2">{where.name}</span>{parts[1]}</>;
}

function ApprovalContext({ approval, contentId, detailAs }: { approval: ChatApproval; contentId: string; detailAs: "code" | "markdown" }) {
  if (!approval.description && !approval.detail) return null;
  return (
    <div
      id={contentId}
      data-native-chat-approval-content="true"
      tabIndex={0}
      className="min-h-0 max-h-72 shrink overflow-auto scrollbar-sleek space-y-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {approval.description ? <p className="whitespace-pre-wrap break-words">{approval.description}</p> : null}
      {approval.detail ? (
        detailAs === "markdown"
          ? <div data-native-chat-approval-plan="true"><ChatMarkdown content={approval.detail} className="text-sm text-chat-foreground" /></div>
          : <div data-native-chat-approval-detail="true" className="[&>[data-native-chat-code-block]]:my-0"><ChatCodeBlock code={approval.detail} language={null} /></div>
      ) : null}
    </div>
  );
}

function OtherAnswer({ other, disabled }: { other: NonNullable<ApprovalCardProps["other"]>; disabled: boolean }) {
  const [text, setText] = useState("");
  const submit = (): void => {
    if (!disabled && text.trim().length > 0) other.onSubmit(text.trim());
  };
  return (
    <div className="-mx-3.5 [&>div]:mt-0">
      <AnswerField value={text} chosen={text.trim().length > 0} disabled={disabled} takesFocus={false} placeholder={other.placeholder} onChange={setText} onPointerChoose={() => undefined} onEnter={submit} />
    </div>
  );
}

export function ApprovalCard({ approval, submitting, submittingIndex, error, shouldFocus, onChoose, onOpenTerminal, placement = "composer", detailAs = "code", other }: ApprovalCardProps) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const stacked = placement !== "composer";
  const hasContext = Boolean(approval.description || approval.detail);
  const frame = frameClasses(stacked);
  usePromptCardFocus(cardRef, shouldFocus && !stacked, approval.title);
  return (
    <div className={frame.outer}>
      <div className={frame.gutter}>
        <div className="flex w-full">
          <div ref={cardRef} data-native-chat-approval-card="true" role="group" aria-label={approval.title} aria-busy={submitting} tabIndex={-1} className={frame.card}
            onKeyDown={(event) => {
              // Held on the card, the first Tab reaches the default answer.
              if (event.key !== "Tab" || event.shiftKey || event.target !== event.currentTarget) return;
              const answer = event.currentTarget.querySelector<HTMLElement>(PROMPT_CARD_FOCUS_TARGET_SELECTOR);
              if (!answer) return;
              event.preventDefault();
              answer.focus();
            }}
          >
            <div className="flex shrink-0 items-start gap-2">
              {/* stacked is the bot dock, where every approval acts on a terminal */}
              {stacked
                ? <SquareTerminal aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                : <ShieldQuestion aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-sm font-semibold text-foreground"><ApprovalTitle title={approval.title} where={approval.where} /></p>
              </div>
            </div>
            <ApprovalContext approval={approval} contentId={contentId} detailAs={detailAs} />
            {other ? <OtherAnswer other={other} disabled={submitting} /> : null}
            {error !== null ? <p role="alert" className="break-words text-xs text-destructive">{error}</p> : null}
            <div data-native-chat-approval-actions="true" className={frame.actions}>
              {/* The first option is the default; stacked, it is drawn last (rightmost), as in the Home panel. */}
              {(stacked ? [...approval.options].reverse() : approval.options).map((option) => (
                <ApprovalOption
                  key={`${option.index}-${option.label}`}
                  label={option.label}
                  primary={option === approval.options[0]}
                  describedBy={hasContext ? contentId : undefined}
                  disabled={submitting}
                  sending={submitting && submittingIndex === option.index}
                  onClick={() => onChoose(option.index)}
                />
              ))}
              {approval.options.length === 0 && onOpenTerminal ? (
                <button type="button" onClick={onOpenTerminal} className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11">
                  {t("Answer in terminal")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
