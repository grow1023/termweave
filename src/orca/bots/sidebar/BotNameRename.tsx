// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/sidebar/workspace-card/identity/WorktreeTitleInlineRename.tsx; adapted for TermWeave.
// The name as a text field in place: Enter or leaving the field saves, Escape cancels. The server's refusal goes to `onError`.
import { useRef, useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { botErrorText, botsApi } from "../data.ts";

export function BotNameRename({ botId, name, onDone, onError }: { botId: string; name: string; onDone: () => void; onError: (message: string) => void }): JSX.Element {
  const t = useT();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const finished = useRef(false);
  const mountedAt = useRef(Date.now());
  const commit = async (): Promise<void> => {
    if (finished.current) return;
    finished.current = true;
    const next = value.trim();
    if (next === "" || next === name) { onDone(); return; }
    setSaving(true);
    try { await botsApi.update(botId, { name: next }); } catch (error) { onError(botErrorText(error, t)); }
    onDone();
  };
  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <input
        autoFocus
        value={value}
        disabled={saving}
        aria-label={t("Bot name")}
        className="h-5 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 pr-4 text-[13px] leading-5 text-foreground outline-none focus-visible:ring-0 pointer-coarse:h-11"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") { event.preventDefault(); void commit(); }
          if (event.key === "Escape") { event.preventDefault(); finished.current = true; onDone(); }
        }}
        onBlur={(event) => {
          // A menu that chose Rename gives focus back to the row as it closes: take it again.
          if (Date.now() - mountedAt.current < 300) { event.currentTarget.focus(); return; }
          void commit();
        }}
      />
      {saving ? <LoadingSpinner className="absolute right-0 size-3 text-muted-foreground" /> : null}
    </span>
  );
}
