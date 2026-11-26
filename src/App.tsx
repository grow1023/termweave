import { initialPaneView, readPaneView, writePaneView } from "./lib/paneView.ts";
import { adjacentWorkspacePane } from "./lib/workspaceNavigation.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, LogOut, Menu, MessageSquare, MoreHorizontal, Orbit, PanelLeft, Search, SquareTerminal, Users, X } from "lucide-react";

import type { AgentStatus, ClientRole, ServerMessage, AccessRefusal, HealthAuth, HerdrPane } from "../shared/protocol.ts";
import { ApiError, authenticate, fetchHealth, fetchBridgeHealth, fetchMachines, fetchSession, movePane as movePaneRequest, pairDevice, swapPanes as swapPanesRequest, sendTestPush, signOut, type HealthInfo } from "./lib/api.ts";
import { deviceLabel, takePairCode } from "./lib/phone.ts";
import { displayPaneTitle } from "./components/Sidebar.tsx";
import { SplitTerminals } from "./components/SplitTerminals.tsx";
import { initialWorkspaceLayout, swapStoredLayout } from "./lib/sessionLayout.ts";
import { AccessGate } from "./components/AccessGate.tsx";
import { AgentMark } from "./components/AgentMark.tsx";
import { NewSessionDialog } from "./components/NewSessionDialog.tsx";
import { OpenRigPanel } from "./components/OpenRigPanel.tsx";
import { FleetPanel } from "./components/FleetPanel.tsx";
import { observeFleetRuns } from "./lib/fleetTelemetry.ts";
import { TerminalNotificationCenter } from "./components/TerminalNotificationsPanel.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { MachineContext } from "./lib/machineContext.tsx";
import { MachineActionBanner, MachineSidebar } from "./components/MachineSidebar.tsx";
import { MachineDialog } from "./components/MachineDialog.tsx";
import { focusWorkspaceListToggle } from "./lib/focus.ts";
import type { PaneMoveRequest, PaneMoveResult, PaneSwapRequest } from "../shared/paneMove.ts";
import { paneStorageId, type Machine, type MachineEvent } from "../shared/machines.ts";
import { takeAuthTokenFromUrl } from "./lib/authLink.ts";
import { applyPaneStatus } from "./lib/snapshot.ts";
import { SnapshotRequests } from "./lib/snapshotRequests.ts";
import { alertPrefs, useSettings, type DefaultView } from "./lib/settings.ts";
import { useShortcuts } from "./lib/shortcuts.ts";
import type { AppActions, PaneView } from "./lib/actions.ts";
import {
  notificationState,
  requestNotificationPermission,
  shouldNotifyStatus,
  alertsAllow,
  showPaneEndedNotification,
  showPaneStatusNotification,
  type NotificationState,
} from "./lib/notifications.ts";
import { ensurePushSubscription, pushSupported, removePushSubscription } from "./lib/push.ts";
import { onNotificationTarget } from "./lib/notificationTarget.ts";
import { useUpdates } from "./lib/updates.ts";
import { FrontendControls } from "./components/FrontendControls.tsx";
import { ZoomControls } from "./components/ZoomControls.tsx";
import { NewBotDialog } from "./orca/bots/settings/NewBotDialog.tsx";
import { showBotSettings } from "./orca/bots/BotSide.tsx";
import { BotPage } from "./orca/bots/BotPage.tsx";
import { botsApi } from "./orca/bots/data.ts";
import { currentBotsView, useBotsView } from "./lib/bots.ts";
import { botMascot } from "../shared/bots/avatar.ts";
import { mascotSrc } from "./components/BotVisuals.tsx";
import { UpdateButton } from "./components/UpdateControls.tsx";
import { FilesDialog } from "./components/FilesDialog.tsx";
import { FileViewer } from "./components/FileViewer.tsx";
import { OpenFileContext } from "./lib/filePaths.ts";
import { useFileViewer } from "./lib/useFileViewer.ts";
import { useT } from "./lib/i18n.ts";
import { useScreenWakeLock } from "./lib/wakeLock.ts";
import { watchDrawerSwipe } from "./lib/edgeSwipe.ts";
import { Droplet } from "./components/Droplet.tsx";
import { AlertsBell, type BellState } from "./components/AlertsBell.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { botPageState, initialBotId, needsYou, searchWithBot, shortCwd, type StoredSelection } from "./components/navModel.ts";
import { dropletAllows, endedTurn, showDroplet, trackTurn, type DropletKind } from "./lib/droplet.ts";

const APP_TITLE = "TermWeave";
const POLL_MS = 5000;

/**
 * Polls and the event stream hand over fresh objects every few seconds even when nothing
 * changed; storing them re-rendered the whole app (the chat transcript included) each time.
 */
function sameData(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
/** trailing debounce for push-triggered refetches: bursts of events become one fetch */
const REFETCH_DEBOUNCE_MS = 500;

/** A notification tapped while the app was closed opens `/?pane=<id>` (public/sw.js). */
function paneFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("pane");
}

const SELECTION_KEY = "termweave:selection";

/**
 * The pane to open: this window's own (sessionStorage is per window and survives
 * its reloads), else the last one any window showed, for a newly opened window.
 */
function storedSelection(): StoredSelection | null {
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try {
      const value: unknown = JSON.parse(window[storage].getItem(SELECTION_KEY) ?? "null");
      if (value !== null && typeof value === "object") return value as StoredSelection;
    } catch {
      /* private mode */
    }
  }
  return null;
}

/** `botId`: a session bot's page is open over the pane selection, which stays for when it closes. */
function storeSelection(machineId: string, paneId: string | null, ownerId: string | null = paneId, botId: string | null = null): void {
  const value: StoredSelection = { machine_id: machineId, pane_id: paneId, workspace_id: ownerId, bot_id: botId };
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try { window[storage].setItem(SELECTION_KEY, JSON.stringify(value)); } catch {}
  }
}

/**
 * Terminal first on every screen. Only an explicit pane or settings choice opens chat.
 * Device type and pending agent metadata must not change the user's initial view.
 */
function storedView(paneId: string, machineId: string, hasAgent: boolean | null, terminalAttach: boolean, defaultView: DefaultView): PaneView {
  void terminalAttach; // Availability affects terminal feedback, not the chosen view.
  try {
    const stored = readPaneView(machineId, paneId);
    if (stored === "chat" || stored === "terminal") return initialPaneView(stored, hasAgent, defaultView);
  } catch {
    /* private mode */
  }
  return initialPaneView(null, hasAgent, defaultView);
}

function Brand() {
  return (
    <h1 className="brand">
      <img src="/icons/termweave-v2-64.png" alt="" width="22" height="22" className="brand-mark" />
      <span className="brand-name">
        TermWeave
      </span>
    </h1>
  );
}

export function App() {
  const t = useT();
  const { settings, resolvedTheme, update: updateSettings } = useSettings();
  // this device's alert choices: sent with its push subscription, and applied to tab alerts here
  const alerts = useMemo(() => alertPrefs(settings), [settings.alertInput, settings.alertDone]);
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  // the bell's switch for this device: off drops its push subscription and silences tab alerts
  const alertsOn = settings.alertsOn;
  const alertsOnRef = useRef(alertsOn);
  alertsOnRef.current = alertsOn;
  const [machines, setMachines] = useState<Machine[]>([]);
  // the Fleet console's last hour counts runs seen while its page was closed too
  useEffect(() => observeFleetRuns(machines), [machines]);
  const [selectedMachineId, setSelectedMachineId] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("pane")) return query.get("machine") ?? "local";
    return storedSelection()?.machine_id ?? "local";
  });
  const selectedMachine = machines.find((m) => m.id === selectedMachineId);
  const snapshot = selectedMachine?.snapshot ?? null;
  const machinesRef = useRef(machines); machinesRef.current = machines;
  const [updateRemote, setUpdateRemote] = useState(false);
  const [machineDialog, setMachineDialog] = useState<Machine | "new" | null>(null);
  // Add PC from Settings or the palette leaves no trigger to return focus to once its dialog
  // closes (Settings closed when it opened): the header's workspace-list toggle stands in
  const addPcFocusReturn = useRef(false);
  // Add PC opened from Settings: closing the dialog without a connection returns there (Remote PCs,
  // where "Update PC bridges automatically" waits); a connection goes on to the new PC instead
  const addPcFromSettings = useRef(false);
  const settingsOpenRef = useRef(false);
  const closeMachineDialog = useCallback((reopenSettings = true) => {
    setMachineDialog(null);
    const fromSettings = addPcFromSettings.current;
    addPcFromSettings.current = false;
    if (fromSettings && reopenSettings) {
      addPcFocusReturn.current = false;
      // the setters are declared below; they are stable, so this callback needs no deps
      setSettingsSection("remote");
      setSettingsOpen(true);
      return;
    }
    if (!addPcFocusReturn.current) return;
    addPcFocusReturn.current = false;
    focusWorkspaceListToggle();
  }, []);
  const [newSessionMachineId, setNewSessionMachineId] = useState("local");
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null until the server has said whether it wants a token: the shell, and with it
  // the WebSocket, never mounts before that is known
  const [locked, setLocked] = useState<boolean | null>(null);
  const [lockReason, setLockReason] = useState<AccessRefusal | null>(null);
  /** the code a scanned QR brought along (`?pair=CODE`), taken off the address at once */
  const [pairCode] = useState(() => takePairCode());
  const [auth, setAuth] = useState<HealthAuth | null>(null);
  const canSignOut = auth?.authenticated === true && (auth.via === "token" || auth.via === "device");
  // a device that is in only because nothing is paired yet still pairs from the QR code's address
  const pairedFromAddress = useRef(false);
  useEffect(() => {
    if (locked !== false || pairCode === "" || pairedFromAddress.current || auth?.via === "device") return;
    pairedFromAddress.current = true;
    pairDevice(pairCode, deviceLabel(navigator.userAgent, navigator.maxTouchPoints ?? 0)).then(() => loadHealth()).catch(() => { /* the gate, if any, reports it */ });
  }, [locked, pairCode, auth]); // eslint-disable-line react-hooks/exhaustive-deps
  const updates = useUpdates(locked === false);
  const [selectedPaneId, setSelectedPaneId] = useState<string | null>(() => {
    if (paneFromUrl()) return paneFromUrl();
    return storedSelection()?.pane_id ?? null;
  });
  const [sidebarOwnerId, setSidebarOwnerId] = useState<string | null>(() => paneFromUrl() ? null : storedSelection()?.workspace_id ?? null);
  // a session bot's page, shown in the main area in place of the terminals; the pane selection stays under it
  const [selectedBotId, setSelectedBotId] = useState<string | null>(() => initialBotId(window.location.search, storedSelection()));
  const selectedBotRef = useRef(selectedBotId); selectedBotRef.current = selectedBotId;
  // App picked the selected pane itself because the one selected closed: it must not raise a
  // phone's keyboard (over the drawer the close was tapped in) until the user picks a pane or lens
  const [autoSelected, setAutoSelected] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // phones fold the header tools behind one button so the header stays one row
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const away = (event: PointerEvent) => { if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) setMoreOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [moreOpen]);
  const drawerOpenRef = useRef(drawerOpen); drawerOpenRef.current = drawerOpen;
  // the pane in front of the user: none while a bot page covers the terminals
  const selectionRef = useRef({ machineId: selectedMachineId, paneId: selectedBotId === null ? selectedPaneId : null });
  selectionRef.current = { machineId: selectedMachineId, paneId: selectedBotId === null ? selectedPaneId : null };
  // on a phone the drawer follows a swipe in from the left edge, and a swipe back (lib/edgeSwipe.ts)
  useEffect(() => watchDrawerSwipe(() => drawerOpenRef.current, setDrawerOpen), []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, refreshPaneViews] = useState(0);
  const [view, setViewState] = useState<PaneView>("terminal");
  const [paletteOpen, setPaletteOpen] = useState(false);
  // the Files dialog, and the file open in the viewer (a path as the chat or the dialog gave it)
  const [filesOpen, setFilesOpen] = useState(false);
  const { viewing, openFile, closeFile } = useFileViewer();
  const viewFile = useCallback((path: string) => {
    openFile({ path, paneId: selectedPaneId, machineId: selectedMachineId });
  }, [openFile, selectedPaneId, selectedMachineId]);
  // a session bot has no pane: its chat's paths open on this app's own PC, as written
  const viewBotFile = useCallback((path: string) => {
    openFile({ path, paneId: null, machineId: "local" });
  }, [openFile]);
  const [settingsOpen, setSettingsOpen] = useState(() => new URLSearchParams(window.location.search).get("panel") === "android");
  settingsOpenRef.current = settingsOpen;
  const [openRigOpen, setOpenRigOpen] = useState(() => new URLSearchParams(window.location.search).get("panel") === "openrig");
  const [newBotOpen, setNewBotOpen] = useState(false);
  /** which bot the bots page opens on: one from the sidebar, or null for the page's own pick */
  const closeOpenRig = useCallback(() => {
    setOpenRigOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.get("panel") === "openrig") { url.searchParams.delete("panel"); window.history.replaceState(null, "", url); }
  }, []);
  const [fleetOpen, setFleetOpen] = useState(() => new URLSearchParams(window.location.search).get("panel") === "fleet");
  const closeFleet = useCallback(() => {
    setFleetOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.get("panel") === "fleet") { url.searchParams.delete("panel"); window.history.replaceState(null, "", url); }
  }, []);
  /** the Settings section to open at; Fleet's connection settings open it at Remote PCs */
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const closeSettings = useCallback(() => { setSettingsOpen(false); setSettingsSection(undefined); }, []);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  // the server's event stream is open: a bot page has no terminal socket, and its chat lives on this stream
  const [eventsLive, setEventsLive] = useState(false);
  const [outputStopped, setOutputStopped] = useState(false);
  // the connection's role: the server's role-ack confirms it (no UI control today)
  const [role, setRole] = useState<ClientRole>("interact");
  const [notifications, setNotifications] = useState<NotificationState>(() => notificationState());
  // this device has a server-side push subscription: alerts come from the server, not the tab
  const [pushOn, setPushOn] = useState(false);
  const pushOnRef = useRef(pushOn);
  pushOnRef.current = pushOn;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // last-seen agent status per pane: the baseline that decides whether a push is news
  const statusRef = useRef<Map<string, AgentStatus>>(new Map());
  // when each pane's turn began, so an in-app alert knows a long turn from a quick one
  const turnStartRef = useRef<Map<string, number>>(new Map());
  // how long each pane's last finished turn took: a pane that ends is told by it too
  const lastTurnRef = useRef<Map<string, number>>(new Map());
  const alertInAppRef = useRef(settings.alertInApp);
  alertInAppRef.current = settings.alertInApp;
  const refetchTimer = useRef<number | null>(null);
  const snapshotRef = useRef<typeof snapshot>(null);
  snapshotRef.current = snapshot;

  const loadHealth = useCallback(async () => {
    try { const next = await fetchBridgeHealth(); setLocked(next.auth.required && !next.auth.authenticated); setLockReason(next.auth.reason ?? null); setAuth(next.auth); }
    catch { /* retain the gate while the connection server restarts */ }
    try { const next = await fetchHealth(); setHealth((previous) => sameData(previous, next) ? previous : next); } catch { setHealth(null); }
  }, []);
  const snapshotRequests = useRef(new SnapshotRequests());
  const load = useCallback(async () => {
    try {
      await snapshotRequests.current.read(fetchMachines, (next) => {
        setMachines((previous) => sameData(previous, next) ? previous : next);
        setError(null); setLocked(false);
      });
    }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) { setLocked(true); return; }
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const tick = (): void => {
      // a hidden tab (or a phone app in the background) polls nothing; it catches up on return
      if (document.visibilityState === "hidden") return;
      void loadHealth();
      // a locked tab only watches health, so a token entered in another tab still unlocks it
      if (lockedRef.current !== true) void load();
    };
    let timer = 0;
    let disposed = false;
    void (async (): Promise<void> => {
      // a bookmarked `#auth=<token>` link unlocks without typing; the fragment is
      // stripped before anything renders, and a stale token falls through to the
      // gate the first health check mounts
      const linkToken = takeAuthTokenFromUrl();
      if (linkToken !== null) await authenticate(linkToken).catch(() => undefined);
      if (disposed) return;
      tick();
      timer = window.setInterval(tick, POLL_MS);
    })();
    const onVisible = (): void => {
      if (document.visibilityState === "visible" && !disposed) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, loadHealth]);

  // push-triggered refetches are debounced so an event burst becomes one fetch
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current !== null) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      if (lockedRef.current !== true) void load();
    }, REFETCH_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => () => {
    if (refetchTimer.current !== null) window.clearTimeout(refetchTimer.current);
  }, []);

  // In-app alerts (components/Droplet.tsx): only while the app is on screen - a hidden app has
  // its system notifications - and never for the pane already open in front of the user.
  const dropIn = useCallback((machine: Machine, pane: HerdrPane, kind: DropletKind) => {
    if (!alertsOnRef.current || !alertInAppRef.current || document.visibilityState !== "visible") return;
    const open = selectionRef.current;
    if (open.machineId === machine.id && open.paneId === pane.pane_id && !drawerOpenRef.current) return;
    showDroplet({
      machineId: machine.id,
      paneId: pane.pane_id,
      agent: pane.agent ?? null,
      title: displayPaneTitle(pane),
      machine: machinesRef.current.length > 1 ? machine.name : null,
      kind,
    });
  }, []);

  // One SSE subscription watches every PC, even when no terminal is selected.
  useEffect(() => {
    if (locked !== false) return;
    const seed = (list: Machine[]) => {
      for (const machine of list) for (const pane of machine.snapshot?.panes ?? []) {
        statusRef.current.set(paneStorageId(machine.id, pane.pane_id), pane.agent_status);
      }
    };
    const events = new EventSource("/api/machines/events");
    events.onopen = () => setEventsLive(true);
    events.onerror = () => setEventsLive(false);
    events.onmessage = (event) => {
      let payload: MachineEvent;
      try { payload = JSON.parse(event.data); } catch { return; }
      // A poll started before this event can carry an older roster or pane status.
      snapshotRequests.current.invalidate();
      if (payload.type === "machines") {
        seed(payload.machines);
        setMachines((previous) => sameData(previous, payload.machines) ? previous : payload.machines);
        return;
      }
      const machine = machinesRef.current.find((m) => m.id === payload.machine_id);
      if (!machine) return;
      const message = payload.message;
      if (message.type === "pane-status") {
        const key = paneStorageId(machine.id, message.pane_id);
        const previous = statusRef.current.get(key);
        statusRef.current.set(key, message.agent_status);
        const pane = machine.snapshot?.panes.find((p) => p.pane_id === message.pane_id);
        const worked = trackTurn(turnStartRef.current, key, previous, message.agent_status, Date.now());
        if (worked !== null) lastTurnRef.current.set(key, worked);
        if (pane && shouldNotifyStatus(previous, message.agent_status) && dropletAllows(alertsRef.current, message.agent_status, worked)) dropIn(machine, pane, message.agent_status === "blocked" ? "blocked" : "done");
        if (pane && shouldNotifyStatus(previous, message.agent_status) && alertsOnRef.current && !pushOnRef.current && alertsAllow(alertsRef.current, message.agent_status)) showPaneStatusNotification(message.pane_id, `${machine.name} · ${displayPaneTitle(pane)}`, message.agent_status, () => selectTargetRef.current(machine.id, message.pane_id), machine.id);
        setMachines((list) => {
          let changed = false;
          const next = list.map((m) => {
            if (m.id !== machine.id || !m.snapshot) return m;
            const snapshot = applyPaneStatus(m.snapshot, message.pane_id, message.agent_status, message.background_tasks);
            if (snapshot === m.snapshot) return m;
            changed = true;
            return { ...m, snapshot };
          });
          return changed ? next : list;
        });
      }
      if (message.type === "pane-exited") {
        const pane = machine.snapshot?.panes.find((p) => p.pane_id === message.pane_id);
        const worked = endedTurn(turnStartRef.current, lastTurnRef.current, paneStorageId(machine.id, message.pane_id), Date.now());
        if (pane && dropletAllows(alertsRef.current, "done", worked)) dropIn(machine, pane, "ended");
      }
      if (message.type === "pane-exited" && alertsOnRef.current && !pushOnRef.current && alertsRef.current.done !== "off") {
        const pane = machine.snapshot?.panes.find((p) => p.pane_id === message.pane_id);
        if (pane) showPaneEndedNotification(message.pane_id, `${machine.name} · ${displayPaneTitle(pane)}`, () => selectTargetRef.current(machine.id, message.pane_id), machine.id);
      }
      if (message.type === "session-changed" || message.type === "pane-exited") scheduleRefetch();
      // a color change leaves the snapshot equal: the sidebar re-reads colors on this
      if (message.type === "session-changed") window.dispatchEvent(new Event("termweave:session-changed"));
      if (message.type === "bots-changed") window.dispatchEvent(new Event("termweave:bots-changed"));
      // a session bot's new chat rows (src/orca/chat/session reads them); the bots are this app's own PC's
      if (message.type === "bot-chat" && machine.kind === "local") window.dispatchEvent(new CustomEvent("termweave:bot-chat", { detail: message }));
    };
    return () => { events.close(); setEventsLive(false); };
  }, [locked, scheduleRefetch, dropIn]);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    if (message.type === "error" && message.code === "output_stalled") setOutputStopped(true);
  }, []);

  const enableNotifications = useCallback(async () => {
    const next = notificationState() === "granted" ? "granted" : await requestNotificationPermission();
    setNotifications(next);
    if (next !== "granted") return false;
    updateSettings({ alertsOn: true });
    try {
      const endpoint = await ensurePushSubscription(alertsRef.current);
      setPushOn(endpoint !== null);
      // the confirmation push proves the whole path (server -> push service -> this device)
      if (endpoint) await sendTestPush(endpoint);
      return endpoint !== null;
    } catch (err) {
      console.warn("web push unavailable, alerts stay tab-only", err);
      return false;
    }
  }, [updateSettings]);

  // The browser's permission cannot be taken back from the page: turning alerts off drops
  // this device's push subscription (the server forgets it) and silences the tab's own.
  const disableNotifications = useCallback(async () => {
    updateSettings({ alertsOn: false });
    setPushOn(false);
    await removePushSubscription().catch((err) => console.warn("could not drop the push subscription", err));
  }, [updateSettings]);

  // a device that already allowed alerts re-registers on every load: idempotent, and it
  // brings the device back if the server lost its subscriptions; a changed choice of
  // alerts goes the same way
  useEffect(() => {
    if (locked !== false || notifications !== "granted" || !alertsOn || !pushSupported()) return;
    let cancelled = false;
    ensurePushSubscription(alerts)
      .then((endpoint) => {
        if (!cancelled) setPushOn(endpoint !== null);
      })
      .catch(() => {
        if (!cancelled) setPushOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locked, notifications, alerts, alertsOn]);

  const unlock = useCallback(() => {
    setLocked(false);
    void loadHealth();
    void load();
  }, [load, loadHealth]);

  // pasting the auth link into an already-open tab is a fragment-only navigation:
  // no reload happens, so the boot consumer never re-runs. Watch for the arrival
  // of the fragment instead; a wrong token just leaves the gate as it is.
  useEffect(() => {
    const onHashChange = (): void => {
      const linkToken = takeAuthTokenFromUrl();
      if (linkToken === null) return;
      void authenticate(linkToken)
        .then(unlock)
        .catch(() => undefined);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [unlock]);

  // signing out drops this device's pairing too: getting back in takes a new code from the PC
  const [signOutAsk, setSignOutAsk] = useState(false);
  const lock = useCallback(async () => {
    setDrawerOpen(false);
    // before signOut: the unsubscribe call needs the cookie, and a locked device must stop
    // receiving pane titles
    await removePushSubscription().catch(() => undefined);
    setPushOn(false);
    try {
      await signOut();
    } catch {
      /* the cookie may still be set: the health answer decides whether the gate shows */
    }
    await loadHealth();
  }, [loadHealth]);

  const [nativeMovePending, setNativeMovePending] = useState(false);
  const movePendingRef = useRef(0);
  const navigationRef = useRef(0);
  const moveSelectionRef = useRef<{ machine: string; epoch: number } | null>(null);
  const selectedMachineRef = useRef(selectedMachineId);
  selectedMachineRef.current = selectedMachineId;
  const selectTarget = useCallback((machineId: string, paneId: string | null) => {
    navigationRef.current++;
    // Only another PC mounts a new terminal (and socket), which reports its own state. A pane
    // on the same PC keeps the connected socket, which never reports again: resetting here
    // left the header on "reconnecting" after every pane switch.
    // leaving a bot page mounts the terminals again, with a socket that has not reported yet
    if (machineId !== selectedMachineRef.current || selectedBotRef.current !== null) setConnected(false);
    const pane = machinesRef.current.find(machine => machine.id === machineId)?.snapshot?.panes.find(pane => pane.pane_id === paneId);
    const active = paneId;
    setSidebarOwnerId(pane?.workspace_id ?? null);
    setSelectedBotId(null);
    setSelectedMachineId(machineId); setSelectedPaneId(active); setAutoSelected(false); setDrawerOpen(false);
    setOutputStopped(false);
    storeSelection(machineId, active, pane?.workspace_id ?? null);
  }, []);
  const selectWorkspace = useCallback((machineId: string, workspaceId: string) => {
    const roster = machinesRef.current.find(machine => machine.id === machineId)?.snapshot?.panes.filter(p => p.workspace_id === workspaceId) ?? [];
    const saved = initialWorkspaceLayout(machineId, workspaceId, roster.map(p => p.pane_id), roster[0]?.pane_id ?? null);
    const active = roster.some(p => p.pane_id === saved.primary) ? saved.primary : roster[0]?.pane_id ?? null;
    navigationRef.current++;
    if (machineId !== selectedMachineRef.current || selectedBotRef.current !== null) setConnected(false);
    setSelectedBotId(null);
    setSelectedMachineId(machineId); setSidebarOwnerId(workspaceId); setSelectedPaneId(active);
    setAutoSelected(false); setDrawerOpen(false); setOutputStopped(false);
    storeSelection(machineId, active, workspaceId);
  }, []);
  const onMoved = useCallback(async (result: PaneMoveResult, machineId: string, _sourceWorkspace: string) => {
    // Fetch before changing selection, so a returned cross-workspace ID never mounts
    // the transient "pending" workspace. No retry of the mutation and no rollback RPC.
    setError(null);
    try {
    const [roster, authoritative] = await Promise.race([Promise.all([fetchMachines(), fetchSession(machineId)]), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("move refresh timed out")), 10000))]);
    const next = roster.map(machine => machine.id === machineId ? { ...machine, snapshot: authoritative } : machine);
    const pane = authoritative.panes.find(pane => pane.pane_id === result.pane.pane_id);
    if (!pane || pane.terminal_id !== result.pane.terminal_id || pane.workspace_id !== result.pane.workspace_id || pane.tab_id !== result.pane.tab_id) throw new Error("move roster mismatch");
    snapshotRequests.current.invalidate();
    setMachines(next);
    const captured = moveSelectionRef.current;
    if (captured?.machine === machineId && captured.epoch === navigationRef.current && selectedMachineRef.current === machineId) {
      setSidebarOwnerId(result.pane.workspace_id);
      setSelectedMachineId(machineId); setSelectedPaneId(result.pane.pane_id); setAutoSelected(false);
      storeSelection(machineId, result.pane.pane_id, result.pane.workspace_id);
    }
    } catch (error) {
      setError(t("The terminal moved, but the list could not refresh ({id}). Refresh the list to check. Nothing is retried or undone.", { id: result.pane.pane_id }));
      throw error;
    }
  }, [selectTarget, t]);
  const selectTargetRef = useRef(selectTarget); selectTargetRef.current = selectTarget;
  /** Opens a session bot's page in the main area; picking a pane or workspace leaves it. */
  const selectBot = useCallback((botId: string) => {
    navigationRef.current++;
    setSelectedBotId(botId); setAutoSelected(false); setDrawerOpen(false); setOutputStopped(false);
  }, []);
  useEffect(() => {
    // An offline PC's cached roster cannot invalidate a selection. Once connected,
    // a closed pane (including one remembered across reloads) must release its selection.
    if (movePendingRef.current || !snapshot || selectedMachine?.state !== "connected") return;
    if (snapshot.panes.some((pane) => pane.pane_id === selectedPaneId)) return;
    const fallback = (current: typeof snapshot) => current.panes.find((pane) => pane.pane_id === current.focused_pane_id)?.pane_id ?? current.panes[0]?.pane_id ?? null;
    if (selectedPaneId === null) { setSelectedPaneId(fallback(snapshot)); return; }
    // The combined roster is cached: a newly created pane can be selected before it
    // appears there. Confirm absence against this PC before discarding the selection.
    let cancelled = false;
    void fetchSession(selectedMachineId).then((current) => {
      if (cancelled || movePendingRef.current) return;
      if (current.panes.some((pane) => pane.pane_id === selectedPaneId)) {
        // A late cached machine event can omit a just-moved pane even though the
        // selected PC still owns it. Repair that roster, not the user's selection.
        snapshotRequests.current.invalidate();
        setMachines(list => list.map(machine => machine.id === selectedMachineId ? { ...machine, snapshot: current } : machine));
        return;
      }
      const survivor = current.panes.find(pane => pane.workspace_id === sidebarOwnerId);
      const next = survivor?.pane_id ?? fallback(current);
      if (!survivor) setSidebarOwnerId(current.panes.find(p => p.pane_id === next)?.workspace_id ?? null);
      setSelectedPaneId(next);
      setAutoSelected(true);
    }).catch(() => { /* a failed read is not evidence that the pane disappeared */ });
    return () => { cancelled = true; };
  }, [snapshot, selectedPaneId, sidebarOwnerId, selectedMachineId, selectedMachine?.state]);
  useEffect(() => {
    storeSelection(selectedMachineId, selectedPaneId, sidebarOwnerId, selectedBotId);
  }, [selectedMachineId, selectedPaneId, sidebarOwnerId, selectedBotId]);
  // the open bot page is in the address too (`?bot=`), so a reload or a copied link opens it again
  useEffect(() => {
    const search = searchWithBot(window.location.search, selectedBotId);
    if (search !== window.location.search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [selectedBotId]);
  useEffect(() => {
    const pane = snapshot?.panes.find(p => p.pane_id === selectedPaneId);
    if (pane && pane.workspace_id !== sidebarOwnerId) setSidebarOwnerId(pane.workspace_id);
  }, [snapshot, sidebarOwnerId, selectedPaneId]);

  const selectPane = useCallback((paneId: string) => {
    selectTarget(selectedMachineRef.current, paneId);
  }, [selectTarget]);

  // a tapped notification focuses this window and names the pane (public/sw.js)
  useEffect(() => onNotificationTarget((target) => selectTargetRef.current(target.machine_id, target.pane_id)), []);

  // the ?pane= a notification opened us with has done its job once it selected the pane
  useEffect(() => {
    if (paneFromUrl() !== null) {
      const detached = new URLSearchParams(window.location.search).has("detached");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${detached ? "?detached=1" : ""}`);
    }
  }, []);

  const selectedPane = snapshot?.panes.find((pane) => pane.pane_id === selectedPaneId) ?? null;
  useScreenWakeLock(settings.keepScreenOn && locked === false && selectedPane !== null);
  const selectedWorkspace = selectedPane
    ? (snapshot?.workspaces.find((workspace) => workspace.workspace_id === selectedPane.workspace_id) ?? null)
    : null;
  const targetHerdr = selectedMachineId === "local" ? health?.herdr : selectedMachine?.herdr;
  const selectedTitle = selectedPane ? displayPaneTitle(selectedPane) : null;
  const selectedAgent = selectedPane?.agent ?? null;
  // unknown herdr (offline, or a server that predates the flag) counts as attach-capable
  // a server that repaints the pane's screen instead (terminal_mirror) has a terminal lens too
  const terminalAttach = targetHerdr?.terminal_attach !== false || targetHerdr?.terminal_mirror === true;

  // a bot is talked to: its chat opens in the chat lens whatever the default, unless this pane was switched by hand
  const botsView = useBotsView();
  const botPanes = useMemo(() => new Set(selectedMachineId === "local" ? (botsView?.bots ?? []).flatMap((bot) => bot.paneId ? [bot.paneId] : []) : []), [botsView, selectedMachineId]);
  const defaultViewFor = (paneId: string) => botPanes.has(paneId) ? "chat" as const : settings.defaultView;
  // the bot bar's worker rows open their terminal here
  useEffect(() => {
    const open = (event: Event): void => {
      const detail = (event as CustomEvent<{ machineId: string; paneId: string }>).detail;
      if (detail?.paneId) selectTargetRef.current(detail.machineId, detail.paneId);
    };
    window.addEventListener("termweave:open-pane", open);
    return () => window.removeEventListener("termweave:open-pane", open);
  }, []);
  /**
   * A bot's chat: a session bot's page, or the pane a terminal bot runs in, started first when it is
   * not running. A refusal is the sidebar's to show next time.
   */
  const openBot = async (bot: { id: string; paneId: string | null; runtime?: string }): Promise<void> => {
    const runtime = currentBotsView()?.bots.find((entry) => entry.id === bot.id)?.runtime ?? bot.runtime;
    if (runtime === "session") { selectBot(bot.id); return; }
    try {
      const running = bot.paneId !== null && machines.find((machine) => machine.id === "local")?.snapshot?.panes.some((pane) => pane.pane_id === bot.paneId);
      const paneId = running ? bot.paneId! : (await botsApi.open(bot.id)).pane_id;
      setDrawerOpen(false);
      selectTargetRef.current("local", paneId);
    } catch (error) { console.error(error); }
  };

  const openBotRef = useRef(openBot); openBotRef.current = openBot;
  // bot settings, after switching how a bot runs: the page or the pane follows the bot
  useEffect(() => {
    const open = (event: Event): void => {
      const botId = (event as CustomEvent<{ botId: string }>).detail?.botId;
      const bot = botId ? currentBotsView()?.bots.find((entry) => entry.id === botId) : undefined;
      if (bot) void openBotRef.current(bot);
    };
    window.addEventListener("termweave:open-bot", open);
    return () => window.removeEventListener("termweave:open-bot", open);
  }, []);
  // a bot page whose bot was deleted, or now runs in a terminal (switched on any device), gives way: to the
  // bot's chat pane when it runs, else to the pane selection underneath
  const pageState = botPageState(botsView, selectedBotId);
  const selectedBot = pageState === "show" ? botsView?.bots.find((entry) => entry.id === selectedBotId) ?? null : null;
  const botPage = selectedBotId !== null && (pageState === "show" || pageState === "wait");
  useEffect(() => {
    if (pageState !== "gone" && pageState !== "pane") return;
    const paneId = botsView?.bots.find((entry) => entry.id === selectedBotId)?.paneId ?? null;
    const running = paneId !== null && machinesRef.current.find((machine) => machine.id === "local")?.snapshot?.panes.some((pane) => pane.pane_id === paneId);
    if (pageState === "pane" && running) selectTargetRef.current("local", paneId); else setSelectedBotId(null);
  }, [pageState, selectedBotId, botsView]);

  // the lens follows the selected pane: each pane remembers its own
  useEffect(() => {
    if (selectedPaneId === null) return;
    setViewState(storedView(selectedPaneId, selectedMachineId, selectedPane ? selectedAgent !== null : null, terminalAttach, defaultViewFor(selectedPaneId)));
  }, [selectedPaneId, selectedMachineId, selectedPane !== null, selectedAgent !== null, terminalAttach, settings.defaultView, botPanes.has(selectedPaneId ?? "")]);

  const setView = useCallback(
    (next: PaneView) => {
      setViewState(next);
      setAutoSelected(false);
      if (selectedPaneId === null) return;
      try {
        writePaneView(selectedMachineId, selectedPaneId, next);
      } catch {
        /* private mode: the lens just stops being remembered */
      }
    },
    [selectedPaneId, selectedMachineId],
  );

  // a blocked or missing Notification API keeps the bell, crossed out, instead of hiding it: a
  // bell that vanished on the tap that got it denied read as a broken button
  const bellBlocked = notifications === "unsupported" || notifications === "denied";
  const bell: { label: string; title: string; on: boolean; run: () => Promise<unknown> } =
    bellBlocked
      ? {
          label: t("Notifications blocked"),
          title: notifications === "denied"
            ? t("This browser blocked notifications. Allow them in the site or app settings. In-app alerts still show.")
            : t("System notifications are not available here. In-app alerts still show."),
          on: false,
          run: async () => setSettingsOpen(true),
        }
    : notifications !== "granted"
      ? { label: t("Enable notifications"), title: t("Notify me when a pane needs input or finishes"), on: false, run: enableNotifications }
      : !alertsOn
        ? { label: t("Alerts off"), title: t("Alerts off on this device — tap to turn them on"), on: false, run: enableNotifications }
        : pushOn
          ? { label: t("Alerts on"), title: t("Alerts on: pushed to this device, even with the app closed."), on: true, run: disableNotifications }
          : {
              label: t("Alerts on in this tab"),
              // turning them off and on again retries the push subscription
              title: pushSupported()
                ? t("Alerts on while this tab is open.")
                : t("Alerts on while this tab is open. Closed-app alerts need https, and on iPhone the home-screen app."),
              on: true,
              run: disableNotifications,
            };
  const bellVisible = !bellBlocked;
  const bellState: BellState = { label: bell.label, title: bell.title, on: bell.on, blocked: bellBlocked };
  // what waits on the user, counted once (pane prompts and bot questions): the closed drawer and
  // the collapsed sidebar carry it on their toggles
  const readOnly = auth?.authenticated !== true || auth.role === "watch" || role === "observe";
  // the header's connection state: the terminal's socket, or for a bot page the server's event stream
  const live = botPage ? eventsLive : connected;
  const waitingCount = useMemo(() => needsYou(machines, botsView).total, [machines, botsView]);
  const waitingBadge = waitingCount > 0 ? <span className="nav-count" aria-hidden="true">{waitingCount > 99 ? "99+" : waitingCount}</span> : null;

  const shownTitle = botPage ? selectedBot?.name ?? null : selectedTitle;
  useEffect(() => {
    document.title = shownTitle ? `${shownTitle} · TermWeave` : APP_TITLE;
  }, [shownTitle]);

  const actions = useMemo<AppActions>(
    () => ({
      selectPane,
      selectAdjacentPane: (direction) => {
        const next = adjacentWorkspacePane(snapshotRef.current?.panes ?? [], selectedPaneId, direction);
        if (next) selectPane(next);
      },
      setView,
      // a bot page has no terminal to switch to
      toggleView: () => { if (!botPage) setView(view === "chat" ? "terminal" : "chat"); },
      openNewSession: () => {
        setDrawerOpen(false);
        setNewSessionMachineId(selectedMachineId);
        setNewSessionOpen(true);
      },
      openPalette: () => setPaletteOpen(true),
      openSettings: () => {
        setDrawerOpen(false);
        setSettingsOpen(true);
      },
      openAddPc: () => {
        // the new PC reports its progress in the sidebar: nothing should sit over it
        addPcFromSettings.current = settingsOpenRef.current;
        setSettingsOpen(false);
        setUpdateRemote(false);
        addPcFocusReturn.current = true;
        setMachineDialog("new");
      },
      toggleSidebar: () => {
        if (window.matchMedia("(max-width: 768px)").matches) setDrawerOpen((open) => !open);
        else setSidebarCollapsed((collapsed) => !collapsed);
      },
      toggleTheme: () => updateSettings({ theme: resolvedTheme === "dark" ? "light" : "dark" }),
      toggleBionic: () => updateSettings({ bionicReading: !settings.bionicReading }),
      lock: canSignOut ? () => { setDrawerOpen(false); setSignOutAsk(true); } : null,
      enableNotifications: bellVisible && !bell.on ? () => void enableNotifications() : null,
      refresh: () => void load(),
      swapPanes: async (request: PaneSwapRequest, workspaceId: string, machineId: string) => {
        if (movePendingRef.current) throw new Error(t("Another move is still running."));
        movePendingRef.current = 1; setNativeMovePending(true);
        try {
          if (!(await swapPanesRequest(request, machineId))) throw new Error(t("No native move occurred. Check zoom and destination."));
          // the dock is this browser's own layout: the open workspace follows by event, a closed one in storage
          swapStoredLayout(machineId, workspaceId, request.pane_id, request.target_pane_id);
          window.dispatchEvent(new CustomEvent("termweave-dock-swap", { detail: { machine: machineId, workspace: workspaceId, a: request.pane_id, b: request.target_pane_id } }));
          await load();
        } finally { movePendingRef.current = 0; setNativeMovePending(false); }
      },
      movePane: async (request: PaneMoveRequest, machineId: string) => {
        // the same guard and selection capture the dock's native move uses: one move at a time, no retry
        if (movePendingRef.current) throw new Error(t("Another move is still running."));
        moveSelectionRef.current = { machine: selectedMachineRef.current, epoch: navigationRef.current };
        movePendingRef.current = 1; setNativeMovePending(true);
        try {
          const result = await movePaneRequest(request, machineId);
          if (!result.changed) throw new Error(t("No native move occurred. Check zoom and destination."));
          await onMoved(result, machineId, request.workspace_id);
        } finally { movePendingRef.current = 0; setNativeMovePending(false); }
      },
      openFiles: selectedPaneId !== null && !botPage ? () => { setDrawerOpen(false); setFilesOpen(true); } : null,
    }),
    [selectPane, selectedPaneId, selectedMachineId, setView, view, botPage, updateSettings, resolvedTheme, settings.bionicReading, canSignOut, bellVisible, bell.on, enableNotifications, load, onMoved, t],
  );

  useShortcuts(actions, locked === false);

  if (locked === null) {
    // the auth state is unknown until /api/health or /api/session answers (ten seconds when
    // herdr is down): show the shell without the terminal, and so without a WebSocket,
    // instead of a blank page
    return (
      <div className="app">
        <header className="app-header">
          <Brand />
          <div className="header-meta"><FrontendControls /></div>
        </header>
        <div className="app-body">
          <aside className="sidebar">
            <p className="tree-state" role="status">
              {t("Connecting…")}
            </p>
          </aside>
          <main className="terminal-host">
            <div className="terminal-placeholder">
              <div className="terminal-placeholder-inner">
                <span>{t("Connecting to TermWeave…")}</span>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }
  if (locked) return <><header className="app-header"><Brand /><div className="header-meta"><FrontendControls /></div></header><AccessGate reason={lockReason} initialCode={pairCode} onUnlocked={unlock} /></>;

  return (
    <MachineContext.Provider value={selectedMachineId}><div className={`app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <header className="app-header">
        <button
          type="button"
          className="icon-button drawer-toggle nav-count-host"
          aria-label={drawerOpen ? t("Close workspace list") : waitingCount > 0 ? t("Open workspace list, {n} need you", { n: waitingCount }) : t("Open workspace list")}
          aria-expanded={drawerOpen}
          aria-controls="workspace-drawer"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          {drawerOpen ? <X /> : <Menu />}
          {!drawerOpen && waitingBadge}
        </button>
        <button
          type="button"
          className="icon-button header-desktop-only sidebar-toggle nav-count-host"
          aria-label={!sidebarCollapsed ? t("Hide workspace list") : waitingCount > 0 ? t("Show workspace list, {n} need you", { n: waitingCount }) : t("Show workspace list")}
          aria-pressed={!sidebarCollapsed}
          title={t("Toggle sidebar (⌘⇧B)")}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <PanelLeft />
          {sidebarCollapsed && waitingBadge}
        </button>
        {botPage ? (
          // a session bot's page: its picture and name; it has no workspace, folder or terminal
          <div className="context context-bot" title={selectedBot?.name}>
            <div className="context-title">
              {selectedBot && <img className="context-bot-picture" src={mascotSrc(botMascot(selectedBot))} alt="" width={18} height={18} />}
              <span className="context-title-text">{selectedBot?.name ?? ""}</span>
            </div>
            <div className="context-sub">
              <span className="machine-context-name">{machines.find((machine) => machine.id === "local")?.name ?? "local"}</span><span aria-hidden="true"> › </span>
              <span className="context-workspace">{t("Chat session")}</span>
            </div>
          </div>
        ) : selectedPane ? (
          <div className="context" title={`${selectedWorkspace?.label ?? selectedPane.workspace_id} › ${selectedTitle}${selectedPane.cwd ? ` › ${selectedPane.cwd}` : ""}`}>
            <div className="context-title">
              {selectedAgent && <AgentMark agent={selectedAgent} size={18} />}
              <span className="context-title-text">{selectedTitle}</span>
            </div>
            <div className="context-sub">
              <span className="machine-context-name">{selectedMachine?.name ?? selectedMachineId}</span><span aria-hidden="true"> › </span>
              <span className="context-workspace">{selectedWorkspace?.label ?? selectedPane.workspace_id}</span>
              {selectedPane.cwd && (
                <>
                  <span className="context-sep" aria-hidden="true">
                    ›
                  </span>
                  {/* the last two folders say where; the full path is in the tooltip */}
                  <span className="context-cwd">{shortCwd(selectedPane.cwd)}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <><Brand /><span className="machine-context-name">{selectedMachine?.name ?? selectedMachineId}</span></>
        )}
        <UpdateButton updates={updates} />
        {selectedPane && !botPage && (
          <div className="segmented view-switch" role="group" aria-label={t("Pane view")}>
            <button type="button" aria-pressed={view === "chat"} onClick={() => setView("chat")} title={t("Chat transcript (⌘⇧J)")}>
              <MessageSquare />
              <span className="header-desktop-only">{t("Chat")}</span>
            </button>
            <button type="button" aria-pressed={view === "terminal"} onClick={() => setView("terminal")} title={terminalAttach ? t("Live terminal (⌘⇧J)") : t("Live terminal: coming to Windows PCs once herdr can attach there")}>
              <SquareTerminal />
              <span className="header-desktop-only">{t("Terminal")}</span>
              {!terminalAttach && <span className="pill pill-soon">{t("soon")}</span>}
            </button>
          </div>
        )}
        <div className="header-more-wrap" ref={moreRef}>
        {/* phones: search stays one tap away, outside the tools menu, at a thumb's size */}
        <button type="button" className="icon-button header-search-phone" aria-label={t("Command palette")} onClick={() => setPaletteOpen(true)}><Search aria-hidden="true" /></button>
        <button type="button" className="icon-button header-more" aria-label={live ? t("More tools") : t("More tools, reconnecting")} aria-expanded={moreOpen} aria-controls="header-meta" onClick={() => setMoreOpen(open => !open)}>
          {/* a dot means "look inside": only a lost connection is worth that, not the normal live state */}
          <MoreHorizontal aria-hidden="true" />{!live && <span className="header-more-dot conn-reconnecting" aria-hidden="true"><span className="conn-dot" /></span>}
        </button>
        <div className="header-meta" id="header-meta" data-open={moreOpen || undefined}>
          <FrontendControls />
          <ZoomControls />
          <span
            className={`conn ${live ? "conn-live" : "conn-reconnecting"}`}
            role="status"
            title={targetHerdr ? t("herdr {version} · protocol {protocol}", { version: targetHerdr.version, protocol: targetHerdr.protocol }) : undefined}
          >
            <span className="conn-dot" aria-hidden="true" />
            <span className="conn-text">{t(live ? "live" : outputStopped && !botPage ? "disconnected" : "reconnecting")}</span>
          </span>
          {!targetHerdr && <span className="pill pill-offline">{t("herdr offline")}</span>}
          {/* navigation: the places the header opens; their names show on wide screens and in the phone menu */}
          <button type="button" className="icon-button header-tool header-group-start" aria-label={t("Agent fleet")} title={t("Agent fleet")} onClick={() => setFleetOpen(true)}><Orbit aria-hidden="true" /><span className="header-tool-label header-label-wide">{t("Fleet")}</span></button>
          <button type="button" className="icon-button header-tool" aria-label={t("OpenRig teams")} title={t("OpenRig teams")} onClick={() => setOpenRigOpen(true)}><Users aria-hidden="true" /><span className="header-tool-label header-label-wide">{t("Teams")}</span></button>
          <TerminalNotificationCenter readOnly={auth?.authenticated !== true || auth.role === "watch" || role === "observe"} onSelect={target => selectTargetRef.current("local", target.paneId)} />
          {selectedPane && !botPage && (
            <button type="button" className="icon-button header-tool files-button" aria-label={t("Browse files")} title={t("Browse files")} onClick={() => setFilesOpen(true)}>
              <FolderOpen aria-hidden="true" /><span className="header-tool-label">{t("Browse files")}</span>
            </button>
          )}
          {/* utilities: search and this device's alerts, a step apart from the places above */}
          <button type="button" className="icon-button header-search-desktop header-group-start" aria-label={t("Command palette")} title={t("Command palette (⌘⇧K)")} onClick={() => setPaletteOpen(true)}>
            <Search aria-hidden="true" />
          </button>
          <AlertsBell bell={bellState} onPress={() => void bell.run()} onTurnOff={disableNotifications} />
          {/* sign out ends this device's pairing: last, set apart from the bell, and it asks first */}
          {canSignOut && (
            <button type="button" className="icon-button lock-button header-desktop-only header-group-start" aria-label={t("Sign out")} title={t("Sign out")} onClick={() => setSignOutAsk(true)}>
              <LogOut aria-hidden="true" />
            </button>
          )}
        </div>
        </div>
      </header>

      <MachineActionBanner machines={machines} onSetup={(machine, update = false) => { setDrawerOpen(false); setUpdateRemote(update); setMachineDialog(machine); }} />
      <div className="app-body">
        <aside id="workspace-drawer" className={`sidebar${drawerOpen ? " is-open" : ""}`}>
          {error && <div className="error-state" role="alert"><p>{error}</p><button className="btn" onClick={() => void load()}>{t("Retry")}</button></div>}
          <MachineSidebar onOpenBot={(bot) => void openBot(bot)} onOpenBotPage={selectBot} selectedBotId={botPage ? selectedBotId : null} readOnly={readOnly} onNewBot={() => { setDrawerOpen(false); setNewBotOpen(true); }} onBotSettings={(botId) => { const bot = botsView?.bots.find((entry) => entry.id === botId); if (bot) { showBotSettings(botId); void openBot(bot); } }} version={health?.herdr?.version ?? null} machines={machines} selectedMachineId={selectedMachineId} selectedPaneId={botPage ? null : selectedPaneId} selectedWorkspaceId={botPage ? null : sidebarOwnerId} onSelectWorkspace={selectWorkspace} actions={actions} onSelect={selectTarget} onSetup={(machine, update = false) => { setUpdateRemote(update); setMachineDialog(machine); }} onNew={(id) => { setNewSessionMachineId(id); setNewSessionOpen(true); setDrawerOpen(false); }} />
        </aside>

        {drawerOpen && <div className="scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />}

        {/* a file path in the chat opens in the viewer, relative to the selected pane's folder */}
        <OpenFileContext.Provider value={botPage ? viewBotFile : selectedPaneId !== null ? viewFile : null}>
        <main className="terminal-host">
          {botPage && selectedBotId !== null ? <BotPage botId={selectedBotId} readOnly={readOnly} connected={eventsLive} /> : <SplitTerminals
            key={selectedMachineId}
            machineId={selectedMachineId}
            panes={snapshot?.panes ?? []}
            primaryId={selectedPaneId}
            ownerId={snapshot ? sidebarOwnerId : null}
            viewForPane={pane => pane.pane_id === selectedPaneId ? view : storedView(pane.pane_id, selectedMachineId, pane.agent !== null, terminalAttach, defaultViewFor(pane.pane_id))}
            onPaneView={(id, next) => {
              try { writePaneView(selectedMachineId, id, next); } catch {}
              if (id === selectedPaneId) setView(next);
              refreshPaneViews(value => value + 1);
            }}
            onRefresh={load}
            onMoved={onMoved}
            mutationBusy={nativeMovePending}
            onMovePending={(pending) => {
              if (pending && movePendingRef.current) return false;
              if (pending) moveSelectionRef.current = { machine: selectedMachineRef.current, epoch: navigationRef.current };
              movePendingRef.current = pending ? 1 : 0;
              setNativeMovePending(pending);
              return true;
            }}
            onSelectPrimary={(id) => { setSelectedPaneId(id); setAutoSelected(false); }}
            onOpenFile={(path, paneId) => openFile({ path, paneId, machineId: selectedMachineId })}
            terminal={{
            paneId: selectedPane?.restore_error ? null : selectedPaneId,
            restoreError: selectedPane?.restore_error ?? null,
            agent: selectedAgent,
            agentStatus: selectedPane?.agent_status,
            backgroundTasks: (selectedPane as HerdrPane | null)?.background_tasks ?? 0,
            view,
            autoSelected,
            terminalFontSize: settings.terminalFontSize,
            terminalWheelSpeed: settings.terminalWheelSpeed,
            terminalFontFamily: settings.terminalFontFamily,
            theme: resolvedTheme,
            palette: settings.palette,
            role,
            onRoleAck: setRole,
            onConnectionChange: (next) => { setConnected(next); if (next) setOutputStopped(false); },
            onServerMessage: handleServerMessage,
            }}
          />}
        </main>
        </OpenFileContext.Provider>
      </div>

      <MachineContext.Provider value={newSessionMachineId}><NewSessionDialog
        key={newSessionMachineId}
        machineName={machines.find((m) => m.id === newSessionMachineId)?.name ?? newSessionMachineId}
        open={newSessionOpen}
        defaultCwd={newSessionMachineId === selectedMachineId ? selectedPane?.cwd ?? null : null}
        onClose={() => setNewSessionOpen(false)}
        onCreated={(paneId) => {
          setNewSessionOpen(false);
          selectTarget(newSessionMachineId, paneId);
          void load();
        }}
      /></MachineContext.Provider>
      {machineDialog && <MachineDialog updateRemote={updateRemote} machine={machineDialog === "new" ? undefined : machineDialog} onClose={(underway) => closeMachineDialog(!underway)} onConnected={(id) => { closeMachineDialog(false); selectTarget(id, null); void load(); }} />}
      <Droplet onOpen={(machineId, paneId) => {
        // an ended pane's card outlives the pane: the refetch has dropped it, and selecting it attaches nothing
        if (!machinesRef.current.find((m) => m.id === machineId)?.snapshot?.panes.some((p) => p.pane_id === paneId)) return;
        // Files lists the pane it was opened on, and would open its paths on the new one
        setFilesOpen(false);
        selectTargetRef.current(machineId, paneId);
      }} />
      {fleetOpen && <FleetPanel machines={machines} onClose={closeFleet} onOpen={(machineId, paneId) => { setDrawerOpen(false); selectTargetRef.current(machineId, paneId); }} onSetup={(machine) => { setDrawerOpen(false); setUpdateRemote(false); setMachineDialog(machine); }} onConnections={() => { setSettingsSection("remote"); setSettingsOpen(true); }} />}
      <NewBotDialog open={newBotOpen} onOpenChange={setNewBotOpen} onCreated={(bot) => void openBot(bot)} />
      {openRigOpen && <OpenRigPanel canManageService={auth?.authenticated === true && auth.role !== "watch" && role !== "observe"} readOnly={auth?.authenticated !== true || auth.role === "watch" || role === "observe"} onClose={closeOpenRig} onOpened={() => { void load(); }} />}
      <SettingsDialog auth={auth} open={settingsOpen} onClose={closeSettings} actions={actions} updates={updates} onEnableNotifications={enableNotifications} onDisableNotifications={disableNotifications} section={settingsSection} />
      {filesOpen && selectedPane && (
        <FilesDialog start={selectedPane.foreground_cwd ?? selectedPane.cwd ?? ""} viewing={viewing !== null} onOpenFile={viewFile} onClose={() => setFilesOpen(false)} />
      )}
      {viewing !== null && <MachineContext.Provider value={viewing.machineId}>
        <FileViewer key={viewing.path} path={viewing.path} paneId={viewing.paneId} onClose={closeFile} onOpen={(path) => openFile({ ...viewing, path })} />
      </MachineContext.Provider>}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} machines={machines} selectedMachineId={selectedMachineId} selectedPaneId={botPage ? null : selectedPaneId} view={view} actions={actions} onSelectTarget={(machineId, paneId) => selectTargetRef.current(machineId, paneId)} />
      {signOutAsk && <ConfirmDialog title={t("Sign out of this device?")} body={t("To get back in, this device needs a new pairing code from the PC.")} confirmLabel={t("Sign out")}
        onConfirm={async () => { await lock(); setSignOutAsk(false); }} onClose={() => setSignOutAsk(false)} />}
    </div></MachineContext.Provider>
  );
}
