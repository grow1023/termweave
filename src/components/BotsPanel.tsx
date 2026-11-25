import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Bot as BotIcon, MessageSquare, Pause, Play, Plus, SquareTerminal, Trash2, X } from "lucide-react";

import "./BotsPanel.css";
import { useT } from "../lib/i18n.ts";
import { BOT_ITEM_OPEN, type Bot, type BotAgent, type BotItem, type BotItemStatus, type BotPaneAction, type BotsView, type BotWorkerStatus } from "../../shared/bots/types.ts";

/** Bots: agents that take jobs from their chat and schedules and hand code work to workers (server/bots). */
export function BotsPanel({ readOnly, onClose, onOpenPane, initialBot = null, initialCreate = false }: { readOnly: boolean; onClose: () => void; onOpenPane: (paneId: string) => void; initialBot?: string | null; initialCreate?: boolean }) {
  const t = useT();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<BotsView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialBot);
  const [creating, setCreating] = useState(initialCreate);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surface = dialog.current;
    surface?.showModal();
    return () => { surface?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/bots", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const next = await response.json() as BotsView;
      setView(next);
      setSelected((current) => current ?? next.bots[0]?.id ?? null);
    } catch { setFailed(t("Could not load bots. Try again.")); }
  }, [t]);
  useEffect(() => {
    void load();
    const reload = (): void => { void load(); };
    window.addEventListener("termweave:bots-changed", reload);
    return () => window.removeEventListener("termweave:bots-changed", reload);
  }, [load]);

  /** every change goes through here: one at a time, and its refusal is shown as it came */
  const act = async (url: string, method: string, body?: unknown): Promise<unknown> => {
    setBusy(true); setFailed(null);
    try {
      const response = await fetch(url, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? String(response.status));
      await load();
      return result;
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
      return null;
    } finally { setBusy(false); }
  };
  const openChat = async (bot: Bot): Promise<void> => {
    const result = await act(`/api/bots/${bot.id}/open`, "POST") as { pane_id?: string } | null;
    if (result?.pane_id) { onOpenPane(result.pane_id); onClose(); }
  };

  const bot = view?.bots.find((entry) => entry.id === selected) ?? null;
  const locked = readOnly || busy;

  return createPortal(<dialog ref={dialog} className="bots-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="bots-header">
      <div><h2 id={`${id}-title`} className="ko-text">{t("Bots")}</h2><p className="ko-text">{t("Bots take jobs from their chat and schedules, and hand code work to workers in their own worktrees.")}</p></div>
      <button type="button" className="icon-button" aria-label={t("Close")} disabled={busy} onClick={onClose} autoFocus><X aria-hidden="true" /></button>
    </header>
    <div className="bots-body">
      {failed && <p className="bots-notice ko-text" role="alert">{failed}</p>}
      {view === null && !failed && <p className="bots-muted">{t("Loading…")}</p>}
      {view && (
        <div className="bots-tabs" role="tablist" aria-label={t("Bots")}>
          {view.bots.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={!creating && entry.id === selected} onClick={() => { setCreating(false); setSelected(entry.id); }}>
              <BotIcon aria-hidden="true" />{entry.name}
              {view.items.some((item) => item.botId === entry.id && item.status === "needs_you") && <span className="bots-dot is-needs" aria-label={t("Needs you")} />}
            </button>
          ))}
          {!readOnly && <button type="button" role="tab" aria-selected={creating || view.bots.length === 0} onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t("New bot")}</button>}
        </div>
      )}
      {view && (creating || view.bots.length === 0) && !readOnly && (
        <CreateBot busy={busy} onCreate={async (input) => {
          const created = await act("/api/bots", "POST", input) as Bot | null;
          if (created?.id) { setCreating(false); setSelected(created.id); }
        }} />
      )}
      {view && bot && !creating && <BotDetail bot={bot} view={view} locked={locked} readOnly={readOnly} act={act} onOpenChat={() => void openChat(bot)} onOpenPane={(paneId) => { onOpenPane(paneId); onClose(); }} onRemoved={() => setSelected(null)} />}
    </div>
  </dialog>, document.body);
}

function CreateBot({ busy, onCreate }: { busy: boolean; onCreate: (input: { name: string; agent: BotAgent; purpose: string; repo: string | null }) => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState("");
  const [agent, setAgent] = useState<BotAgent>("claude");
  const [purpose, setPurpose] = useState("");
  const [repo, setRepo] = useState("");
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void onCreate({ name: name.trim(), agent, purpose: purpose.trim(), repo: repo.trim() || null });
  };
  return (
    <form className="bots-form" onSubmit={submit}>
      <h3 className="ko-text">{t("New bot")}</h3>
      <label className="bots-field">{t("Name")}<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} autoComplete="off" /></label>
      <label className="bots-field">{t("Agent")}
        <select value={agent} onChange={(event) => setAgent(event.target.value as BotAgent)}><option value="claude">Claude Code</option><option value="codex">Codex</option></select>
      </label>
      <label className="bots-field">{t("What it is for")}<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} placeholder={t("e.g. Keep the test suite green and fix what breaks.")} /></label>
      <label className="bots-field">{t("Default project folder (optional)")}<input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="~/projects/app" autoComplete="off" spellCheck={false} /></label>
      <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ""}>{t("Create bot")}</button>
    </form>
  );
}

const ITEM_LABEL: Record<BotItemStatus, string> = {
  planned: "Planned",
  working: "Working",
  waiting: "Waiting",
  needs_you: "Needs you",
  done: "Done",
  canceled: "Canceled",
};
export const WORKER_LABEL: Record<BotWorkerStatus, string> = {
  starting: "Starting",
  working: "Working",
  blocked: "Waiting for you",
  done: "Done",
  failed: "Stopped",
};

function BotDetail({ bot, view, locked, readOnly, act, onOpenChat, onOpenPane, onRemoved }: {
  bot: Bot; view: BotsView; locked: boolean; readOnly: boolean;
  act: (url: string, method: string, body?: unknown) => Promise<unknown>;
  onOpenChat: () => void; onOpenPane: (paneId: string) => void; onRemoved: () => void;
}) {
  const t = useT();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const items = view.items.filter((item) => item.botId === bot.id);
  const open = items.filter((item) => BOT_ITEM_OPEN.has(item.status)).sort((a, b) => Number(b.status === "needs_you") - Number(a.status === "needs_you") || b.n - a.n);
  const closed = items.filter((item) => !BOT_ITEM_OPEN.has(item.status)).slice(-5).reverse();
  const workers = view.workers.filter((worker) => worker.botId === bot.id).slice(-8).reverse();
  const automations = view.automations.filter((automation) => automation.botId === bot.id);
  const base = `/api/bots/${bot.id}`;
  return (
    <div className="bots-detail">
      <div className="bots-actions">
        <span className="bots-state"><span className={`bots-dot${bot.paused ? "" : bot.paneId ? " is-live" : ""}`} aria-hidden="true" />
          {t(bot.paused ? "Paused" : bot.paneId ? "Running" : "Starts on the next message")} · {bot.agent === "claude" ? "Claude Code" : "Codex"}</span>
        <button type="button" className="btn btn-primary" disabled={locked || bot.paused} onClick={onOpenChat}><MessageSquare aria-hidden="true" />{t("Open chat")}</button>
        <button type="button" className="btn" disabled={locked} onClick={() => void act(base, "PATCH", { paused: !bot.paused })}>
          {bot.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{t(bot.paused ? "Resume" : "Pause")}
        </button>
        {confirmRemove
          ? <button type="button" className="btn btn-danger" disabled={locked} onClick={() => void act(base, "DELETE").then(onRemoved)}>{t("Remove {name}", { name: bot.name })}</button>
          : <button type="button" className="icon-button" aria-label={t("Remove bot")} title={t("Remove bot")} disabled={locked} onClick={() => setConfirmRemove(true)}><Trash2 aria-hidden="true" /></button>}
      </div>
      {confirmRemove && <p className="bots-muted ko-text">{t("Its home folder, memory and worktrees stay on disk.")}</p>}
      {bot.repo && <p className="bots-muted bots-path" title={bot.repo}>{bot.repo}</p>}

      <section aria-labelledby={`${bot.id}-items`}>
        <h3 id={`${bot.id}-items`} className="ko-text">{t("Items")}</h3>
        {open.length === 0 && <p className="bots-muted ko-text">{t("No open items. Ask the bot in its chat to start one.")}</p>}
        <ul className="bots-list">
          {open.map((item) => <ItemRow key={item.n} item={item} locked={locked} onAnswer={(answer) => void act(`${base}/items/${item.n}`, "POST", { answer })} />)}
          {closed.map((item) => <ItemRow key={item.n} item={item} locked onAnswer={() => {}} />)}
        </ul>
      </section>

      <section aria-labelledby={`${bot.id}-workers`}>
        <h3 id={`${bot.id}-workers`} className="ko-text">{t("Workers")}</h3>
        {workers.length === 0 && <p className="bots-muted ko-text">{t("No workers yet.")}</p>}
        <ul className="bots-list">
          {workers.map((worker) => (
            <li key={worker.id}>
              <div className="bots-row">
                <span className={`bots-label is-${worker.status}`}>{t(WORKER_LABEL[worker.status])}</span>
                <span className="bots-title">{worker.itemN !== null ? `#${worker.itemN} · ` : ""}{worker.branch}</span>
                {worker.paneId && worker.status !== "failed" && <button type="button" className="icon-button" aria-label={t("Open its terminal")} title={t("Open its terminal")} onClick={() => onOpenPane(worker.paneId!)}><SquareTerminal aria-hidden="true" /></button>}
              </div>
              {worker.result && worker.status === "failed" && <small className="ko-text">{worker.result}</small>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${bot.id}-schedules`}>
        <h3 id={`${bot.id}-schedules`} className="ko-text">{t("Schedules")}</h3>
        <ul className="bots-list">
          {automations.map((automation) => (
            <li key={automation.id}>
              <div className="bots-row">
                <span className="bots-title">{automation.name}</span>
                <code>{automation.schedule.value}</code>
                <label className="bots-toggle"><input type="checkbox" checked={automation.enabled} disabled={locked} onChange={(event) => void act(`${base}/automations/${automation.id}`, "PATCH", { enabled: event.target.checked })} />{t("On")}</label>
                <button type="button" className="icon-button" aria-label={t("Remove schedule")} title={t("Remove schedule")} disabled={locked} onClick={() => void act(`${base}/automations/${automation.id}`, "DELETE")}><Trash2 aria-hidden="true" /></button>
              </div>
              <small className="ko-text">{automation.enabled && automation.nextRunAt ? t("Next: {time}", { time: new Date(automation.nextRunAt).toLocaleString() }) : t("Turned off")} · {automation.prompt}</small>
            </li>
          ))}
        </ul>
        {/* stays mounted while a request runs: a refused schedule keeps what was typed */}
        {!readOnly && <AddSchedule disabled={locked} onAdd={(input) => act(`${base}/automations`, "POST", input)} />}
      </section>
    </div>
  );
}

export function ItemRow({ item, locked, onAnswer }: { item: BotItem; locked: boolean; onAnswer: (answer: string) => void }) {
  const t = useT();
  const [answer, setAnswer] = useState("");
  const last = item.comments.at(-1);
  return (
    <li className={item.status === "needs_you" ? "is-needs" : undefined}>
      <div className="bots-row">
        <span className={`bots-label is-${item.status}`}>{t(ITEM_LABEL[item.status])}</span>
        <span className="bots-title ko-text">#{item.n} {item.title}</span>
      </div>
      {item.status === "needs_you" && item.action && <ActionAsk action={item.action} />}
      {item.status === "needs_you" && !item.action && item.ask && <p className="bots-ask ko-text">{item.ask}</p>}
      {item.status === "needs_you" && !locked && (
        <div className="bots-answers">
          {item.options.map((option) => <button key={option} type="button" className="btn" onClick={() => onAnswer(option)}>{item.action ? (option === "Approve" ? t("Approve") : t("Deny")) : option}</button>)}
          {!item.action && <form onSubmit={(event) => { event.preventDefault(); if (answer.trim()) { onAnswer(answer.trim()); setAnswer(""); } }}>
            <input value={answer} onChange={(event) => setAnswer(event.target.value)} aria-label={t("Your answer")} placeholder={t("Or write an answer…")} />
            <button type="submit" className="btn" disabled={answer.trim() === ""}>{t("Send")}</button>
          </form>}
        </div>
      )}
      {item.status === "waiting" && item.waitingOn && <small className="ko-text">{t("Waiting on: {what}", { what: item.waitingOn })}</small>}
      {item.status !== "needs_you" && last && <small className="ko-text">{last.text}</small>}
    </li>
  );
}

/** What an approval runs, shown from the action itself: the bot cannot word it differently. */
function ActionAsk({ action }: { action: BotPaneAction }) {
  const t = useT();
  const question = action.kind === "send" ? t("Type this into {where} and press Enter?", { where: action.where })
    : action.kind === "keys" ? t("Press {keys} in {where}?", { keys: action.keys.join(" "), where: action.where })
    : t("Close {where}?", { where: action.where });
  return <div className="bots-ask">
    <p className="ko-text">{question}</p>
    {action.kind === "send" && <pre className="bots-action-text">{action.text}</pre>}
  </div>;
}

function AddSchedule({ disabled, onAdd }: { disabled: boolean; onAdd: (input: { name: string; prompt: string; schedule: string; timezone: string; once: boolean }) => Promise<unknown> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * 1-5");
  const [prompt, setPrompt] = useState("");
  const [once, setOnce] = useState(false);
  if (!open) return <button type="button" className="btn" disabled={disabled} onClick={() => setOpen(true)}><Plus aria-hidden="true" />{t("Add schedule")}</button>;
  return (
    <form className="bots-form" onSubmit={(event) => {
      event.preventDefault();
      void onAdd({ name: name.trim(), prompt: prompt.trim(), schedule: schedule.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, once }).then((result) => { if (result) { setOpen(false); setName(""); setPrompt(""); } });
    }}>
      <label className="bots-field">{t("Name")}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} /></label>
      <label className="bots-field">{t("When (cron: minute hour day month weekday)")}<input value={schedule} onChange={(event) => setSchedule(event.target.value)} required spellCheck={false} /></label>
      <label className="bots-field">{t("What to do")}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} required /></label>
      <label className="bots-toggle"><input type="checkbox" checked={once} onChange={(event) => setOnce(event.target.checked)} />{t("Only once")}</label>
      <div className="bots-row"><button type="submit" className="btn btn-primary" disabled={disabled || prompt.trim() === ""}>{t("Add schedule")}</button><button type="button" className="btn" onClick={() => setOpen(false)}>{t("Cancel")}</button></div>
    </form>
  );
}
