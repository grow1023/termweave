// The panel beside a bot's chat, as Orca's right sidebar holds a bot's Home: its Home panel, with
// its settings swapped in place (Orca's BotActivityOrSettings). Docked when the pane is wide; on a
// narrow pane or a phone it covers the chat and opens from the bot's picture.
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { useT } from "../../lib/i18n.ts";
import { OrcaRoot } from "../OrcaRoot.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { useBotsView } from "./data.ts";
import { BotHomePanel } from "./home/BotHomePanel.tsx";
import { BotSettingsView } from "./settings/BotSettingsView.tsx";
import "./bot-side.css";

/** below this pane width the panel covers the chat instead of sitting beside it */
const DOCK_MIN = 760;
const OPEN_KEY = "termweave.bots.side";

// which bot shows its settings: the sidebar's "Bot settings…" sets it from outside the pane
let settingsOf: string | null = null;
// asked to open from outside (the sidebar): the panel opens even where it was closed
let wanted = 0;
const listeners = new Set<() => void>();
const emit = (): void => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Shows that bot's settings in the panel beside its chat (the caller opens the chat). */
export function showBotSettings(botId: string): void { settingsOf = botId; wanted += 1; emit(); }

// panes whose Home panel sits docked and open beside the chat, so it already shows every waiting card
const dockedPanes = new Set<string>();
function setDocked(paneId: string, docked: boolean): void {
  const changed = docked ? !dockedPanes.has(paneId) : dockedPanes.has(paneId);
  if (!changed) return;
  if (docked) dockedPanes.add(paneId); else dockedPanes.delete(paneId);
  emit();
}

/** True while this pane's Home panel is docked and open beside its chat (never as a sheet). */
export function useBotSideDocked(paneId: string | null): boolean {
  return useSyncExternalStore(subscribe, () => paneId !== null && dockedPanes.has(paneId));
}

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) !== "closed"; } catch { return true; }
}

/**
 * While the panel is a sheet over the chat (BOT-10): the covered chat is inert, so neither Tab nor a
 * screen reader reaches it, and focus moves into the sheet (its Close button).
 */
function useSheetFocus(anchor: RefObject<HTMLSpanElement>, side: RefObject<HTMLElement>, sheet: boolean): void {
  useEffect(() => {
    const stack = anchor.current?.parentElement;
    if (!sheet || !stack) return;
    const covered = [...stack.children].filter((child): child is HTMLElement =>
      child instanceof HTMLElement && child !== anchor.current && !child.classList.contains("bot-side") && !child.inert);
    for (const element of covered) element.inert = true;
    const panel = side.current;
    (panel?.querySelector<HTMLElement>("[data-bot-side-close]") ?? panel)?.focus();
    return () => { for (const element of covered) element.inert = false; };
  }, [anchor, side, sheet]);
}

export function BotSide({ paneId, readOnly }: { paneId: string; readOnly: boolean }) {
  const t = useT();
  const view = useBotsView();
  const bot = view?.bots.find((entry) => entry.paneId === paneId);
  const settings = useSyncExternalStore(subscribe, () => settingsOf);
  const asked = useSyncExternalStore(subscribe, () => wanted);
  const anchor = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const [docks, setDocks] = useState(true);
  const [dockOpen, setDockOpen] = useState(readOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const botId = bot?.id ?? null;

  // the pane's own width decides, not the window's: a split pane is narrow on a wide screen
  useEffect(() => {
    const stack = anchor.current?.parentElement;
    if (!stack || botId === null) return;
    const measure = (): void => setDocks(stack.clientWidth >= DOCK_MIN);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    return () => observer.disconnect();
  }, [botId]);
  const open = docks ? dockOpen : sheetOpen;
  // the chat gives the docked panel its room
  useEffect(() => {
    const stack = anchor.current?.parentElement;
    if (!stack || botId === null) return;
    if (docks && open) stack.dataset.botSide = "docked"; else delete stack.dataset.botSide;
    setDocked(paneId, docks && open);
    return () => { delete stack.dataset.botSide; setDocked(paneId, false); };
  }, [botId, docks, open, paneId]);
  useEffect(() => { if (asked > 0 && settingsOf === botId && botId !== null) { setDockOpen(true); setSheetOpen(true); } }, [asked, botId]);
  useSheetFocus(anchor, sideRef, !docks && open);

  if (!view || !bot) return <span ref={anchor} hidden />;
  const setOpen = (next: boolean): void => {
    if (docks) { setDockOpen(next); try { localStorage.setItem(OPEN_KEY, next ? "open" : "closed"); } catch { /* lasts this visit */ } return; }
    setSheetOpen(next);
    // the sheet covered the chat: focus goes back to the picture that opened it (mounted on the next frame)
    if (!next) requestAnimationFrame(() => toggleRef.current?.focus());
  };
  const needs = view.items.filter((item) => item.botId === bot.id && item.status === "needs_you").length;
  const leaveSettings = (): void => { settingsOf = null; emit(); };
  return <>
    <span ref={anchor} hidden />
    {!open && <OrcaRoot className="bot-side-toggle">
      <button ref={toggleRef} type="button" onClick={() => setOpen(true)} aria-label={t("Open {name}'s home", { name: bot.name })} title={t("Open {name}'s home", { name: bot.name })}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-background shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:size-11">
        <BotAvatar bot={bot} className="size-7 rounded-md pointer-coarse:size-8" />
        {needs > 0 && <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-agent-question px-1 text-3xs font-semibold text-white tabular-nums">{needs}</span>}
      </button>
    </OrcaRoot>}
    {open && <aside ref={sideRef} tabIndex={-1} className={docks ? "bot-side is-docked" : "bot-side is-sheet"} aria-label={t("{name} bot", { name: bot.name })}
      onKeyDown={(event) => {
        // a portaled menu's Escape is not inside the aside; the item view's Escape-to-Back prevents the default
        if (event.key !== "Escape" || event.defaultPrevented || docks) return;
        if (!(event.target instanceof Node) || !sideRef.current?.contains(event.target)) return;
        event.preventDefault();
        setOpen(false);
      }}>
      {settings === bot.id
        ? <BotSettingsView botId={bot.id} readOnly={readOnly} onBack={leaveSettings} onDeleted={leaveSettings} />
        : <BotHomePanel botId={bot.id} readOnly={readOnly} onOpenSettings={() => { settingsOf = bot.id; emit(); }} onClose={() => setOpen(false)} />}
    </aside>}
  </>;
}
