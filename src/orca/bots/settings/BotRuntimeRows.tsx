// How a bot runs, in its settings' Agent group: as a chat session with no terminal (server/bots/session)
// or in a terminal pane, with the switch between them; and a session bot's tool permissions.
import { MonitorCog, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

import { BOT_PERMISSION_MODES, type BotPermissionMode } from "../../../../shared/bots/chat.ts";
import { openBotWhereItRuns, reloadBots } from "../../../lib/bots.ts";
import { useT } from "../../../lib/i18n.ts";
import { Button } from "../../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.tsx";
import { botErrorText, botsApi } from "../data.ts";
import type { Bot } from "../data.ts";
import { SettingsInsetRow } from "./BotSettingsRows.tsx";

type Runtime = NonNullable<Bot["runtime"]>;

function SwitchRuntimeDialog({ bot, to, open, onOpenChange }: { bot: Bot; to: Runtime; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await botsApi.setRuntime(bot.id, to);
      // App opens the bot from the bots view: read it again first, or it still says how the bot ran before
      // and the screen stays on the closed terminal (found 2026-11-27: the switch worked and nothing opened)
      await reloadBots();
      onOpenChange(false);
      // the page or the pane follows the bot: App opens it where it runs now
      openBotWhereItRuns(bot.id);
    } catch (failure) {
      // the server's refusal as it comes (a pane to session switch needs the bot's terminal running)
      setError(botErrorText(failure, t));
    } finally {
      setBusy(false);
    }
  };
  const toSession = to === "session";
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent size="confirm" busy={busy} initialFocus="cancel" className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{toSession ? t("Run {name} as a chat session?", { name: bot.name }) : t("Run {name} in a terminal?", { name: bot.name })}</DialogTitle>
          <DialogDescription>
            {toSession
              ? t("The conversation continues. A chat session has no terminal view. Switching needs the bot's terminal to be running: open its chat first if the terminal is closed.")
              : t("The conversation continues in a terminal, where you can watch the bot work.")}
          </DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-xs text-destructive [overflow-wrap:anywhere]">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" size="sm" data-dialog-cancel disabled={busy} className="pointer-coarse:min-h-11" onClick={() => change(false)}>
            {t("Cancel")}
          </Button>
          <Button size="sm" disabled={busy} className="pointer-coarse:min-h-11" onClick={() => void confirm()}>
            {busy ? <LoadingSpinner className="size-4" /> : null}
            {toSession ? t("Run as chat session") : t("Run in terminal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Runs as": Chat session or Terminal. A Claude bot can switch; a Codex bot always runs in a terminal. */
export function RuntimeRow({ bot, readOnly }: { bot: Bot; readOnly: boolean }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const runtime: Runtime = bot.runtime ?? "pane";
  const value = runtime === "session" ? t("Chat session") : t("Terminal");
  if (bot.agent !== "claude") return <SettingsInsetRow icon={<MonitorCog />} title={t("Runs as")} value={value} />;
  const to: Runtime = runtime === "session" ? "pane" : "session";
  return (
    <>
      <SettingsInsetRow
        icon={<MonitorCog />}
        title={t("Runs as")}
        detail={value}
        wrapEnd
        end={readOnly ? undefined : (
          <Button variant="outline" size="xs" className="pointer-coarse:min-h-11" onClick={() => setAsking(true)}>
            {to === "session" ? t("Switch to chat session") : t("Switch to terminal")}
          </Button>
        )}
      />
      <SwitchRuntimeDialog bot={bot} to={to} open={asking} onOpenChange={setAsking} />
    </>
  );
}

function modeText(mode: BotPermissionMode, t: ReturnType<typeof useT>): { title: string; detail: string } {
  switch (mode) {
    case "ask": return { title: t("Ask first"), detail: t("Asks you before it edits a file or runs a command.") };
    case "accept-edits": return { title: t("Accept edits"), detail: t("Edits files without asking; asks before it runs a command.") };
    case "auto": return { title: t("Auto"), detail: t("A safety check approves routine actions without asking and stops risky ones.") };
    case "own": return { title: t("My Claude settings"), detail: t("Follows the permission rules in your own Claude Code settings.") };
  }
}

/** A session bot's tool permissions: one of four modes, each said in one plain line. */
export function PermissionsRow({ bot, readOnly }: { bot: Bot; readOnly: boolean }) {
  const t = useT();
  const name = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current: BotPermissionMode = bot.permissionMode ?? "ask";
  const pick = async (mode: BotPermissionMode): Promise<void> => {
    if (busy || mode === current) return;
    setBusy(true);
    setError(null);
    try { await botsApi.setPermissionMode(bot.id, mode); } catch (failure) { setError(botErrorText(failure, t)); } finally { setBusy(false); }
  };
  return (
    <div data-row-icon="" className="flex min-w-0 flex-col gap-1.5 py-2 pr-2.5 pl-3 text-[13px]">
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={readOnly || busy}>
        <legend className="flex min-w-0 items-center gap-2.5 p-0 font-medium leading-[18px]">
          <span className="flex w-4 shrink-0 justify-center text-muted-foreground [&_svg]:size-3.5"><ShieldCheck aria-hidden /></span>
          <span className="min-w-0 truncate">{t("Permissions")}</span>
        </legend>
        <div className="mt-1.5 flex min-w-0 flex-col gap-0.5 pl-6.5">
          {BOT_PERMISSION_MODES.map((mode) => {
            const text = modeText(mode, t);
            return (
              <label key={mode} className="flex min-w-0 cursor-pointer items-start gap-2 rounded-sm py-1 has-disabled:cursor-default pointer-coarse:min-h-11 pointer-coarse:items-center">
                <input type="radio" name={name} value={mode} checked={current === mode} onChange={() => void pick(mode)} className="mt-0.5 size-4 shrink-0 accent-foreground pointer-coarse:mt-0" />
                <span className="min-w-0">
                  <span className="block leading-[18px]">{text.title}</span>
                  <span className="block text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{text.detail}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
