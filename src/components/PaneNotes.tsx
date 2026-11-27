/**
 * The note of one terminal (src/lib/paneNotes.ts): a button with the open-task count and the
 * first open task, and a panel (a bottom sheet on a phone) with the tasks as checkboxes, the
 * rest as text, and an Edit mode with the whole Markdown in a textarea. Everything floats over
 * the terminal surface: opening, folding or editing never refits the xterm grid. The note text
 * is data: it is shown as text, never as HTML.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { NotebookPen, Square, SquareCheck, X } from "lucide-react";

import "./PaneNotes.css";
import { PANE_NOTE_MAX, type PaneNote } from "../../shared/pane-notes.ts";
import { paneStorageId } from "../../shared/machines.ts";
import { composerDrafts } from "../lib/composerDraft.ts";
import { MAX_COMPOSER_CHARS } from "../lib/compose.ts";
import { useT, type Translate } from "../lib/i18n.ts";
import { useMachineId } from "../lib/machineContext.tsx";
import { isCloseKey, useModalFocus } from "../lib/modalFocus.ts";
import {
  PaneNoteError, acceptPaneNote, appendToDraft, editChanged, fetchPaneNote, foldedLine, meetConflict, noteBlocks, noteFoldKey,
  reloadPaneNote, resolveConflict, savePaneNote, setPaneNoteTask, startEdit, usePaneNote, withTaskDone, type NoteBlock, type NoteEdit,
} from "../lib/paneNotes.ts";

export interface PaneNotesProps {
  paneId: string;
  /** a watching viewer: reads the note, changes nothing */
  readOnly: boolean;
  /** the lens over the pane: the composer (and its draft) shows in the chat lens only */
  lens: "chat" | "terminal";
  /** switches the pane to the chat lens, where a task put in the message box waits */
  onOpenChat?: () => void;
}

const PHONE_QUERY = "(max-width: 640px)";

function usePhoneWidth(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.(PHONE_QUERY).matches === true);
  useEffect(() => {
    const media = window.matchMedia?.(PHONE_QUERY);
    if (!media) return;
    const onChange = (): void => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return phone;
}

/**
 * The fold state per terminal and viewer: a convenience, so a blocked storage only forgets it.
 * A phone never opens the sheet by itself: it would cover the terminal at every pane switch.
 */
function useFold(terminalId: string | null, phone: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (terminalId === null) return;
    try { setOpen(!phone && window.localStorage.getItem(noteFoldKey(terminalId)) === "1"); } catch { setOpen(false); }
    // the width only matters for the first read: turning a phone must not fold an open sheet
  }, [terminalId]);
  const change = useCallback((next: boolean) => {
    setOpen(next);
    if (terminalId === null) return;
    try {
      if (next) window.localStorage.setItem(noteFoldKey(terminalId), "1");
      else window.localStorage.removeItem(noteFoldKey(terminalId));
    } catch { /* kept for this page only */ }
  }, [terminalId]);
  return [open, change];
}

function errorText(error: unknown, t: Translate): string {
  if (error instanceof PaneNoteError) return error.serverMessage;
  return t("The note could not be reached. Check the connection and try again.");
}

/** The note shown with the boxes the owner just ticked, before the server answers. */
function shownNote(note: PaneNote, pending: ReadonlyMap<number, boolean>): PaneNote {
  return [...pending].reduce((current, [line, done]) => withTaskDone(current, line, done) ?? current, note);
}

interface NoteActions {
  pending: ReadonlyMap<number, boolean>;
  saving: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  toggleTask: (line: number, text: string, done: boolean) => void;
  save: () => void;
}

/** The two server changes the panel makes: a task box (shown at once, then the server's answer) and Save. */
function useNoteActions(paneId: string, readOnly: boolean, edit: NoteEdit | null, setEdit: Dispatch<SetStateAction<NoteEdit | null>>, t: Translate): NoteActions {
  const machineId = useMachineId();
  const [pending, setPending] = useState<ReadonlyMap<number, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTask = (line: number, text: string, done: boolean): void => {
    if (readOnly || pending.has(line)) return;
    setPending((current) => new Map([...current, [line, done]]));
    setError(null);
    setPaneNoteTask(paneId, line, done, text, machineId)
      .then((answer) => acceptPaneNote(machineId, paneId, answer))
      .catch((reason: unknown) => {
        if (reason instanceof PaneNoteError && reason.code === "note_changed") {
          setError(t("The note changed meanwhile. It is shown again: try once more."));
          void reloadPaneNote(machineId, paneId);
        } else setError(errorText(reason, t));
      })
      .finally(() => setPending((current) => new Map([...current].filter(([key]) => key !== line))));
  };

  const save = (): void => {
    if (edit === null || saving || readOnly) return;
    setSaving(true); setError(null);
    savePaneNote(paneId, edit.text, edit.base, machineId)
      .then((answer) => { acceptPaneNote(machineId, paneId, answer); setEdit(null); })
      .catch(async (reason: unknown) => {
        // only note_changed is a newer note; note_full or terminal_changed is said as the server says it
        if (!(reason instanceof PaneNoteError) || reason.code !== "note_changed") { setError(errorText(reason, t)); return; }
        try {
          const server = reason.note ?? (await fetchPaneNote(paneId, machineId)).note;
          setEdit((current) => (current === null ? current : meetConflict(current, server)));
        } catch (again) { setError(errorText(again, t)); }
      })
      .finally(() => setSaving(false));
  };

  return { pending, saving, error, setError, toggleTask, save };
}

export function PaneNotes({ paneId, readOnly, lens, onOpenChat }: PaneNotesProps) {
  const t = useT();
  const machineId = useMachineId();
  const entry = usePaneNote(paneId);
  const phone = usePhoneWidth();
  const [open, setOpen] = useFold(entry.note?.terminal_id ?? null, phone);
  const [edit, setEdit] = useState<NoteEdit | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const actions = useNoteActions(paneId, readOnly, edit, setEdit, t);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  // the panel takes the focus only when the viewer opened it, never when it opens restored
  const openedByUser = useRef(false);

  const close = useCallback(() => { setOpen(false); toggleRef.current?.focus({ preventScroll: true }); }, [setOpen]);
  useModalFocus(panelRef, { open: open && phone, onClose: close });
  useEffect(() => {
    if (open && openedByUser.current) panelRef.current?.focus({ preventScroll: true });
    openedByUser.current = false;
  }, [open]);
  useEffect(() => {
    if (status === null) return;
    const timer = window.setTimeout(() => setStatus(null), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const note = entry.note;
  // a callback ref: the anchor mounts only once the note has loaded
  const [slot, setSlot] = useState<Element | null>(null);
  const anchorRef = useCallback((node: HTMLDivElement | null) => {
    setSlot(node?.closest(".dock-group")?.querySelector("[data-pane-notes-slot]") ?? null);
  }, []);
  if (note === null || entry.status === "missing") return null;
  const next = foldedLine(entry.summary);
  const count = entry.summary?.open ?? 0;
  const label = count === 0 ? t("Terminal note")
    : count === 1 ? t("Terminal note: {n} open task", { n: count }) : t("Terminal note: {n} open tasks", { n: count });

  const putInMessageBox = (text: string): void => {
    const key = `termweave:composer-draft:${paneStorageId(machineId, paneId)}`;
    const draft = appendToDraft(composerDrafts.read(key).text, text, MAX_COMPOSER_CHARS);
    if (draft === null) { actions.setError(t("The message box is full: the task was not added.")); return; }
    composerDrafts.set(key, draft);
    setOpen(false);
    setStatus(t("Put in the message box. It is not sent."));
    if (lens === "terminal" && onOpenChat) onOpenChat();
    else toggleRef.current?.focus({ preventScroll: true });
  };
  const onPanelKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (!isCloseKey(event.nativeEvent)) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  const panel = open && (
    <NotePanel panelRef={panelRef} paneId={paneId} phone={phone} readOnly={readOnly} note={shownNote(note, actions.pending)} edit={edit}
      actions={actions} t={t} onKeyDown={onPanelKey} onClose={close} onPut={putInMessageBox}
      onEdit={(value) => { actions.setError(null); setEdit(value); }} startFrom={note} />
  );
  // the button sits in its terminal group's tab row (DockGroup's slot), so it never covers the terminal's
  // first line; with no slot (a mount outside a group) it floats over the surface as the panel does
  const toggle = (
    <>
      <button ref={toggleRef} type="button" className="pane-notes-toggle" aria-label={label} title={next ?? label}
        aria-expanded={open} aria-controls={`pane-notes-${paneId}`} data-pane-notes-toggle="" data-open-tasks={count}
        onClick={() => { openedByUser.current = !open; setOpen(!open); }}>
        <NotebookPen aria-hidden="true" />
        {count > 0 && <span className="pane-notes-count" aria-hidden="true">{count}</span>}
        {!open && next !== null && <span className="pane-notes-next" aria-hidden="true" data-pane-notes-next="">{next}</span>}
      </button>
    </>
  );
  return (
    <div ref={anchorRef} className="pane-notes-anchor" data-pane-notes="" data-pane-id={paneId} data-slotted={slot !== null ? "" : undefined}>
      {slot !== null ? createPortal(toggle, slot) : toggle}
      {status !== null && !open && <p className="pane-notes-status" role="status">{status}</p>}
      {/* a phone's sheet and scrim go to the body: a positioned ancestor would pin or clip them */}
      {phone && open ? createPortal(<><div className="pane-notes-scrim" aria-hidden="true" onClick={close} />{panel}</>, document.body) : panel}
    </div>
  );
}

interface NotePanelProps {
  panelRef: MutableRefObject<HTMLElement | null>;
  paneId: string;
  phone: boolean;
  readOnly: boolean;
  /** the note as shown, the boxes just ticked included */
  note: PaneNote;
  /** the note as stored: an edit starts from it */
  startFrom: PaneNote;
  edit: NoteEdit | null;
  actions: NoteActions;
  t: Translate;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onClose: () => void;
  onPut: (text: string) => void;
  onEdit: (edit: NoteEdit | null) => void;
}

function NotePanel({ panelRef, paneId, phone, readOnly, note, startFrom, edit, actions, t, onKeyDown, onClose, onPut, onEdit }: NotePanelProps) {
  const editing = edit !== null && !readOnly;
  return (
    <section ref={panelRef} id={`pane-notes-${paneId}`} className="pane-notes-panel" role="dialog" aria-modal={phone ? true : undefined}
      aria-labelledby={`pane-notes-title-${paneId}`} tabIndex={-1} data-pane-notes-panel="" data-read-only={readOnly ? "" : undefined}
      onKeyDown={onKeyDown}>
      <div className="pane-notes-heading">
        <h2 id={`pane-notes-title-${paneId}`}>{t("Terminal note")}</h2>
        {!readOnly && edit === null && <button type="button" className="btn" data-pane-notes-edit="" onClick={() => onEdit(startEdit(startFrom))}>{t("Edit")}</button>}
        <button type="button" className="btn" aria-label={t("Close")} title={t("Close")} data-pane-notes-close="" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="pane-notes-body">
        {actions.error !== null && <p className="pane-notes-alert" role="alert">{actions.error}</p>}
        {editing
          ? <NoteEditor edit={edit} saving={actions.saving} onChange={(text) => onEdit({ ...edit, text })} onResolve={(choice) => onEdit(resolveConflict(edit, choice))} t={t} />
          : <NoteView note={note} readOnly={readOnly} pending={actions.pending} onToggle={actions.toggleTask} onPut={onPut} t={t} />}
      </div>
      {editing && (
        <div className="pane-notes-actions">
          <button type="button" className="btn" disabled={actions.saving} data-pane-notes-cancel="" onClick={() => onEdit(null)}>{t("Cancel")}</button>
          <button type="button" className="btn btn-primary" data-pane-notes-save="" disabled={actions.saving || edit.conflict !== null || !editChanged(edit)} onClick={actions.save}>
            {actions.saving ? t("Saving…") : t("Save")}
          </button>
        </div>
      )}
    </section>
  );
}

interface NoteViewProps {
  note: PaneNote;
  readOnly: boolean;
  pending: ReadonlyMap<number, boolean>;
  onToggle: (line: number, text: string, done: boolean) => void;
  onPut: (text: string) => void;
  t: Translate;
}

function NoteView({ note, readOnly, pending, onToggle, onPut, t }: NoteViewProps) {
  const blocks = noteBlocks(note.text);
  if (blocks.length === 0) return <p className="pane-notes-empty" data-pane-notes-empty="">{t("Write here what this terminal is for and what to do next: its agent and the bots can read it.")}</p>;
  return (
    <ul className="pane-notes-list">
      {blocks.map((block) => <li key={`${block.kind}:${block.line}`}><NoteLine block={block} readOnly={readOnly} busy={pending.has(block.line)} onToggle={onToggle} onPut={onPut} t={t} /></li>)}
    </ul>
  );
}

interface NoteLineProps { block: NoteBlock; readOnly: boolean; busy: boolean; onToggle: NoteViewProps["onToggle"]; onPut: NoteViewProps["onPut"]; t: Translate }

function NoteLine({ block, readOnly, busy, onToggle, onPut, t }: NoteLineProps) {
  if (block.kind === "text") return <p className={`pane-notes-text${block.heading ? " is-heading" : ""}`}>{block.text}</p>;
  if (block.kind === "agent") {
    return (
      <div className="pane-notes-agent" data-pane-notes-agent="" data-author={block.author}>
        <span className="pane-notes-author">{block.author}</span>
        <time dateTime={block.at} title={block.at}>{shortTime(block.at)}</time>
        <span className="visually-hidden">{t("Agent")}</span>
        <span className="pane-notes-agent-text">{block.text}</span>
      </div>
    );
  }
  return (
    <div className={`pane-notes-task${block.done ? " is-done" : ""}`}>
      {readOnly ? (
        <span className="pane-notes-task-readonly" data-pane-notes-task={block.line}>
          <span className="pane-notes-task-mark" role="img" aria-label={block.done ? t("Done") : t("Not done")}>
            {block.done ? <SquareCheck aria-hidden="true" /> : <Square aria-hidden="true" />}
          </span>
          <span className="pane-notes-task-text">{block.text}</span>
        </span>
      ) : (
        // the box sits inside its label: no id, so split panes showing the same line never share one
        <label>
          <input type="checkbox" checked={block.done} disabled={busy} data-pane-notes-task={block.line}
            onChange={(event) => onToggle(block.line, block.text, event.target.checked)} />
          <span className="pane-notes-task-text">{block.text}</span>
        </label>
      )}
      {!readOnly && !block.done && block.text !== "" && (
        <button type="button" className="pane-notes-put" data-pane-notes-put={block.line}
          aria-label={t("Put in message box: {task}", { task: block.text })} title={t("Put in message box")} onClick={() => onPut(block.text)}>
          {t("Put in message box")}
        </button>
      )}
    </div>
  );
}

interface NoteEditorProps { edit: NoteEdit; saving: boolean; onChange: (text: string) => void; onResolve: (choice: "mine" | "theirs") => void; t: Translate }

function NoteEditor({ edit, saving, onChange, onResolve, t }: NoteEditorProps) {
  return (
    <div className="pane-notes-editor">
      {edit.conflict !== null && (
        <div className="pane-notes-conflict" role="alert" data-pane-notes-conflict="">
          <p>{t("This note changed while you were editing. Your text is kept below.")}</p>
          <div className="pane-notes-actions">
            <button type="button" className="btn" data-pane-notes-keep-mine="" onClick={() => onResolve("mine")}>{t("Keep my text")}</button>
            <button type="button" className="btn" data-pane-notes-take-theirs="" onClick={() => onResolve("theirs")}>{t("Use the new version")}</button>
          </div>
          <details>
            <summary>{t("Show the new version")}</summary>
            <pre>{edit.conflict.text}</pre>
          </details>
        </div>
      )}
      <textarea value={edit.text} maxLength={PANE_NOTE_MAX} disabled={saving} aria-label={t("Note text (Markdown)")} data-pane-notes-text=""
        spellCheck={false} rows={10} onChange={(event) => onChange(event.target.value)} />
      <span className="pane-notes-meta">{t("{count} of {max} characters", { count: edit.text.length.toLocaleString(), max: PANE_NOTE_MAX.toLocaleString() })}</span>
    </div>
  );
}

/** An agent line's time as the viewer's own short date and time; the stored text when it is not a date. */
function shortTime(at: string): string {
  const when = new Date(at);
  return Number.isNaN(when.getTime()) ? at : when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
