// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/items/BotItemQuestionStep.tsx and
// src/renderer/src/components/native-chat/prompts/NativeChatQuestionCard.tsx; adapted for TermWeave.
// An item that needs the owner, as Orca's question card: the question, one tile per answer, a typed answer,
// and Submit. An approval (the bot asks to act in a terminal) has no tiles: only Approve and Deny.
import { Check, MessageCircleQuestionMark, Pencil } from "lucide-react";
import { useId, useState } from "react";

import { APPROVE, DENY } from "../../../../shared/bots/types.ts";
import { type Translate, useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import type { BotItem, BotPaneAction } from "../data.ts";
import { botsApi } from "../data.ts";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

/** The question of an approval, from what the bot wants to do; never from the bot's own words. */
function approvalQuestion(action: BotPaneAction, t: Translate): string {
  switch (action.kind) {
    case "send": return t("Type this into {where} and press Enter?", { where: action.where });
    case "keys": return t("Press {keys} in {where}?", { keys: action.keys.join(" "), where: action.where });
    case "close": return t("Close {where}?", { where: action.where });
  }
}

const BUTTON =
  "inline-flex h-8 min-w-23 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3.5 text-[length:calc(var(--chat-ui-size,var(--text-sm))*13/14)] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/45 disabled:cursor-default disabled:opacity-50 pointer-coarse:h-11";
const FILLED = "border-primary bg-primary text-primary-foreground hover:bg-primary/90";
const OUTLINED = "border-question-option-border text-foreground hover:bg-foreground/5";

function Option({ index, label, selected, disabled, describedBy, onSelect }: { index: number; label: string; selected: boolean; disabled: boolean; describedBy: string; onSelect: () => void }) {
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
        // it sends at once, so it is not a toggle: no aria-pressed, and the description says so
        aria-describedby={describedBy}
        className="flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60 pointer-coarse:min-h-11"
      >
        <span className={cn("flex size-5.5 shrink-0 items-center justify-center rounded-md text-xs font-semibold", selected ? "bg-primary text-primary-foreground" : "bg-chat-composer-surface ring-1 ring-inset ring-question-option-border")}>
          {selected ? <Check className="size-3.5" strokeWidth={3} /> : String(index + 1)}
        </span>
        <span className="min-w-0 block break-words text-sm font-medium">{label}</span>
      </button>
    </div>
  );
}

/** The typed answer, filled like the option tiles; one line, Enter sends. */
function AnswerField({ value, disabled, onChange, onEnter }: { value: string; disabled: boolean; onChange: (value: string) => void; onEnter: () => void }) {
  const t = useT();
  const chosen = value.trim().length > 0;
  return (
    <div className="mx-3.5 mt-2 flex shrink-0 items-center gap-2.5 rounded-[10px] bg-foreground/5 px-3 py-2 outline-offset-2 outline-foreground/45 has-[textarea:focus-visible]:outline-[1.5px] has-[textarea:focus-visible]:outline-solid pointer-coarse:min-h-11">
      <span aria-hidden className={cn("flex size-5.5 shrink-0 items-center justify-center rounded-md", chosen ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
        {chosen ? <Check className="size-3.5" strokeWidth={3} /> : <Pencil className="size-3.5" />}
      </span>
      <textarea
        rows={1}
        aria-label={t("Answer")}
        placeholder={t("Type an answer…")}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[\r\n\u2028\u2029]/g, " "))}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!event.repeat) onEnter();
        }}
        className="scrollbar-sleek max-h-[6lh] min-h-[1lh] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-sm text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground focus:min-h-[2lh] disabled:cursor-default disabled:opacity-50"
      />
    </div>
  );
}

export function BotItemQuestionStep({ botId, item, readOnly, onOpenItem, canAnswer }: {
  botId: string;
  item: BotItem;
  readOnly: boolean;
  /** Lists name the item above the question and open it from there; the item's own view does not. */
  onOpenItem?: () => void;
  /** A list whose cards move asks here first; false drops the answer (a card that just moved under the pointer). */
  canAnswer?: () => boolean;
}) {
  const t = useT();
  const act = useBotAction();
  const sendsId = useId();
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const action = item.action ?? null;
  const question = action ? approvalQuestion(action, t) : (item.ask ?? item.title);
  const disabled = readOnly || act.busy;
  const answer = (text: string): void => {
    // Dropped without a sign: the card has not moved for the owner's eye yet, and the next click goes through.
    if (canAnswer && !canAnswer()) return;
    setSent(text);
    void act.run(() => botsApi.answerItem(botId, item.n, text)).then((ok) => {
      setSent(null);
      if (ok) setTyped("");
    });
  };
  const submitTyped = (): void => {
    if (typed.trim() && !disabled) answer(typed.trim());
  };
  return (
    <div
      role="group"
      aria-label={question}
      aria-busy={act.busy}
      data-bot-item-question=""
      className="relative flex min-h-0 w-full min-w-0 shrink flex-col overflow-hidden rounded-xl border border-primary/28 bg-chat-canvas bg-[linear-gradient(var(--color-chat-composer-surface),var(--color-chat-composer-surface))] shadow-sm"
    >
      <div className="flex min-h-9 shrink-0 items-center gap-1.5 bg-primary/9 py-1 pr-1.5 pl-3.5 text-xs font-semibold text-foreground">
        <MessageCircleQuestionMark aria-hidden className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate">{action ? t("Approval") : t("Question")}</span>
      </div>
      {onOpenItem ? (
        <button type="button" title={item.title} onClick={onOpenItem} className="mx-3.5 mt-2 flex min-w-0 items-baseline gap-1.5 rounded-sm text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pointer-coarse:min-h-11 pointer-coarse:items-center">
          <span className="shrink-0 tabular-nums">{`#${item.n}`}</span>
          <span className="min-w-0 truncate">{item.title}</span>
        </button>
      ) : null}
      <div className="whitespace-pre-wrap px-3.5 pt-3 text-[length:calc(var(--text-sm)*15/13)] leading-snug font-semibold text-foreground [overflow-wrap:anywhere]">{question}</div>
      {action?.kind === "send" ? (
        <pre className="scrollbar-sleek mx-3.5 mt-2 max-h-56 overflow-auto whitespace-pre rounded-md bg-chat-code-surface px-2.5 py-2 font-mono text-chat-code leading-snug text-chat-foreground">{action.text}</pre>
      ) : null}
      {action ? null : (
        <>
          {item.options.length > 0 ? (
            <div className="flex flex-col gap-1.5 px-3.5 pt-2.5 pb-1">
              <span id={sendsId} className="sr-only">{t("Sends this answer")}</span>
              {item.options.map((option, index) => (
                <Option key={`${index}:${option}`} index={index} label={option} selected={sent === option} disabled={disabled} describedBy={sendsId} onSelect={() => answer(option)} />
              ))}
            </div>
          ) : null}
          <AnswerField value={typed} disabled={disabled} onChange={setTyped} onEnter={submitTyped} />
        </>
      )}
      <ActionError message={act.error} className="px-3.5 pt-2" />
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3.5 pt-3 pb-3.5">
        <span className="flex-1" />
        {action ? (
          <>
            <button type="button" disabled={disabled} className={cn(BUTTON, OUTLINED)} onClick={() => answer(DENY)}>{t("Deny")}</button>
            <button type="button" disabled={disabled} className={cn(BUTTON, FILLED)} onClick={() => answer(APPROVE)}>{t("Approve")}</button>
          </>
        ) : (
          <button type="button" disabled={disabled || typed.trim().length === 0} className={cn(BUTTON, typed.trim() ? FILLED : OUTLINED)} onClick={submitTyped}>
            {act.busy && sent !== null ? t("Sending…") : t("Submit")}
          </button>
        )}
      </div>
    </div>
  );
}
