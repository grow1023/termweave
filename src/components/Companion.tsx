// The project companion (SPEC stage 1): a small orb that is always there while a terminal is in view, and
// a floating chat window it opens into. The chat is a read-only Claude session per project
// (server/companion.ts); each message carries the terminal in view. No voice and no alerts here.
import { MessageCircleQuestion, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { COMPANION_STATUS_ASK, type CompanionNotice, type CompanionView } from "../../shared/companion.ts";
import { paneStorageId } from "../../shared/machines.ts";
import { MAX_COMPOSER_CHARS } from "../lib/compose.ts";
import { composerDrafts } from "../lib/composerDraft.ts";
import { useT, type Translate } from "../lib/i18n.ts";
import { isCloseKey } from "../lib/modalFocus.ts";
import { appendToDraft } from "../lib/paneNotes.ts";
import { terminalSelection } from "../lib/terminalSelection.ts";
import { botsApi } from "../orca/bots/data.ts";
import { SessionChat } from "../orca/chat/session/SessionChat.tsx";
import { OrcaRoot } from "../orca/OrcaRoot.tsx";
import { CompanionVoice } from "./CompanionVoice.tsx";
import "./Companion.css";

const POSITION_KEY = "termweave:companion-position";
const DRAG_THRESHOLD = 4;
const NOTICES_KEY = "termweave:companion-notices";
const NOTICE_POLL_MS = 10_000;
const NOTICES_SHOWN = 3;
const AUTO_KEY = "termweave:companion-auto";
/** at most one look the companion starts by itself in this long: each one is a turn on the owner's plan */
export const AUTO_LOOK_MS = 5 * 60_000;

function autoWanted(): boolean {
  try { return window.localStorage.getItem(AUTO_KEY) !== "off"; } catch { return true; }
}

/** The notice the companion looks into by itself now, or null: none is new, or the last look was too recent. */
export function nextAutoLook(notices: readonly CompanionNotice[], looked: ReadonlySet<string>, lastAt: number, now: number): CompanionNotice | null {
  if (now - lastAt < AUTO_LOOK_MS) return null;
  return notices.find((notice) => !looked.has(notice.key)) ?? null;
}

function noticesWanted(): boolean {
  try { return window.localStorage.getItem(NOTICES_KEY) !== "off"; } catch { return true; }
}

async function readNotices(id: string, dismiss?: string): Promise<CompanionNotice[]> {
  const response = await fetch("/api/companion/notices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...(dismiss === undefined ? {} : { dismiss }) }) });
  const body = await response.json().catch(() => null) as { notices?: CompanionNotice[] } | null;
  return response.ok && Array.isArray(body?.notices) ? body.notices : [];
}

/** A notice's one line, and the question its button sends as the owner's own message. */
export function noticeWords(notice: CompanionNotice, t: Translate): { line: string; ask: string } {
  const terminal = notice.terminal;
  switch (notice.kind) {
    case "waiting": return { line: t("{terminal} is waiting for your answer.", { terminal }), ask: t("{terminal} is waiting for me. What is it asking, what are my options, and what does each one lead to?", { terminal }) };
    case "started": return { line: t("{terminal} has just started. Look for what could break?", { terminal }), ask: t("Pre-mortem for {terminal}: it has just started. What are the most likely ways this run breaks, and what should I tell it now? If an instruction would help, propose it as a card.", { terminal }) };
    case "finished": return { line: t("{terminal} has finished. Look back at what it did?", { terminal }), ask: t("Post-mortem for {terminal}: what did it do, what went wrong or is unverified, and what should I check before I trust it?", { terminal }) };
    case "repeated": return { line: t("The same error showed twice in {terminal}.", { terminal }), ask: t("The same error showed twice in {terminal}: {line} What is the root cause, and what should I tell the agent? If an instruction would help, propose it as a card.", { terminal, line: notice.line ?? "" }) };
  }
}

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

  // what the companion points out unasked: a dot on the orb and a line in the window, never a sound or a popup
  const [notices, setNotices] = useState<CompanionNotice[]>([]);
  const [wanted, setWanted] = useState(noticesWanted);
  const companionId = view?.id ?? null;
  useEffect(() => {
    if (companionId === null || !wanted) { setNotices([]); return undefined; }
    let live = true;
    const read = (): void => { if (!document.hidden) void readNotices(companionId).then((next) => { if (live) setNotices(next); }).catch(() => { /* the next read tries again */ }); };
    read();
    const timer = window.setInterval(read, NOTICE_POLL_MS);
    return () => { live = false; window.clearInterval(timer); };
  }, [companionId, wanted, paneId]);
  const dismissNotice = (key: string): void => {
    setNotices((current) => current.filter((notice) => notice.key !== key));
    if (companionId !== null) void readNotices(companionId, key).catch(() => {});
  };
  // "by itself": the companion starts the look (a pre-mortem, a post-mortem, the cause of a repeated error)
  // without being asked. It only reads and answers; anything it wants done is still a card.
  const [auto, setAuto] = useState(autoWanted);
  const [unread, setUnread] = useState(false);
  const looked = useRef<Set<string>>(new Set());
  const lastLook = useRef(-Infinity);
  const openRef = useRef(false);
  const toggleAuto = (): void => {
    const next = !auto;
    setAuto(next);
    try { window.localStorage.setItem(AUTO_KEY, next ? "on" : "off"); } catch { /* until a reload */ }
  };
  const toggleNotices = (): void => {
    const next = !wanted;
    setWanted(next);
    try { window.localStorage.setItem(NOTICES_KEY, next ? "on" : "off"); } catch { /* until a reload */ }
  };

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

  const send = async (text: string): Promise<boolean> => {
    if (view === null) return false;
    try { await botsApi.sendMessage(view.id, text); setError(null); return true; } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    }
  };
  const ask = (text: string): void => { void send(text); };
  /** a message the owner said aloud: the companion answers it for the ear (server/companion.ts) */
  const sendSpoken = async (text: string, heard: string | null): Promise<boolean> => {
    if (view === null) return false;
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(view.id)}/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, spoken: true, ...(heard === null ? {} : { heard }) }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${response.status}`);
      setError(null);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    }
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
  openRef.current = open;
  useEffect(() => { if (open) setUnread(false); }, [open]);
  useEffect(() => {
    if (!auto || !wanted || !connected || view === null) return;
    const notice = nextAutoLook(notices, looked.current, lastLook.current, Date.now());
    if (notice === null) return;
    looked.current.add(notice.key);
    lastLook.current = Date.now();
    void send(noticeWords(notice, t).ask).then((sent) => { if (sent && !openRef.current) setUnread(true); });
    dismissNotice(notice.key);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the notices change; send and dismissNotice read the current view
  }, [notices, auto, wanted, connected, view?.id]);
  const paneName = view ? `${view.pane.number ? `P${view.pane.number} ` : ""}${view.pane.label}` : "";
  const first = notices[0] ? noticeWords(notices[0], t).line : unread ? t("The companion looked into something for you.") : null;
  const label = `${open ? t("Close the companion") : t("Open the companion")}${first && !open ? ` · ${first}` : ""}`;
  return (
    <>
      <button ref={orbRef} type="button" className="companion-orb" data-companion-orb="" data-open={open ? "" : undefined}
        style={{ right: position.right, bottom: position.bottom }} aria-label={label} title={label} aria-expanded={open} aria-controls="companion-window"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
        <MessageCircleQuestion aria-hidden="true" />
        {(notices.length > 0 || unread) && <span className="companion-dot" data-companion-dot="" aria-hidden="true" />}
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
            <button type="button" role="switch" aria-checked={wanted} data-companion-notices-switch="" onClick={toggleNotices}>{t("Point things out")}</button>
            {wanted && <button type="button" role="switch" aria-checked={auto} data-companion-auto-switch="" title={t("Starts a pre-mortem or a post-mortem by itself, at most once in five minutes. It uses your Claude plan.")} onClick={toggleAuto}>{t("Look into it by itself")}</button>}
          </div>
          <CompanionVoice companionId={view?.id ?? null} connected={connected} onAsk={sendSpoken} />
          {notices.length > 0 && (
            <ul className="companion-notices" aria-label={t("Things to look at")}>
              {notices.slice(0, NOTICES_SHOWN).map((notice) => {
                const words = noticeWords(notice, t);
                return (
                  <li key={notice.key} data-companion-notice={notice.kind}>
                    <span>{words.line}</span>
                    <button type="button" disabled={!connected} onClick={() => { ask(words.ask); dismissNotice(notice.key); }}>{t("Look into it")}</button>
                    <button type="button" className="companion-notice-dismiss" aria-label={t("Dismiss")} onClick={() => dismissNotice(notice.key)}><X aria-hidden="true" /></button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="companion-alert" role="alert">{error}</p>}
          <div className="companion-chat">
            {view && (
              <OrcaRoot className="companion-chat-root">
                <SessionChat key={view.id} botId={view.id} readOnly={false} connected={connected}
                  emptyText={t("Ask what this terminal is doing, or anything about this project.")} />
              </OrcaRoot>
            )}
          </div>
          <p className="companion-foot">{t("The companion reads this project. It changes nothing unless you press Allow on its card.")}</p>
        </section>
      )}
    </>
  );
}
