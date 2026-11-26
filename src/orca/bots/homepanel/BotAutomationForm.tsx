// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotUpcomingSection.tsx (New automation); adapted for TermWeave.
// A small form in place of Orca's "set up an automation" draft: Name, When (cron), What to do, Only once.
// A refused form keeps what was typed and shows the server's words.
import { useId, useState } from "react";

import { useLocale, useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Label } from "../../ui/label.tsx";
import { Switch } from "../../ui/switch.tsx";
import { Textarea } from "../../ui/textarea.tsx";
import { cn } from "../../cn.ts";
import { botsApi } from "../data.ts";
import { AUTOMATION_PRESETS, type AutomationPreset, presetOf } from "./automation-presets.ts";
import { nextTwoRuns, runText } from "./schedule-preview.ts";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

const DEFAULT_CRON = "0 9 * * 1-5";
const FIELD = "pointer-coarse:h-11 h-8 text-xs md:text-xs";

/** Under the When field: the field order, and while the schedule reads, its next two runs. */
function WhenHelp({ id, when }: { id: string; when: string }) {
  const t = useT();
  const locale = useLocale();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const runs = nextTwoRuns(when, Date.now(), timezone);
  return (
    <span id={id} className="flex flex-col text-muted-foreground">
      <span>{t("Minute, hour, day, month, weekday")}</span>
      {/* a schedule the server would refuse shows no runs; Add automation still says why */}
      {runs ? <span className="text-foreground/80 tabular-nums">{t("Next: {first}, then {second}", { first: runText(runs[0], locale), second: runText(runs[1], locale) })}</span> : null}
    </span>
  );
}

/** Common schedules, so the owner picks one instead of recalling cron (BOT-29); the field below takes any other. */
function WhenPresets({ when, disabled, onPick }: { when: string; disabled: boolean; onPick: (cron: string) => void }) {
  const t = useT();
  const picked = presetOf(when);
  // literal keys, so the dictionary check sees each one
  const labels: Record<AutomationPreset["label"], string> = {
    "Every morning 9:00": t("Every morning 9:00"),
    "Weekdays 9:00": t("Weekdays 9:00"),
    "Every hour": t("Every hour"),
    "Mondays 9:00": t("Mondays 9:00"),
  };
  return (
    <div role="group" aria-label={t("Common schedules")} className="flex flex-wrap gap-1">
      {AUTOMATION_PRESETS.map((preset) => {
        const on = picked === preset;
        return (
          <button
            key={preset.cron}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={preset.cron}
            onClick={() => onPick(preset.cron)}
            className={cn(
              "inline-flex h-6 items-center rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 pointer-coarse:h-11",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent",
            )}
          >
            {labels[preset.label]}
          </button>
        );
      })}
    </div>
  );
}

export function BotAutomationForm({ botId, onClose }: { botId: string; onClose: () => void }) {
  const t = useT();
  const act = useBotAction();
  const id = useId();
  const [name, setName] = useState("");
  const [when, setWhen] = useState(DEFAULT_CRON);
  const [prompt, setPrompt] = useState("");
  const [once, setOnce] = useState(false);
  // a name is optional: the server names an automation after what it does
  const ready = when.trim() !== "" && prompt.trim() !== "";
  const submit = (): void => {
    if (!ready || act.busy) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void act.run(() => botsApi.addAutomation(botId, { name: name.trim(), prompt: prompt.trim(), schedule: when.trim(), timezone, once })).then((ok) => {
      if (ok) onClose();
    });
  };
  return (
    <form
      aria-label={t("New automation")}
      className="mx-1 my-1 flex flex-col gap-2 rounded-md border border-border bg-popover p-2.5 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-name`} variant="settings">{t("Name")}</Label>
        <Input id={`${id}-name`} className={FIELD} value={name} disabled={act.busy} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-when`} variant="settings">{t("When")}</Label>
        <WhenPresets when={when} disabled={act.busy} onPick={setWhen} />
        <Input id={`${id}-when`} className={`${FIELD} font-mono`} value={when} disabled={act.busy} aria-describedby={`${id}-when-help`} spellCheck={false} onChange={(event) => setWhen(event.target.value)} />
        <WhenHelp id={`${id}-when-help`} when={when} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-prompt`} variant="settings">{t("What to do")}</Label>
        <Textarea id={`${id}-prompt`} className="min-h-16 text-xs md:text-xs" value={prompt} disabled={act.busy} onChange={(event) => setPrompt(event.target.value)} />
      </div>
      <div className="flex items-center gap-2 pointer-coarse:min-h-11">
        <Switch id={`${id}-once`} size="compact" checked={once} disabled={act.busy} onCheckedChange={setOnce} />
        <Label htmlFor={`${id}-once`} variant="settings">{t("Only once")}</Label>
      </div>
      <ActionError message={act.error} className="px-0" />
      <span className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="xs" className="pointer-coarse:h-11" disabled={act.busy} onClick={onClose}>{t("Cancel")}</Button>
        <Button type="submit" size="xs" className="pointer-coarse:h-11" disabled={!ready || act.busy}>{t("Add automation")}</Button>
      </span>
    </form>
  );
}
