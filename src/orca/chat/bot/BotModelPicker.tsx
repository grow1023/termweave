// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/session/options/controls/
// NativeChatSessionOptionPickers.tsx, NativeChatModelCombobox.tsx and NativeChatSessionOptionRows.tsx; adapted for TermWeave.
// One pill ("model · effort") opens a popover: a searchable model list on top, and the reasoning effort as its own
// row of segments under it. Orca's list is cmdk's; this one is a plain filtered listbox, as cmdk is not a dependency here.
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { BOT_EFFORTS, type BotEffort, type BotModelOption } from "../../../../shared/bots/chat.ts";
import { openBotWhereItRuns } from "../../../lib/bots.ts";
import { useT, type Translate } from "../../../lib/i18n.ts";
import { botErrorText, botsApi, type Bot } from "../../bots/data.ts";
import { cn } from "../../cn.ts";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover.tsx";

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

/** One row of the model list. `value` null is the default; */
export interface ModelRow { value: string | null; label: string; description?: string }

/**
 * The rows for a search: the default first, then the models whose name, id or description holds every
 * word typed, in the host's order (as Orca: no fuzzy scoring, no reordering).
 */
export function modelRows(models: readonly BotModelOption[], query: string, defaultRow: ModelRow): ModelRow[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== "");
  const all: ModelRow[] = [defaultRow, ...models.filter((model) => model.value !== "default").map((model) => ({ value: model.value, label: model.label, ...(model.description ? { description: model.description } : {}) }))];
  if (words.length === 0) return all;
  return all.filter((row) => {
    const text = `${row.label} ${row.value ?? ""} ${row.description ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

function ModelList({ rows, current, busy, listId, active, onActive, onPick, t }: {
  rows: readonly ModelRow[]; current: string | null; busy: boolean; listId: string;
  active: number; onActive: (index: number) => void; onPick: (row: ModelRow) => void; t: Translate;
}) {
  if (rows.length === 0) return <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("No models match your search.")}</p>;
  return (
    <div id={listId} role="listbox" aria-label={t("Model")} aria-busy={busy} className="scrollbar-sleek max-h-[min(233px,60vh)] overflow-y-auto p-1">
      {rows.map((row, index) => {
        const chosen = row.value === current;
        return (
          // the search keeps the keyboard: rows are picked by pointer, or by Enter from the search
          <div key={row.value ?? "\u0000default"} id={`${listId}-${index}`} role="option" aria-selected={index === active} aria-current={chosen || undefined}
            data-model-value={row.value ?? ""}
            className={cn("flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm pointer-coarse:min-h-11", index === active && "bg-accent text-accent-foreground", busy && "pointer-events-none opacity-60")}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => { if (index !== active) onActive(index); }}
            onClick={() => onPick(row)}>
            <div className="min-w-0 py-0.5">
              <div className="[overflow-wrap:anywhere]">{row.label}</div>
              {row.description ? <div className="text-xs font-normal text-balance text-muted-foreground">{row.description}</div> : null}
            </div>
            {/* the check's slot is reserved, so picking a model does not rewrap its label */}
            <span className="ml-auto flex size-3.5 shrink-0 items-center justify-center">{chosen ? <Check aria-hidden className="size-3.5 text-muted-foreground" /> : null}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Reasoning effort: its own row under the models, one segment per level and one for the default. */
function EffortRow({ efforts, current, busy, onPick, t }: { efforts: readonly BotEffort[]; current: BotEffort | null; busy: boolean; onPick: (effort: BotEffort | null) => void; t: Translate }) {
  const labelId = useId();
  const segment = "inline-flex h-7 min-w-9 items-center justify-center rounded-md px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-checked:bg-foreground/12 aria-checked:text-foreground dark:aria-checked:bg-accent pointer-coarse:h-11";
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-3 py-2" data-option-id="effort">
      <span id={labelId} className="text-xs text-muted-foreground">{t("Reasoning")}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex w-fit flex-wrap items-center gap-0.5 rounded-md">
        <button type="button" role="radio" aria-checked={current === null} disabled={busy} className={segment} onClick={() => onPick(null)}>{t("Default")}</button>
        {efforts.map((effort) => (
          <button key={effort} type="button" role="radio" aria-checked={current === effort} disabled={busy} className={segment} onClick={() => onPick(effort)}>{effortLabel(effort, t)}</button>
        ))}
      </div>
    </div>
  );
}

export function BotModelPicker({ bot, readOnly, running }: {
  bot: Bot;
  readOnly: boolean;
  /** the model and effort the chat itself reports, shown while the bot has none set */
  running?: { model: string | null; effort: string | null };
}) {
  const t = useT();
  const listId = useId();
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<readonly BotModelOption[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // on mount for the pill's label, and again each time the picker opens: a session that started since lists more
    void botsApi.models(bot.id).then((next) => { if (live) setModels(next); }).catch(() => { /* the list still offers the default */ });
    return () => { live = false; };
  }, [bot.id, open]);
  const rows = useMemo(
    () => modelRows(models, query, { value: null, label: t("Default"), description: t("Claude Code's own default model") }),
    [models, query, t],
  );
  useEffect(() => { setActive(0); }, [query, open]);
  const text = modelChipText(bot, models, running ?? { model: null, effort: null }, t);
  const pill = "flex h-7 min-w-0 max-w-64 items-center gap-1 rounded-md px-1.5 text-xs text-chat-foreground-faint";
  if (readOnly || bot.agent !== "claude") {
    return <span className={pill} aria-label={t("Model and reasoning")} title={text}><span className="min-w-0 truncate">{text}</span></span>;
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
  const pickModel = (row: ModelRow): void => {
    // the list stays as it is; only a model other than the current one is a change
    if (row.value !== (bot.model ?? null)) change({ model: row.value });
  };
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length > 0) setActive((active + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) pickModel(row);
    }
  };
  const efforts = (bot.model ? models.find((each) => each.value === bot.model)?.efforts : undefined) ?? BOT_EFFORTS;
  return (
    <>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setQuery(""); setError(null); } }}>
        <PopoverTrigger asChild>
          <button type="button" data-bot-model-picker="" aria-label={t("Model and reasoning: {current}", { current: text })} title={text}
            className={cn(pill, "cursor-pointer hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11")}
            onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
            <span className="min-w-0 truncate text-chat-foreground">{text}</span>
            {busy ? <LoadingSpinner className="size-3 shrink-0" /> : <ChevronDown aria-hidden className="size-3 shrink-0" />}
          </button>
        </PopoverTrigger>
        {/* align end: the pill's label changes under an open picker; only its right edge stays put (Orca) */}
        <PopoverContent align="end" side="top" collisionPadding={8} data-bot-model-popover=""
          className="flex w-96 max-w-(--radix-popover-content-available-width) flex-col p-0"
          onOpenAutoFocus={(event) => { event.preventDefault(); search.current?.focus(); }}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <input ref={search} type="text" role="combobox" aria-expanded aria-controls={listId} aria-autocomplete="list"
              aria-activedescendant={rows.length > 0 ? `${listId}-${active}` : undefined}
              aria-label={t("Search models…")} placeholder={t("Search models…")} value={query} spellCheck={false} autoComplete="off"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground pointer-coarse:h-11"
              onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKey} />
          </div>
          <ModelList rows={rows} current={bot.model ?? null} busy={busy} listId={listId} active={active} onActive={setActive} onPick={pickModel} t={t} />
          {/* effort is the last thing set before typing, so its level closes the picker (Orca) */}
          <EffortRow efforts={efforts} current={bot.effort ?? null} busy={busy} t={t}
            onPick={(effort) => { if (effort !== (bot.effort ?? null)) change({ effort }); setOpen(false); }} />
          {session ? null : (
            // a terminal bot changes by a restart of its terminal on the same conversation
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{t("A change restarts the bot's terminal. The conversation continues.")}</p>
          )}
          {error ? <p role="alert" className="border-t border-border px-3 py-2 text-xs text-destructive [overflow-wrap:anywhere]">{error}</p> : null}
        </PopoverContent>
      </Popover>
      {error && !open ? <span role="alert" className="min-w-0 truncate text-xs text-destructive" title={error}>{error}</span> : null}
    </>
  );
}
