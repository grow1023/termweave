// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/use-delete-bot.ts; adapted for TermWeave.
// Delete bot…: the confirmation in Orca's wording, the same from settings and from the sidebar. What goes
// (its items and automations, server/bots/store.ts removeBot) and what stays (its folder) are both said.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { botErrorText, botsApi } from "../data.ts";
import type { Bot } from "../data.ts";

export function DeleteBotDialog({ bot, open, onOpenChange, onDeleted }: { bot: Bot; open: boolean; onOpenChange: (open: boolean) => void; onDeleted?: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a closed dialog forgets its refusal, so the next opening starts clean
  const change = (next: boolean): void => {
    if (busy) return;
    if (!next) setError(null);
    onOpenChange(next);
  };
  const confirm = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await botsApi.remove(bot.id);
      onOpenChange(false);
      onDeleted?.();
    } catch (failure) {
      setError(botErrorText(failure, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      {/* Cancel has the focus: Enter right after the menu does not delete. A click inside stays out of the sidebar row under it. */}
      <DialogContent size="confirm" busy={busy} initialFocus="cancel" className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("Delete {name}?", { name: bot.name })}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {t("Its items and automations are deleted with it.")} {t("Its folder stays at {path}, with its soul and memory.", { path: bot.home })} {t("Its worktrees stay on disk too.")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" size="sm" data-dialog-cancel disabled={busy} className="pointer-coarse:min-h-11" onClick={() => change(false)}>
            {t("Cancel")}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} className="pointer-coarse:min-h-11" onClick={() => void confirm()}>
            {busy ? <LoadingSpinner className="size-4" /> : null}
            {t("Delete bot")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
