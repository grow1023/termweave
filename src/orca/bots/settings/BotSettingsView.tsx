// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/settings-view/BotSettingsView.tsx, BotSettingsRoot.tsx and bot-settings-place.ts; adapted for TermWeave.
// A bot's settings: a root of rows, and drill-in pages (Soul, Memory) that open in place with a back arrow.
import { Activity, Bot as BotIcon, Brain, ChevronLeft, Copy, FolderGit2, Smile, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { botMascot } from "../../../../shared/bots/avatar.ts";
import { copyText } from "../../../lib/clipboard.ts";
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { OrcaRoot } from "../../OrcaRoot.tsx";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Switch } from "../../ui/switch.tsx";
import { useBotsView, botsApi } from "../data.ts";
import type { Bot, BotNote } from "../data.ts";
import { BotNameInlineEdit } from "./BotNameInlineEdit.tsx";
import { BotNoteEditor } from "./BotNoteEditor.tsx";
import { PictureButton } from "./BotPicturePicker.tsx";
import type { PictureChoice } from "./BotPicturePicker.tsx";
import { SettingsInsetGroup, SettingsInsetRow } from "./BotSettingsRows.tsx";
import { DeleteBotDialog } from "./DeleteBotDialog.tsx";

type Page = BotNote | null;

function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

function pageTitle(page: BotNote, t: ReturnType<typeof useT>): string {
  return page === "soul" ? t("Soul") : t("Memory");
}

function Crumb({ bot, page, onBack, onRoot }: { bot: Bot; page: Page; onBack: () => void; onRoot: () => void }) {
  const t = useT();
  const settings = t("Settings");
  const back = page ? t("Back to Settings") : t("Back to Home");
  const crumb = "shrink-0 cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav aria-label={t("Bot settings")} className="flex h-11 min-w-0 shrink-0 items-center gap-1 text-[13px]">
      <Button variant="ghost" size="icon-sm" aria-label={back} title={back} className="pointer-coarse:size-11" onClick={page ? onRoot : onBack}>
        <ChevronLeft />
      </Button>
      <button type="button" className={cn(crumb, "min-w-0 shrink truncate")} onClick={onBack}>
        {bot.name}
      </button>
      <span aria-hidden className="shrink-0 text-muted-foreground">/</span>
      {page ? (
        <>
          <button type="button" className={cn(crumb, "hidden min-[360px]:inline")} onClick={onRoot}>
            {settings}
          </button>
          <span aria-hidden className="hidden shrink-0 text-muted-foreground min-[360px]:inline">/</span>
          <span aria-current="page" className="shrink-0 font-semibold whitespace-nowrap">{pageTitle(page, t)}</span>
        </>
      ) : (
        <span aria-current="page" className="shrink-0 font-semibold">{settings}</span>
      )}
    </nav>
  );
}

/** Runs one change on the bot; keeps the control off while it runs and shows a refusal. */
function useSave(botId: string): { busy: boolean; error: string | null; run: (change: Parameters<typeof botsApi.update>[1]) => Promise<boolean> } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (change: Parameters<typeof botsApi.update>[1]): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await botsApi.update(botId, change);
      return true;
    } catch (failure) {
      setError(message(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }, [botId]);
  return { busy, error, run };
}

function RepoRow({ bot, readOnly }: { bot: Bot; readOnly: boolean }) {
  const t = useT();
  const save = useSave(bot.id);
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? bot.repo ?? "";
  const commit = async (): Promise<void> => {
    if (value === null || save.busy) return;
    const next = value.trim();
    if (next === (bot.repo ?? "")) {
      setValue(null);
      return;
    }
    if (await save.run({ repo: next || null })) setValue(null);
  };
  return (
    <div data-row-icon="" className="flex min-w-0 flex-col gap-1.5 py-2 pr-2.5 pl-3 text-[13px]">
      <label htmlFor={`bot-repo-${bot.id}`} className="flex min-w-0 items-center gap-2.5 font-medium leading-[18px]">
        <span className="flex w-4 shrink-0 justify-center text-muted-foreground [&_svg]:size-3.5"><FolderGit2 aria-hidden /></span>
        <span className="min-w-0 truncate">{t("Default project folder")}</span>
      </label>
      <Input
        id={`bot-repo-${bot.id}`}
        value={shown}
        disabled={readOnly || save.busy}
        autoComplete="off"
        spellCheck={false}
        placeholder="~/projects/app"
        density="compact"
        aria-invalid={save.error !== null || undefined}
        className="pointer-coarse:h-11 pointer-coarse:text-base"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setValue(null);
          }
        }}
      />
      {save.error ? <p role="alert" className="text-xs text-destructive">{save.error}</p> : null}
    </div>
  );
}

function ActiveRow({ bot, readOnly }: { bot: Bot; readOnly: boolean }) {
  const t = useT();
  const save = useSave(bot.id);
  return (
    <>
      <SettingsInsetRow
        icon={<Activity />}
        title={t("Active")}
        end={
          <Switch
            size="compact"
            checked={!bot.paused}
            disabled={readOnly || save.busy}
            aria-label={t("Active")}
            className="after:absolute after:-inset-2"
            onCheckedChange={() => void save.run({ paused: !bot.paused })}
          />
        }
      />
      {save.error ? <p role="alert" className="px-3 pb-2 text-xs text-destructive">{save.error}</p> : null}
    </>
  );
}

function HomeFolderRow({ home }: { home: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const copy = async (): Promise<void> => {
    const ok = await copyText(home);
    setCopied(ok);
    setFailed(!ok);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <>
      <SettingsInsetRow
        title={t("Home folder")}
        detail={home}
        wrapEnd
        end={
          <Button variant="outline" size="xs" className="pointer-coarse:min-h-11" onClick={() => void copy()}>
            <Copy aria-hidden />
            {copied ? t("Copied") : t("Copy Path")}
          </Button>
        }
      />
      {failed ? <p role="alert" className="px-3 pb-2 text-xs text-destructive">{t("Could not copy the path.")}</p> : null}
    </>
  );
}

function RootPage({ bot, readOnly, open, onDeleted }: { bot: Bot; readOnly: boolean; open: (page: BotNote) => void; onDeleted: () => void }) {
  const t = useT();
  const picture = useSave(bot.id);
  const [deleting, setDeleting] = useState(false);
  // A bot from before pictures has no stored mascot: the picker starts on the one its id gives it.
  const choice: PictureChoice = { avatar: `mascot:${botMascot(bot)}` };
  const agent = bot.agent === "claude" ? "Claude Code" : "Codex";
  return (
    <div data-bot-settings-root className="flex min-w-0 flex-col gap-3">
      <div className="rounded-[10px] bg-foreground/[0.035] p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <PictureButton
            variant="settings"
            label={t("Edit bot picture")}
            disabled={readOnly || picture.busy}
            value={choice}
            onPick={(next) => void picture.run({ avatar: next.avatar })}
          />
          <div className="min-w-0 flex-1">
            <BotNameInlineEdit bot={bot} readOnly={readOnly} className="text-sm leading-5 font-semibold" />
          </div>
        </div>
        {picture.error ? <p role="alert" className="mt-2 text-xs text-destructive">{picture.error}</p> : null}
      </div>
      <SettingsInsetGroup title={t("Soul and memory")}>
        <SettingsInsetRow icon={<Smile />} title={t("Soul")} onOpen={() => open("soul")} />
        <SettingsInsetRow icon={<Brain />} title={t("Memory")} onOpen={() => open("memory")} />
      </SettingsInsetGroup>
      <SettingsInsetGroup title={t("Agent")}>
        <SettingsInsetRow icon={<BotIcon />} title={t("Agent")} value={agent} />
        <RepoRow bot={bot} readOnly={readOnly} />
        <ActiveRow bot={bot} readOnly={readOnly} />
      </SettingsInsetGroup>
      <SettingsInsetGroup>
        <HomeFolderRow home={bot.home} />
      </SettingsInsetGroup>
      {readOnly ? null : (
        <div>
          <Button variant="ghost-destructive" size="sm" className="pointer-coarse:min-h-11" onClick={() => setDeleting(true)}>
            <Trash2 />
            {t("Delete bot…")}
          </Button>
          <DeleteBotDialog bot={bot} open={deleting} onOpenChange={setDeleting} onDeleted={onDeleted} />
        </div>
      )}
    </div>
  );
}

export function BotSettingsView({ botId, readOnly, onBack, onDeleted }: {
  botId: string;
  readOnly: boolean;
  /** the back arrow at the top: the caller shows the Home panel again */
  onBack: () => void;
  /** after the bot was deleted */
  onDeleted: () => void;
}) {
  const t = useT();
  const view = useBotsView();
  const bot = view?.bots.find((candidate) => candidate.id === botId) ?? null;
  const [page, setPage] = useState<Page>(null);
  const dirty = useRef(false);
  const setDirty = useCallback((next: boolean) => { dirty.current = next; }, []);
  // Leaving a page with unsaved text asks first.
  const leave = (action: () => void): void => {
    if (dirty.current && !window.confirm(t("Discard unsaved changes?"))) return;
    dirty.current = false;
    action();
  };
  if (!bot) return null;
  return (
    <OrcaRoot className="@container/settings-view mx-auto flex w-full min-w-0 max-w-[680px] flex-col">
      <Crumb bot={bot} page={page} onBack={() => leave(onBack)} onRoot={() => leave(() => setPage(null))} />
      <div role="region" aria-label={page ? pageTitle(page, t) : t("Settings")} className="flex min-w-0 flex-col gap-[18px] pt-2 pb-6">
        {page ? (
          <BotNoteEditor key={page} botId={bot.id} note={page} readOnly={readOnly} onDirtyChange={setDirty} />
        ) : (
          <RootPage bot={bot} readOnly={readOnly} open={setPage} onDeleted={onDeleted} />
        )}
      </div>
    </OrcaRoot>
  );
}
