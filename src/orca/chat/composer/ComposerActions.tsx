// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/composer/controls/NativeChatComposerActions.tsx; adapted for TermWeave.
import type { MouseEvent, ReactNode } from "react";
import { ArrowUp, ListEnd, Plus, Square } from "lucide-react";

import { Button } from "../../ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.tsx";
import { useT } from "../../../lib/i18n.ts";

/** The round primary action: send a message, or stop the agent's turn. */
export type ComposerPrimary =
  | { kind: "send"; disabled: boolean; onSend: () => void; blockedReason?: string | null; /** the message waits in the queue (the agent works) */ queues?: boolean }
  | { kind: "stop"; disabled: boolean; onStop: () => void };

export interface ComposerActionsProps {
  /** null: no attach control at all (a chat that takes no files). */
  attach: { disabled: boolean; onAttach: () => void } | null;
  /** TermWeave's `MicButton`, mounted as it is (its press and release logic stays in VoiceInput.tsx). */
  voice?: ReactNode;
  /** `ContextRing`, `ModelChip`: read-only readouts left of the primary action. */
  readouts?: ReactNode;
  /** Shown while the agent works: a send goes to the queue. */
  queue?: { disabled: boolean; onQueue: () => void } | null;
  /** null: no primary action (queue mode while the agent is not working, as TermWeave does). */
  primary: ComposerPrimary | null;
  /** While the agent works: its own smaller control left of the primary, so a habitual tap on the round
   *  button sends (queues) a follow-up and never stops the turn. */
  stop?: { disabled: boolean; onStop: () => void } | null;
  /** The ordinary composer's words (`ComposerFrameParts.labels`), so both composers name an action the same. */
  labels: ComposerLabels;
}

/** Stop's visible word, and the hold button's label, tooltip and accessible name. */
export interface ComposerLabels { stop: string; hold: string; holdTitle: string; holdAria: string }

/** A press keeps focus where it was (Orca's NativeChatComposerPrimaryButton): the phone keyboard stays up. */
function keepFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

function WithTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Orca's + button (NativeChatAttachButton.tsx). The name stays TermWeave's "Attach files". */
export function AttachButton({ disabled, onAttach }: { disabled: boolean; onAttach: () => void }) {
  const t = useT();
  return (
    <WithTooltip label={t("Attach files")}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Attach files")} disabled={disabled}
        onMouseDown={keepFocus} onClick={onAttach} className="pointer-coarse:size-11">
        <Plus className="size-4" />
      </Button>
    </WithTooltip>
  );
}

/**
 * TermWeave's hold control in Orca's look; Orca has no such button (its Cmd+Enter preview uses ListEnd).
 * "Queue" read as automatic delivery; a held message is sent only by its own Send now.
 */
export function QueueButton({ disabled, onQueue, labels }: { disabled: boolean; onQueue: () => void; labels: ComposerLabels }) {
  return (
    <WithTooltip label={labels.holdTitle}>
      <Button type="button" variant="ghost" size="xs" aria-label={labels.holdAria} disabled={disabled}
        onMouseDown={keepFocus} onClick={onQueue} className="pointer-coarse:min-h-11 pointer-coarse:px-3">
        <ListEnd className="size-3.5" aria-hidden />
        {labels.hold}
      </Button>
    </WithTooltip>
  );
}

/**
 * Orca's round primary button (NativeChatComposerPrimaryButton.tsx). Names stay TermWeave's: "Send message"
 * and "Stop agent". Orca's `size-10` on a coarse pointer is 40px; TermWeave needs 44px, so `size-11`.
 */
export function PrimaryButton({ primary, labels }: { primary: ComposerPrimary; labels: ComposerLabels }) {
  const t = useT();
  const stops = primary.kind === "stop";
  const queues = primary.kind === "send" && primary.queues === true;
  // held, it takes the name of the ordinary composer's hold control (its tests and its meaning)
  const label = stops ? t("Stop agent") : queues ? labels.holdAria : t("Send message");
  const reason = primary.kind === "send" ? primary.blockedReason ?? null : null;
  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    // Ignore a double-click's second press: one press, one message (Stop is no longer under it, see StopButton).
    if (event.detail > 1) return;
    if (primary.kind === "stop") primary.onStop();
    else primary.onSend();
  };
  const button = (
    <Button type="button" variant={stops ? "secondary" : "default"} size="icon-round"
      data-native-chat-critical-action={stops ? "stop" : undefined}
      aria-label={label} title={reason ?? (queues ? labels.holdTitle : label)} disabled={primary.disabled}
      onMouseDown={keepFocus} onClick={onClick} className="pointer-coarse:size-11">
      {stops ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
    </Button>
  );
  if (reason === null) return button;
  // A disabled button gets no pointer events, so the wrapper carries the hover.
  return (
    <WithTooltip label={reason}>
      <span className="inline-flex">{button}</span>
    </WithTooltip>
  );
}

/**
 * TermWeave's Stop while the agent works: a word, not only a square, and smaller than the round
 * button, so it reads as a different action in a different place. The accessible name stays
 * "Stop agent"; it begins with the visible word.
 */
export function StopButton({ disabled, onStop, label }: { disabled: boolean; onStop: () => void; label: string }) {
  const t = useT();
  return (
    <Button type="button" variant="secondary" size="xs" data-native-chat-critical-action="stop"
      aria-label={t("Stop agent")} title={t("Stop agent")} disabled={disabled}
      onMouseDown={keepFocus} onClick={onStop} className="pointer-coarse:min-h-11 pointer-coarse:px-3">
      <Square className="size-3 fill-current" aria-hidden />
      {label}
    </Button>
  );
}

/**
 * Orca's action row (NativeChatComposerToolbar.tsx markup): left group, right group, primary.
 * Decision: no overflow measuring and no "More chat controls" menu; TermWeave's row holds at most
 * attach, voice, two readouts, queue and the primary, which fit at 320px.
 */
export function ComposerActions({ attach, voice, readouts, queue, primary, stop, labels }: ComposerActionsProps) {
  return (
    <div className="group/toolbar flex w-full items-center justify-between gap-2 text-chat-foreground-faint">
      {attach ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <AttachButton disabled={attach.disabled} onAttach={attach.onAttach} />
        </div>
      ) : null}
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        {readouts}
        {voice ? <div className="inline-flex w-max shrink-0">{voice}</div> : null}
        {queue ? <div className="inline-flex shrink-0"><QueueButton disabled={queue.disabled} onQueue={queue.onQueue} labels={labels} /></div> : null}
        {stop ? <div className="inline-flex shrink-0 pr-1"><StopButton disabled={stop.disabled} onStop={stop.onStop} label={labels.stop} /></div> : null}
        {primary ? <div className="inline-flex shrink-0"><PrimaryButton primary={primary} labels={labels} /></div> : null}
      </div>
    </div>
  );
}

/**
 * The model name, read-only (SPEC 5.5: TermWeave changes the model with slash commands). The look of
 * Orca's model chip trigger (NativeChatSessionOptionPickers.tsx) without its menu.
 */
export function ModelChip({ model, effort }: { model: string | null; effort?: string | null }) {
  const t = useT();
  if (!model && !effort) return null;
  const text = [model, effort].filter((part): part is string => Boolean(part)).join(" · ");
  return (
    <span className="flex h-7 min-w-0 items-center rounded-md px-1.5 text-xs text-chat-foreground-faint" aria-label={t("Model and reasoning")} title={text}>
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}
