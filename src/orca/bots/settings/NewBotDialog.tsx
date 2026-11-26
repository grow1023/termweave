// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/NewBotDialog.tsx, NewBotPictureButton.tsx, NewBotPurposeField.tsx, BotRunsOnPicker.tsx and BotCreateButton.tsx; adapted for TermWeave.
import { CornerDownLeft } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent } from "react";

import { randomBotAvatar } from "../../../../shared/bots/avatar.ts";
import { AgentMark } from "../../../components/AgentMark.tsx";
import { useT } from "../../../lib/i18n.ts";
import { isMacPlatform } from "../../../lib/shortcuts.ts";
import { cn } from "../../cn.ts";
import { Button } from "../../ui/button.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog.tsx";
import { Input } from "../../ui/input.tsx";
import { Label } from "../../ui/label.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { botErrorText, botsApi } from "../data.ts";
import type { Bot, BotAgent } from "../data.ts";
import { PictureButton } from "./BotPicturePicker.tsx";
import type { PictureChoice } from "./BotPicturePicker.tsx";

const NAME_MAX_LENGTH = 60;
const PURPOSE_MAX_LENGTH = 2000;
const COUNTER_FROM = 160;
// The name beside the picture: large, left-aligned, no box.
const BARE_HEADING_CLASS = "w-full min-w-0 resize-none truncate rounded-sm border-0 bg-transparent p-0 text-xl leading-[26px] font-semibold tracking-[-0.018em] outline-none placeholder:text-muted-foreground focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-ring/60";

function AgentChoice({ agent, onPick, disabled }: { agent: BotAgent; onPick: (agent: BotAgent) => void; disabled: boolean }) {
  const t = useT();
  const hintId = useId();
  const label = (id: BotAgent): string => (id === "claude" ? "Claude Code" : "Codex");
  return (
    <>
    <div role="radiogroup" aria-label={t("Runs on")} aria-describedby={hintId} className="grid grid-cols-2 gap-2">
      {(["claude", "codex"] as const).map((id) => (
        <Button
          key={id}
          type="button"
          role="radio"
          aria-checked={agent === id}
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onPick(id)}
          className={cn("min-w-0 justify-start pointer-coarse:min-h-11", agent === id && "border-ring ring-[3px] ring-ring/30")}
        >
          <AgentMark agent={id} size={14} />
          <span className="min-w-0 truncate">{label(id)}</span>
        </Button>
      ))}
    </div>
    {/* what the choice means: a Claude bot runs as a chat session (server/bots/session), a Codex bot in a terminal */}
    <p id={hintId} className="text-xs leading-4 text-muted-foreground">{agent === "claude" ? t("Chat only, no terminal") : t("Runs in a terminal")}</p>
    </>
  );
}

function PurposeField({ value, tooLong, onChange, disabled }: { value: string; tooLong: boolean; onChange: (value: string) => void; disabled: boolean }) {
  const t = useT();
  const counterId = useId();
  const fieldId = useId();
  return (
    <div className="space-y-1">
      {/* a visible name that stays once the placeholder is typed over (BOT-32); the text becomes SOUL.md,
          which settings calls Soul: one name for one thing */}
      <Label variant="settings" htmlFor={fieldId}>{t("Soul")}</Label>
      <div className="rounded-md border border-input px-3 py-2 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:bg-input/30 dark:has-aria-invalid:ring-destructive/40">
        <textarea
          className="scrollbar-sleek block h-[5lh] w-full resize-none border-0 bg-transparent p-0 text-sm leading-5 outline-none placeholder:text-muted-foreground"
          rows={5}
          id={fieldId}
          autoComplete="off"
          aria-invalid={tooLong || undefined}
          aria-describedby={tooLong ? counterId : undefined}
          value={value}
          disabled={disabled}
          maxLength={PURPOSE_MAX_LENGTH}
          placeholder={t("Who it is and what it does")}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {value.length >= COUNTER_FROM ? (
        <p id={counterId} className="text-right text-xs tabular-nums text-muted-foreground">
          {value.length}/{PURPOSE_MAX_LENGTH}
        </p>
      ) : null}
    </div>
  );
}

function CreateButton({ busy }: { busy: boolean }) {
  const t = useT();
  return (
    <Button type="submit" size="sm" disabled={busy} className="pointer-coarse:min-h-11">
      {busy ? <LoadingSpinner className="size-4" /> : null}
      <span className="text-xs">{t("Create")}</span>
      {/* a touch screen has no ⌘ or Ctrl to press */}
      <span aria-hidden className="ml-1 inline-flex items-center pointer-coarse:hidden gap-0.5 rounded border border-white/20 px-1.5 py-0.5 text-[10px] leading-none font-medium text-current/80">
        <span>{isMacPlatform() ? "⌘" : "Ctrl"}</span>
        <CornerDownLeft className="size-3" />
      </span>
    </Button>
  );
}

function NewBotForm({ onClose, onCreated }: { onClose: () => void; onCreated: (bot: Bot) => void }) {
  const t = useT();
  const nameErrorId = useId();
  const nameId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [agent, setAgent] = useState<BotAgent>("claude");
  const [repo, setRepo] = useState("");
  const [picture, setPicture] = useState<PictureChoice>(() => ({ avatar: randomBotAvatar() }));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const trimmedName = name.trim();
  const nameInvalid = (submitted && !trimmedName) || error !== null;
  // the pictures are all on parchment: the band behind the top of the dialog takes that color
  const band = "#d2a86a";
  const bandStyle: CSSProperties & { "--new-bot-band": string } = { "--new-bot-band": band };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (creating) return;
    if (!trimmedName) {
      setSubmitted(true);
      nameRef.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // a Claude bot runs as a chat session with no terminal; the session runtime is Claude only, so Codex stays in a pane
      const made = await botsApi.create({ name: trimmedName, agent, purpose: purpose.trim(), repo: repo.trim() || null, ...(agent === "claude" ? { runtime: "session" as const } : {}) });
      const differs = made.avatar !== picture.avatar;
      // The bot exists now; a picture that did not save can be set again in its settings.
      const bot = differs ? await botsApi.update(made.id, { avatar: picture.avatar }).catch(() => made) : made;
      onClose();
      onCreated(bot);
    } catch (failure) {
      setError(botErrorText(failure, t));
      nameRef.current?.focus();
    } finally {
      setCreating(false);
    }
  };
  const submitKey = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <>
      <div
        aria-hidden
        style={bandStyle}
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[84px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--new-bot-band)_46%,transparent),transparent)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--new-bot-band)_26%,transparent),transparent)]"
      />
      <DialogHeader>
        <DialogTitle>{t("New bot")}</DialogTitle>
      </DialogHeader>
      <form ref={formRef} className="flex min-h-0 flex-col gap-4 outline-none" onSubmit={(event) => void submit(event)} onKeyDown={submitKey}>
        <div className="-mx-5 -mt-1 min-h-0 space-y-4 overflow-x-hidden overflow-y-auto px-5 pt-1 scrollbar-sleek">
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-3">
              <PictureButton value={picture} onPick={setPicture} variant="new" disabled={creating} label={t("Change picture")} />
              <div className="min-w-0 flex-1">
                {/* visible over the field, as Soul and Runs on are, so the meaning stays after typing (BOT-32) */}
                <Label variant="settings" htmlFor={nameId} className="mb-1">{t("Name")}</Label>
                <input
                  ref={nameRef}
                  id={nameId}
                  autoFocus
                  className={cn(BARE_HEADING_CLASS, "aria-invalid:px-2 aria-invalid:ring-1 aria-invalid:ring-destructive aria-invalid:outline-destructive")}
                  aria-invalid={nameInvalid || undefined}
                  aria-describedby={nameInvalid ? nameErrorId : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={name}
                  disabled={creating}
                  maxLength={NAME_MAX_LENGTH}
                  placeholder={t("Name")}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                />
                {nameInvalid ? (
                  <p id={nameErrorId} role="alert" className="mt-1 text-xs text-destructive">
                    {error ?? t("Add a name")}
                  </p>
                ) : null}
              </div>
            </div>
            <PurposeField value={purpose} tooLong={false} onChange={setPurpose} disabled={creating} />
          </div>
          <div className="min-w-0 space-y-1">
            <Label variant="settings">{t("Runs on")}</Label>
            <AgentChoice agent={agent} onPick={setAgent} disabled={creating} />
          </div>
          <div className="min-w-0 space-y-1">
            <Label variant="settings" htmlFor="new-bot-repo">{t("Default project folder")}</Label>
            <Input
              id="new-bot-repo"
              value={repo}
              disabled={creating}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("Optional · a git repository, e.g. ~/projects/app")}
              className="pointer-coarse:min-h-11"
              onChange={(event) => setRepo(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="mt-0 shrink-0">
          <CreateButton busy={creating} />
        </DialogFooter>
      </form>
    </>
  );
}

export function NewBotDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** after the server made the bot: the caller opens its chat */
  onCreated: (bot: Bot) => void;
}) {
  // The form mounts with the dialog's content, so every opening starts fresh with a new random mascot.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="form" showCloseButton className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden" aria-describedby={undefined}>
        <NewBotForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
