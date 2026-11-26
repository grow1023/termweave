// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/use-delete-bot.ts; adapted for TermWeave:
// Orca asks in a toast-driven flow; TermWeave asks in a dialog that says what stays on disk.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog.tsx";
import { botsApi, type Bot } from "../data.ts";

export function DeleteBotDialog({ bot, open, onOpenChange }: { bot: Bot; open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (next: boolean): void => {
    if (busy) return;
    if (!next) setError(null);
    onOpenChange(next);
  };
  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await botsApi.remove(bot.id);
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent size="confirm" busy={busy} initialFocus="cancel" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("Delete {name}?", { name: bot.name })}</DialogTitle>
          <DialogDescription>{t("The bot is removed from the list. Its home folder, memory and worktrees stay on disk.")}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" data-dialog-cancel disabled={busy} onClick={() => change(false)}>{t("Cancel")}</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>{t("Delete bot")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
