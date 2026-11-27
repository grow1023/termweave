// The project companion (SPEC stage 1): a small orb that is always there while a terminal is in view, and
// a floating chat window it opens into. The chat is a read-only Claude session per project
// (server/companion.ts); each message carries the terminal in view. No voice and no alerts here.
import { MessageCircleQuestion, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { COMPANION_STATUS_ASK, type CompanionView } from "../../shared/companion.ts";
import { paneStorageId } from "../../shared/machines.ts";
import { MAX_COMPOSER_CHARS } from "../lib/compose.ts";
import { composerDrafts } from "../lib/composerDraft.ts";
import { useT } from "../lib/i18n.ts";
import { isCloseKey } from "../lib/modalFocus.ts";
import { appendToDraft } from "../lib/paneNotes.ts";
import { terminalSelection } from "../lib/terminalSelection.ts";
import { botsApi } from "../orca/bots/data.ts";
import { SessionChat } from "../orca/chat/session/SessionChat.tsx";
import { OrcaRoot } from "../orca/OrcaRoot.tsx";
import "./Companion.css";

const POSITION_KEY = "termweave:companion-position";
const DRAG_THRESHOLD = 4;

interface Position { right: number; bottom: number }

/** The orb's place, kept inside the window whatever was stored. */
export function clampPosition(position: Position, width: number, height: number, size = 48): Position {
  const within = (value: number, most: number): number => Math.round(Math.min(Math.max(8, value), Math.max(8, most - size - 8)));
  return { right: within(position.right, width), bottom: within(position.bottom, height) };
}

/** The window sits over the orb. On a short screen it gets shorter, then moves down, so its top stays on screen. */
export function windowPlace(position: Position, viewHeight = window.innerHeight): { right: number; bottom: number; height: number } {
  const wanted = position.bottom + 56;
  const height = Math.max(Math.min(320, viewHeight - 16), Math.min(620, viewHeight - wanted - 8));
  return { right: position.right, bottom: Math.max(8, Math.min(wanted, viewHeight - height - 8)), height };
}

function storedPosition(): Position | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? "null");
    if (raw && typeof raw === "object" && Number.isFinite((raw as Position).right) && Number.isFinite((raw as Position).bottom)) return raw as Position;
  } catch { /* the default place */ }
  return null;
}

async function viewPane(paneId: string): Promise<CompanionView> {
  const response = await fetch("/api/companion/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pane_id: paneId }) });
  const body = await response.json().catch(() => null) as (CompanionView & { error?: { message?: string } }) | null;
  if (!response.ok || body === null) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  return body;
}

export function Companion({ paneId, connected, focusTerminal }: {
  /** the terminal the owner views now */
  paneId: string;
  connected: boolean;
  /** gives the keyboard back to the viewed terminal when the window folds */
  focusTerminal: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CompanionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>(() => clampPosition(storedPosition() ?? { right: 16, bottom: window.innerWidth <= 640 ? 168 : 96 }, window.innerWidth, window.innerHeight));
  const orbRef = useRef<HTMLButtonElement>(null);
  const windowRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; start: Position; moved: boolean } | null>(null);

  // the server learns the viewed terminal whenever it changes, so every message carries the right one
  useEffect(() => {
    let live = true;
    setError(null);
    void viewPane(paneId).then((next) => { if (live) setView(next); }).catch((failure: unknown) => { if (live) { setView(null); setError(failure instanceof Error ? failure.message : String(failure)); } });
    return () => { live = false; };
  }, [paneId]);

  const fold = useCallback(() => { setOpen(false); focusTerminal(); }, [focusTerminal]);
  const toggle = useCallback(() => { if (open) fold(); else setOpen(true); }, [open, fold]);
  useEffect(() => {
    window.addEventListener("termweave:companion-toggle", toggle);
    return () => window.removeEventListener("termweave:companion-toggle", toggle);
  }, [toggle]);

  // opened: the message box takes the keyboard; a press outside the window folds it
  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => windowRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus());
    const outside = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      // menus and dialogs of the chat are portaled to the body: they are still the companion's
      if (target instanceof Element && target.closest("[data-radix-popper-content-wrapper], [role=dialog], [role=menu]")) return;
      if (target && !windowRef.current?.contains(target) && !orbRef.current?.contains(target)) fold();
    };
    window.addEventListener("pointerdown", outside, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointerdown", outside, true); };
  }, [open, fold]);

  useEffect(() => {
    const onResize = (): void => setPosition((current) => clampPosition(current, window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: position, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const held = drag.current;
    if (held === null) return;
    const dx = event.clientX - held.x, dy = event.clientY - held.y;
    if (!held.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    held.moved = true;
    setPosition(clampPosition({ right: held.start.right - dx, bottom: held.start.bottom - dy }, window.innerWidth, window.innerHeight));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const held = drag.current;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (held === null) return;
    if (!held.moved) { toggle(); return; }
    try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* the place lasts until a reload */ }
  };

  const ask = (text: string): void => {
    if (view === null) return;
    void botsApi.sendMessage(view.id, text).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)));
  };
  /** "Ask about the selection": what is selected in the page goes into the message box as a quote, not sent. */
  const quoteSelection = (): void => {
    if (view === null) return;
    // the page's selection (chat text) first, else the terminal's own: xterm draws on a canvas
    const picked = ((window.getSelection()?.toString() ?? "").trim() || terminalSelection().trim());
    if (picked === "") { setError(t("Select some text in the terminal or the chat first.")); return; }
    const key = `termweave:composer-draft:${paneStorageId("local", `bot:${view.id}`)}`;
    const quoted = picked.split("\n").map((line) => `> ${line.trimEnd()}`).join("\n");
    const draft = appendToDraft(composerDrafts.read(key).text, `${quoted}\n`, MAX_COMPOSER_CHARS);
    if (draft === null) { setError(t("The selection is too long for one message.")); return; }
    setError(null);
    composerDrafts.set(key, draft);
    windowRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  };

  // a terminal that asks for a password shows its own masked field (SecretInput): the companion stays out,
  // so nothing typed or shown there reaches a model
  const [secret, setSecret] = useState(false);
  useEffect(() => {
    const check = (): void => setSecret(document.querySelector(".secret-input, [data-secret-input]") !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (secret) setOpen(false); }, [secret]);
  if (secret) return null;
  const paneName = view ? `${view.pane.number ? `P${view.pane.number} ` : ""}${view.pane.label}` : "";
  const label = open ? t("Close the companion") : t("Open the companion");
  return (
    <>
      <button ref={orbRef} type="button" className="companion-orb" data-companion-orb="" data-open={open ? "" : undefined}
        style={{ right: position.right, bottom: position.bottom }} aria-label={label} title={label} aria-expanded={open} aria-controls="companion-window"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
        <MessageCircleQuestion aria-hidden="true" />
      </button>
      {open && (
        <section ref={windowRef} id="companion-window" className="companion-window" role="dialog" aria-label={t("Project companion")} data-companion-window=""
          style={windowPlace(position)}
          onKeyDown={(event) => { if (isCloseKey(event.nativeEvent) && !(event.target instanceof Element && event.target.closest("[role=menu], [role=listbox]"))) { event.stopPropagation(); fold(); } }}>
          <header className="companion-head">
            <div className="companion-title">
              <strong>{view?.name ?? t("Project companion")}</strong>
              {/* which terminal "this" means: it follows the terminal in view */}
              <span className="companion-viewing" data-companion-viewing={view?.pane.pane_id ?? ""}>{view ? t("Viewing: {terminal}", { terminal: paneName }) : t("Loading…")}</span>
            </div>
            <button type="button" className="companion-close" aria-label={t("Close")} onClick={fold}><X aria-hidden="true" /></button>
          </header>
          <div className="companion-tools">
            <button type="button" disabled={view === null || !connected} data-companion-status="" onClick={() => ask(COMPANION_STATUS_ASK)}>{t("Where am I?")}</button>
            <button type="button" disabled={view === null} data-companion-quote="" onClick={quoteSelection}>{t("Ask about the selection")}</button>
          </div>
          {error && <p className="companion-alert" role="alert">{error}</p>}
          <div className="companion-chat">
            {view && (
              <OrcaRoot className="companion-chat-root">
                <SessionChat key={view.id} botId={view.id} readOnly={false} connected={connected}
                  emptyText={t("Ask what this terminal is doing, or anything about this project.")} />
              </OrcaRoot>
            )}
          </div>
          <p className="companion-foot">{t("The companion can read this project. It cannot change files or run commands.")}</p>
        </section>
      )}
    </>
  );
}
