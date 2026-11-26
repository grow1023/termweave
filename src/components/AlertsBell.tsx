import { useEffect, useId, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useT } from "../lib/i18n.ts";

export interface BellState { label: string; title: string; on: boolean; blocked: boolean }

/**
 * The header bell. Off or blocked, one press does what its title says (ask, turn on, open
 * Settings). On, a press only shows the state and the off switch: turning this device's alerts
 * off silences phone notifications, and it sat beside the most-pressed header icons.
 */
export function AlertsBell({ bell, onPress, onTurnOff }: { bell: BellState; onPress(): void; onTurnOff(): Promise<unknown> }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (!bell.on) setOpen(false); }, [bell.on]);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent): void => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      // the phone's More menu closes on Escape too: this popover takes the first one
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  const turnOff = async (): Promise<void> => {
    setBusy(true);
    try { await onTurnOff(); } finally { setBusy(false); setOpen(false); button.current?.focus(); }
  };

  return <span className="bell-wrap" ref={root}>
    <button
      ref={button}
      type="button"
      className={`icon-button bell-button${bell.on ? " is-on" : ""}${bell.blocked ? " is-blocked" : ""}`}
      aria-label={bell.label}
      aria-haspopup={bell.on ? "dialog" : undefined}
      aria-expanded={bell.on ? open : undefined}
      aria-controls={bell.on && open ? id : undefined}
      title={bell.on ? undefined : bell.title}
      onClick={() => { if (bell.on) setOpen(!open); else onPress(); }}
    >
      {bell.blocked ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
      {/* shown in the phone's tools menu only (styles.css) */}
      <span className="header-tool-label">{bell.label}</span>
    </button>
    {open && <div className="bell-popover" id={id} role="dialog" aria-label={bell.label}>
      <p className="bell-popover-text">{bell.title}</p>
      <button type="button" className="btn" disabled={busy} onClick={() => void turnOff()}>{t("Turn off alerts on this device")}</button>
    </div>}
  </span>;
}
