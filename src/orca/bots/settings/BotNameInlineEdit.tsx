// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotNameInlineEdit.tsx; adapted for TermWeave.
// A bot's name, edited where it shows: a click turns it into a field in place; Enter or leaving saves, Escape cancels.
import { Pencil } from "lucide-react";
import { useRef, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Input } from "../../ui/input.tsx";
import { botsApi } from "../data.ts";
import type { Bot } from "../data.ts";

const NAME_MAX_LENGTH = 60;

export function BotNameInlineEdit({ bot, readOnly, className }: { bot: Bot; readOnly: boolean; className: string }) {
  const t = useT();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Escape removes the field, whose blur must not then save it.
  const cancelled = useRef(false);

  const save = async (): Promise<void> => {
    if (value === null || saving || cancelled.current) return;
    const next = value.trim();
    if (!next || next === bot.name) {
      setError(null);
      setValue(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await botsApi.update(bot.id, { name: next });
      setValue(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  if (readOnly) return <span className={cn("block min-w-0 truncate", className)}>{bot.name}</span>;
  return (
    <>
      {value === null ? (
        <button
          type="button"
          onClick={() => {
            cancelled.current = false;
            setValue(bot.name);
          }}
          aria-label={t("Rename {name}", { name: bot.name })}
          className={cn("group/edit flex max-w-full min-w-0 cursor-text items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11", className)}
        >
          <span className="min-w-0 truncate">{bot.name}</span>
          <Pencil aria-hidden className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" />
        </button>
      ) : (
        <span className={cn("-mx-1 grid max-w-[calc(100%+0.5rem)] min-w-0 rounded-sm bg-input/30 px-1 outline outline-1 outline-ring ring-[3px] ring-ring/50", className)}>
          <Input
            ref={(input) => {
              if (input && document.activeElement !== input && !saving) {
                input.focus();
                input.select();
              }
            }}
            value={value}
            maxLength={NAME_MAX_LENGTH}
            disabled={saving}
            spellCheck={false}
            autoComplete="off"
            style={{ font: "inherit" }}
            aria-label={t("Bot name")}
            aria-invalid={error !== null || undefined}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelled.current = true;
                setError(null);
                setValue(null);
              }
            }}
            surface="inline"
          />
        </span>
      )}
      {error ? (
        <span role="alert" className="mt-0.5 block text-xs font-normal text-destructive">
          {error}
        </span>
      ) : null}
    </>
  );
}
