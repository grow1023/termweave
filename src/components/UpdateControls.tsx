import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { Markdown } from "./Markdown.tsx";
import { useHerdrUpdate } from "../lib/herdrUpdate.ts";
import type { UpdatesModel } from "../lib/updates.ts";
import "./UpdateControls.css";
import { useT } from "../lib/i18n.ts";

/** "v0.2.0 (1c4ad6a0e502)" when the version is known, else the commit alone. */
function versionLabel(version: string | null | undefined, revision: string | null | undefined): string | null {
  const commit = revision?.slice(0, 12);
  if (version) return commit ? `v${version} (${commit})` : `v${version}`;
  return commit ?? null;
}

export function UpdateControls({ updates, bridgesFollow = false }: { updates: UpdatesModel; bridgesFollow?: boolean }) {
  const t = useT();
  const { status, error, busy, needsReload, request } = updates;
  return <section className="settings-section settings-updates">
    <h3>{t("Updates")}</h3>
    <p className="settings-hint">{status?.current_revision ? t("Running {version}", { version: versionLabel(status.current_version, status.current_revision) ?? "" }) : "TermWeave"}</p>
    <p className="settings-hint" role="status">
      {error ?? status?.error ?? status?.blocked_reason ?? (busy ?
        status?.phase === "building" ? t("Installing dependencies and building…") : status?.phase === "restarting" ? t("Restarting the bridge…") : t("Checking for updates…") :
        status?.available ? t("Version {version} is available.", { version: versionLabel(status.latest_version, status.latest_revision) ?? "" }) : status?.checked_at ? t("Up to date.") : t("Waiting for an update check…"))}
    </p>
    {status?.managed && <>
      <p className="settings-hint">{t("Checks for new releases every 5 minutes.")} {t(status.auto_update ? "Automatic installation is enabled." : "Install when you are ready; the bridge briefly reconnects and herdr sessions keep running.")}{bridgesFollow ? ` ${t("Remote PCs' bridges are updated afterwards when the new version needs it.")}` : ""}</p>
      <div className="update-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void request("check")}>{t("Check for updates")}</button>
        <button type="button" className="btn btn-primary" disabled={busy || !status.available || !!status.blocked_reason} onClick={() => void request("install")}>{t("Update and restart")}</button>
      </div>
    </>}
    {status?.checked_at && <p className="settings-hint">{t("Last checked {time}", { time: new Date(status.checked_at).toLocaleString() })}</p>}
    {needsReload && <p className="settings-hint">{t("The server was updated. Save any unsent drafts, then")} <button type="button" className="btn" onClick={() => window.location.reload()}>{t("Reload app")}</button></p>}
  </section>;
}

/**
 * herdr itself. `herdr update` typed into a pane is refused by herdr, and every terminal here is
 * a pane: the server runs it instead and moves the running panes onto the new version.
 */
export function HerdrUpdateControls({ enabled }: { enabled: boolean }) {
  const t = useT();
  const { status, error, busy, request } = useHerdrUpdate(enabled);
  // Windows, an older server, a herdr that does not answer: nothing to offer
  if (!status?.supported) return null;
  const version = status.server_version ?? status.binary_version;
  const stale = status.stale && !!status.binary_version && !!status.server_version;
  return <section className="settings-section settings-herdr-update">
    <h3>herdr</h3>
    {version && <p className="settings-hint">{t("Running herdr {version}", { version })}</p>}
    {stale && <p className="settings-hint">{t("herdr {installed} is installed, but the running server is {running}. Updating moves your panes onto the installed version.", { installed: status.binary_version ?? "", running: status.server_version ?? "" })}</p>}
    <p className="settings-hint">{t("Installs the newest herdr on the PC this app runs on and moves its running panes onto it. Panes and agents keep running, and open terminals reconnect.")}</p>
    <div className="update-actions">
      <button type="button" className={stale ? "btn btn-primary" : "btn"} disabled={busy} onClick={() => void request()}>{t("Update herdr")}</button>
    </div>
    {(error || busy) && <p className="settings-hint" role="status">{error ?? t("Updating herdr…")}</p>}
    {/* herdr's own words: what it installed, or why it did not */}
    {!busy && status.output && <pre className="update-output" data-failed={status.phase === "error" || undefined}>{status.output}</pre>}
  </section>;
}

/**
 * The header's update button, left of the Chat/Terminal switch: only while not up to date.
 * It opens what the release changes (its update post) first; Install is pressed there.
 */
export function UpdateButton({ updates }: { updates: UpdatesModel }) {
  const t = useT();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const install = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { status, busy, request } = updates;
  // showModal focuses the first control, a link in the notes: the choice the dialog is for comes first
  useEffect(() => { if (open) { dialog.current?.showModal(); install.current?.focus(); } }, [open]);
  const working = status?.phase === "building" || status?.phase === "restarting";
  if (!working && !status?.available) return null;
  const label = working ? t("Updating…") : t("Update to v{version}", { version: status?.latest_version ?? "" });
  return <>
    <button type="button" className="btn btn-primary header-update" disabled={busy || !!status?.blocked_reason}
      aria-label={label} aria-haspopup="dialog" title={status?.blocked_reason ?? t("See what is new, then install")}
      onClick={() => setOpen(true)}>
      <Download aria-hidden="true" /><span className="header-desktop-only">{label}</span>
    </button>
    {open && createPortal(<dialog ref={dialog} className="modal update-dialog" aria-labelledby={id} onClose={() => setOpen(false)}>
      <header className="modal-header"><h2 className="modal-title" id={id}>{t("What is new in v{version}", { version: status?.latest_version ?? "" })}</h2></header>
      <div className="modal-body update-notes">
        {status?.latest_notes ? <Markdown>{status.latest_notes}</Markdown> : <p>{t("The release notes could not be loaded.")}</p>}
        <p className="settings-hint">{t("Install the new version and restart; herdr sessions keep running")}</p>
      </div>
      <footer className="modal-footer">
        <button type="button" className="btn" onClick={() => dialog.current?.close()}>{t("Later")}</button>
        <button type="button" className="btn btn-primary" ref={install} disabled={busy || !status?.available || !!status?.blocked_reason}
          onClick={() => { dialog.current?.close(); void request("install"); }}>{t("Install and restart")}</button>
      </footer>
    </dialog>, document.body)}
  </>;
}
