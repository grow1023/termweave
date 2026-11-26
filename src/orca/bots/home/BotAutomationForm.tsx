// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotUpcomingSection.tsx (New automation); adapted for TermWeave.
// A small form in place of Orca's "set up an automation" draft: Name, When (cron), What to do, Only once.
// A refused form keeps what was typed and shows the server's words.
import { useId, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Label } from "../../ui/label.tsx";
import { Switch } from "../../ui/switch.tsx";
import { Textarea } from "../../ui/textarea.tsx";
import { botsApi } from "../data.ts";
import { ActionError, useBotAction } from "./use-bot-action.tsx";

const DEFAULT_CRON = "0 9 * * 1-5";
const FIELD = "pointer-coarse:h-11 h-8 text-xs md:text-xs";

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
        <Input id={`${id}-when`} className={`${FIELD} font-mono`} value={when} disabled={act.busy} aria-describedby={`${id}-when-help`} spellCheck={false} onChange={(event) => setWhen(event.target.value)} />
        <span id={`${id}-when-help`} className="text-muted-foreground">{t("Minute, hour, day, month, weekday")}</span>
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
