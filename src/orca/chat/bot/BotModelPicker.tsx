// TermWeave's own control, in the look of stablyai/orca's (MIT, Copyright (c) 2026 Lovecast Inc.) model chip
// (NativeChatSessionOptionPickers.tsx): the bot's model and reasoning effort, changed from the chat's composer.
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { BOT_EFFORTS, type BotEffort, type BotModelOption } from "../../../../shared/bots/chat.ts";
import { openBotWhereItRuns } from "../../../lib/bots.ts";
import { useT, type Translate } from "../../../lib/i18n.ts";
import { botErrorText, botsApi, type Bot } from "../../bots/data.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../../ui/dropdown-menu.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";

function effortLabel(effort: BotEffort, t: Translate): string {
  switch (effort) {
    case "low": return t("Low");
    case "medium": return t("Medium");
    case "high": return t("High");
    case "xhigh": return t("Extra high");
    case "max": return t("Maximum");
  }
}

/** The chip's text: what the bot is set to, or what the chat reports it runs on, or "Model". */
export function modelChipText(bot: Pick<Bot, "model" | "effort">, models: readonly BotModelOption[], running: { model: string | null; effort: string | null }, t: Translate): string {
  const model = bot.model ? models.find((each) => each.value === bot.model)?.label ?? bot.model : running.model;
  const effort = bot.effort ? effortLabel(bot.effort, t) : running.effort;
  const text = [model, effort].filter((part): part is string => Boolean(part)).join(" · ");
  return text === "" ? t("Model") : text;
}

function Row({ chosen, label, description, onPick }: { chosen: boolean; label: string; description?: string; onPick: () => void }) {
  return (
    <DropdownMenuItem role="menuitemradio" aria-checked={chosen} className="items-start gap-2 pointer-coarse:min-h-11" onSelect={onPick}>
      <Check aria-hidden className={chosen ? "mt-0.5 size-3.5 shrink-0" : "mt-0.5 size-3.5 shrink-0 opacity-0"} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>
        {description ? <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{description}</span> : null}
      </span>
    </DropdownMenuItem>
  );
}

export function BotModelPicker({ bot, readOnly, running }: {
  bot: Bot;
  readOnly: boolean;
  /** the model and effort the chat itself reports, shown while the bot has none set */
  running?: { model: string | null; effort: string | null };
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<readonly BotModelOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // on mount for the chip's label, and again each time the menu opens: a session that started since lists more
    void botsApi.models(bot.id).then((next) => { if (live) setModels(next); }).catch(() => { /* the menu still offers Default */ });
    return () => { live = false; };
  }, [bot.id, open]);
  const text = modelChipText(bot, models, running ?? { model: null, effort: null }, t);
  const chipClass = "flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-xs text-chat-foreground-faint";
  if (readOnly || bot.agent !== "claude") {
    return <span className={chipClass} aria-label={t("Model and reasoning")} title={text}><span className="min-w-0 truncate">{text}</span></span>;
  }
  const session = bot.runtime === "session";
  const change = (patch: { model?: string | null; effort?: BotEffort | null }): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void botsApi.setModel(bot.id, patch)
      // a terminal bot came back in a new terminal: the screen follows it there
      .then(() => { if (!session) openBotWhereItRuns(bot.id); })
      .catch((failure: unknown) => setError(botErrorText(failure, t)))
      .finally(() => setBusy(false));
  };
  const efforts = (bot.model ? models.find((each) => each.value === bot.model)?.efforts : undefined) ?? BOT_EFFORTS;
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" data-bot-model-picker="" aria-label={t("Model and reasoning: {current}", { current: text })} title={text}
            className={`${chipClass} cursor-pointer hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11`}>
            <span className="min-w-0 truncate">{text}</span>
            {busy ? <LoadingSpinner className="size-3 shrink-0" /> : <ChevronDown aria-hidden className="size-3 shrink-0" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[min(70vh,28rem)] w-72 overflow-y-auto">
          <DropdownMenuLabel>{t("Model")}</DropdownMenuLabel>
          <Row chosen={!bot.model} label={t("Default")} description={t("Claude Code's own default model")} onPick={() => change({ model: null })} />
          {models.map((model) => (
            <Row key={model.value} chosen={bot.model === model.value} label={model.label} description={model.description} onPick={() => change({ model: model.value })} />
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("Reasoning")}</DropdownMenuLabel>
          <Row chosen={!bot.effort} label={t("Default")} onPick={() => change({ effort: null })} />
          {efforts.map((effort) => (
            <Row key={effort} chosen={bot.effort === effort} label={effortLabel(effort, t)} onPick={() => change({ effort })} />
          ))}
          {session ? null : (
            // a terminal bot changes by a restart of its terminal on the same conversation
            <p className="px-2 py-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{t("A change restarts the bot's terminal. The conversation continues.")}</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <span role="alert" className="min-w-0 truncate text-xs text-destructive" title={error}>{error}</span> : null}
    </>
  );
}
