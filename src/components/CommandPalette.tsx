import { paneNumber } from "../lib/paneNumber.ts";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Bell, Bold, FolderOpen, LogOut, MessageSquarePlus, Monitor, PanelLeft, RefreshCw, Settings, SunMoon, SwitchCamera, X } from "lucide-react";

import "./CommandPalette.css";

import type { Machine } from "../../shared/machines.ts";
import type { AppActions, PaneView } from "../lib/actions.ts";
import { paletteEntries, paletteStart, searchPalette, type PaletteEntry } from "./navModel.ts";
import { SHORTCUTS, formatKeys, type ShortcutId } from "../lib/shortcuts.ts";
import { AgentMark } from "./AgentMark.tsx";
import { displayPaneTitle, StatusBadge } from "./Sidebar.tsx";
import { placeLine } from "../lib/paneName.ts";
import { useT } from "../lib/i18n.ts";
import { paneStorageId } from "../../shared/machines.ts";

const RECENT_KEY = "termweave:recent-panes";
const RECENT_LIMIT = 8;

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** every PC: a pane is found wherever it runs, not only on the PC open now */
  machines: Machine[];
  selectedMachineId: string;
  selectedPaneId: string | null;
  view: PaneView;
  actions: AppActions;
  onSelectTarget: (machineId: string, paneId: string) => void;
}

interface PaletteAction {
  id: string;
  label: string;
  icon: ComponentType;
  shortcut?: ShortcutId;
  run: () => void;
}

function loadRecentPanes(machineId: string): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(machineId === "local" ? RECENT_KEY : `${RECENT_KEY}:${machineId}`) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberPane(paneId: string, current: readonly string[], machineId: string): string[] {
  const recent = [paneId, ...current.filter((id) => id !== paneId)].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(machineId === "local" ? RECENT_KEY : `${RECENT_KEY}:${machineId}`, JSON.stringify(recent));
  } catch {
    /* private mode: recent ordering remains available for this page */
  }
  return recent;
}

/** Each PC's own recent list, as one rank per pane: the lists interleave, most recent first. */
function recentRanks(lists: Readonly<Record<string, readonly string[]>>): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const [machineId, ids] of Object.entries(lists)) ids.forEach((id, index) => ranks.set(paneStorageId(machineId, id), index));
  return ranks;
}

function cwdBasename(path: string | null | undefined): string {
  if (!path) return "";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) ?? path;
}

function ShortcutHint({ shortcutId }: { shortcutId?: ShortcutId }) {
  if (!shortcutId) return null;
  const shortcut = SHORTCUTS.find((item) => item.id === shortcutId);
  if (!shortcut) return null;
  return <span className="palette-shortcut" aria-label={formatKeys(shortcut.keys).join(" + ")}>{formatKeys(shortcut.keys).map((key) => <kbd className="kbd" key={key}>{key}</kbd>)}</span>;
}

export function CommandPalette({ open, onClose, machines, selectedMachineId, selectedPaneId, view, actions, onSelectTarget }: CommandPaletteProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const machineIds = machines.map((machine) => machine.id).join("\n");
  const loadAll = (): Record<string, string[]> => Object.fromEntries(machines.map((machine) => [machine.id, loadRecentPanes(machine.id)]));
  const [recentPaneIds, setRecentPaneIds] = useState<Record<string, string[]>>(loadAll);
  const inputRef = useRef<HTMLInputElement>(null);

  // Terminal attachment can move focus after the palette opens. Escape belongs to
  // this modal even then, and must not leak through to the underlying terminal.
  useLayoutEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", dismiss, true);
    return () => window.removeEventListener("keydown", dismiss, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    setRecentPaneIds(loadAll());
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, machineIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedPaneId === null) return;
    setRecentPaneIds((current) => ({ ...current, [selectedMachineId]: rememberPane(selectedPaneId, current[selectedMachineId] ?? [], selectedMachineId) }));
  }, [selectedPaneId, selectedMachineId]);

  const paletteActions = useMemo<PaletteAction[]>(() => [
    { id: "new", label: t("New session"), icon: MessageSquarePlus, shortcut: "new-session", run: actions.openNewSession },
    { id: "view", label: t(view === "chat" ? "Switch to terminal" : "Switch to chat"), icon: SwitchCamera, shortcut: "toggle-view", run: actions.toggleView },
    { id: "sidebar", label: t("Toggle sidebar"), icon: PanelLeft, shortcut: "toggle-sidebar", run: actions.toggleSidebar },
    { id: "theme", label: t("Toggle theme"), icon: SunMoon, run: actions.toggleTheme },
    { id: "bionic", label: t("Toggle bionic reading"), icon: Bold, shortcut: "toggle-bionic", run: actions.toggleBionic },
    { id: "settings", label: t("Settings"), icon: Settings, shortcut: "settings", run: actions.openSettings },
    { id: "add-pc", label: t("Add PC"), icon: Monitor, run: actions.openAddPc },
    ...(actions.enableNotifications ? [{ id: "notifications", label: t("Enable notifications"), icon: Bell, run: actions.enableNotifications }] : []),
    ...(actions.lock ? [{ id: "lock", label: t("Sign out"), icon: LogOut, run: actions.lock }] : []),
    ...(actions.openFiles ? [{ id: "files", label: t("Browse files"), icon: FolderOpen, run: actions.openFiles }] : []),
    // re-reads the PCs and their terminals; the header's button reloads the web page itself
    { id: "refresh", label: t("Reload PC list"), icon: RefreshCw, run: actions.refresh },
  ], [actions, view, t]);

  const entries = useMemo(() => paletteEntries(machines), [machines]);
  // typed: every match on every PC; not yet: what waits on the user, then the few opened last
  const sections = useMemo<Array<{ id: string; heading: string; entries: PaletteEntry[] }>>(() => {
    if (query.trim()) return [{ id: "panes", heading: t("Panes"), entries: searchPalette(query, entries) }];
    const start = paletteStart(entries, recentRanks(recentPaneIds));
    return [{ id: "waiting", heading: t("Needs you"), entries: start.waiting }, { id: "recent", heading: t("Recent panes"), entries: start.recent }];
  }, [query, recentPaneIds, entries, t]);
  const panes = useMemo(() => sections.flatMap((section) => section.entries), [sections]);
  // P-numbers and workspace names repeat across PCs: with more than one, each row names its PC
  const manyPcs = new Set(entries.map((entry) => entry.machineId)).size > 1;

  const visibleActions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? paletteActions.filter((action) => action.label.toLocaleLowerCase().includes(needle)) : paletteActions;
  }, [paletteActions, query]);
  const itemCount = panes.length + visibleActions.length;

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, itemCount - 1)));
  }, [itemCount]);

  if (!open) return null;

  const runPane = (entry: PaletteEntry): void => {
    setRecentPaneIds((current) => ({ ...current, [entry.machineId]: rememberPane(entry.pane.pane_id, current[entry.machineId] ?? [], entry.machineId) }));
    onSelectTarget(entry.machineId, entry.pane.pane_id);
    onClose();
  };
  const runAction = (action: PaletteAction): void => {
    action.run();
    onClose();
  };
  const activate = (index: number): void => {
    if (index < panes.length) {
      const pane = panes[index];
      if (pane) runPane(pane);
      return;
    }
    const action = visibleActions[index - panes.length];
    if (action) runAction(action);
  };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowDown" && itemCount > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % itemCount);
    } else if (event.key === "ArrowUp" && itemCount > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + itemCount) % itemCount);
    } else if (event.key === "Enter" && itemCount > 0) {
      event.preventDefault();
      activate(activeIndex);
    }
  };

  return (
    <div className="modal-scrim palette-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="menu command-palette" role="dialog" aria-modal="true" aria-label={t("Command palette")} onKeyDown={onKeyDown}>
        <div className="palette-search">
          <input ref={inputRef} className="input" type="search" value={query} placeholder={t("Search panes on every PC, and actions…")} aria-label={t("Search panes and actions")} aria-controls="palette-results" aria-activedescendant={itemCount ? `palette-item-${activeIndex}` : undefined} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} />
          <button type="button" className="icon-button" aria-label={t("Close command palette")} onClick={onClose}><X /></button>
        </div>
        <div className="palette-results" id="palette-results" role="listbox">
          {sections.map((section, sectionIndex) => {
            const offset = sections.slice(0, sectionIndex).reduce((sum, previous) => sum + previous.entries.length, 0);
            return section.entries.length > 0 && <div key={section.id} role="group" aria-label={section.heading}>
              <div className="menu-heading" aria-hidden="true">{section.heading}</div>
              {section.entries.map((entry, entryIndex) => {
                const index = offset + entryIndex;
                const { pane } = entry;
                const selected = entry.machineId === selectedMachineId && pane.pane_id === selectedPaneId;
                const place = placeLine(entry.workspaceLabel ?? t("Unknown workspace"), cwdBasename(pane.foreground_cwd ?? pane.cwd) || t("Unknown working directory"));
                return (
                  <button key={entry.key} id={`palette-item-${index}`} type="button" role="option" className="menu-item palette-pane" aria-selected={activeIndex === index} onMouseEnter={() => setActiveIndex(index)} onClick={() => runPane(entry)}>
                    <span className="palette-mark"><AgentMark agent={pane.agent ?? "shell"} /></span>
                    <span className="menu-item-main"><span className="palette-row-title"><span className="pane-number">{paneNumber(pane)}</span> {displayPaneTitle(pane)}{selected && <span className="palette-selected">{t("Selected")}</span>}</span><span className="palette-row-subtitle">{manyPcs ? `${entry.machineName} · ${place}` : place}</span></span>
                    <StatusBadge status={pane.agent_status} />
                  </button>
                );
              })}
            </div>;
          })}
          {visibleActions.length > 0 && <div className="menu-heading">{t("Actions")}</div>}
          {visibleActions.map((action, actionIndex) => {
            const index = panes.length + actionIndex;
            const Icon = action.icon;
            return <button key={action.id} id={`palette-item-${index}`} type="button" role="option" className="menu-item" aria-selected={activeIndex === index} onMouseEnter={() => setActiveIndex(index)} onClick={() => runAction(action)}><Icon /><span className="menu-item-main">{action.label}</span><ShortcutHint shortcutId={action.shortcut} /></button>;
          })}
          {itemCount === 0 && <p className="palette-empty" role="status">{t("No matching panes or actions")}</p>}
        </div>
      </section>
    </div>
  );
}
