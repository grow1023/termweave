// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/use-delete-bot.ts; adapted for TermWeave.
// Delete bot…: the confirmation in Orca's wording. The bot's folder stays on disk.
import { useState } from "react";

import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { botsApi } from "../data.ts";
import type { Bot } from "../data.ts";

export function DeleteBotDialog({ bot, open, onOpenChange, onDeleted }: { bot: Bot; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await botsApi.remove(bot.id);
      onOpenChange(false);
      onDeleted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent size="confirm" className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Delete {name}?", { name: bot.name })}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {t("Its folder stays at {path}, with its soul and memory.", { path: bot.home })} {t("Its worktrees stay on disk too.")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={busy} className="pointer-coarse:min-h-11" onClick={() => onOpenChange(false)}>
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
