// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/settings/bots/BotSoulEditor.tsx and BotSoulAndMemoryBodies.tsx; adapted for TermWeave.
// The Soul and Memory pages: one textarea on the bot's SOUL.md or MEMORY.md, and a Save button.
import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Button } from "../../ui/button.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { Textarea } from "../../ui/textarea.tsx";
import { botErrorText, botsApi } from "../data.ts";
import type { BotNote } from "../data.ts";

const FILE: Record<BotNote, string> = { soul: "SOUL.md", memory: "MEMORY.md" };

export function BotNoteEditor({ botId, note, readOnly, onDirtyChange }: { botId: string; note: BotNote; readOnly: boolean; onDirtyChange: (dirty: boolean) => void }) {
  const t = useT();
  // `base` is the text on disk the draft started from; null while it loads.
  const [base, setBase] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const label = note === "soul" ? t("Soul") : t("Memory");
  const dirty = base !== null && draft !== base;

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const text = await botsApi.readNote(botId, note);
      setBase(text);
      setDraft(text);
    } catch (failure) {
      setLoadError(botErrorText(failure, t));
    }
  }, [botId, note, t]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const save = async (): Promise<void> => {
    if (!dirty || saving) return;
    const text = draft;
    setSaving(true);
    setSaveError(null);
    try {
      await botsApi.writeNote(botId, note, text);
      setBase(text);
    } catch (failure) {
      // The draft stays as typed, so the text is not lost.
      setSaveError(botErrorText(failure, t));
    } finally {
      setSaving(false);
    }
  };

  if (loadError !== null) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
        <span className="min-w-0">{loadError}</span>
        <Button variant="ghost" size="xs" className="pointer-coarse:min-h-11" onClick={() => void load()}>
          {t("Retry")}
        </Button>
      </div>
    );
  }
  if (base === null) {
    return (
      <div role="status" className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
        <LoadingSpinner className="size-4" />
        {t("Reading {file}…", { file: FILE[note] })}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className={cn("flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-background transition-colors focus-within:border-ring")}>
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
          <code className="truncate font-mono text-xs text-foreground/85">{FILE[note]}</code>
          <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
            {saving ? (
              <>
                <LoadingSpinner className="size-3" />
                {t("Saving…")}
              </>
            ) : dirty ? (
              t("Unsaved")
            ) : (
              <>
                <Check className="size-3" aria-hidden />
                {t("Saved")}
              </>
            )}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 px-4 py-3.5">
          <Textarea variant="composite" aria-label={label} value={draft} rows={12} readOnly={readOnly} className="min-h-0 flex-1" onChange={(event) => setDraft(event.target.value)} />
        </div>
      </div>
      {saveError ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {saveError}
        </p>
      ) : null}
      <p className="px-1 text-xs leading-[17px] text-muted-foreground">{t("The bot reads the change when its chat next starts.")}</p>
      {readOnly ? null : (
        <div>
          <Button size="sm" disabled={!dirty || saving} className="pointer-coarse:min-h-11" onClick={() => void save()}>
            {saving ? <LoadingSpinner className="size-4" /> : null}
            {t("Save")}
          </Button>
        </div>
      )}
    </div>
  );
}
