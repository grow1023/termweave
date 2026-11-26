import { useState, type ReactNode } from "react";
import { ApiError } from "../lib/api.ts";
import { useT } from "../lib/i18n.ts";
import { pushSupported, testDevicePush } from "../lib/push.ts";
import { pushFailureReason } from "../lib/pushTestReason.ts";
import { useSettings } from "../lib/settings.ts";

type Result = Awaited<ReturnType<typeof testDevicePush>> | "failed" | "setup-failed" | "sending" | null;

export interface PushTestControlsProps {
  onEnable: () => Promise<boolean>;
  /** turns this device's alerts off, as the header bell does; without it Settings shows no on/off switch */
  onDisable?: () => Promise<void>;
  /** the alert-type rows, between the on/off switch and the test, which comes after setup */
  children?: ReactNode;
}

/**
 * Settings → Alerts: the on/off switch for this device, then the kinds of alert, then a test push
 * and its outcome. A failure names the cause the browser or server gave and offers the repair.
 */
export function PushTestControls({ onEnable, onDisable, children }: PushTestControlsProps) {
  const { settings } = useSettings();
  const t = useT();
  const [result, setResult] = useState<Result>(null);
  const [reason, setReason] = useState("");
  const supported = pushSupported();
  const permission = globalThis.Notification?.permission;
  const denied = permission === "denied";
  const busy = result === "sending";
  const enable = !settings.alertsOn || result === "missing" || result === "permission" || result === "failed" || result === "setup-failed";

  const send = async (repair: boolean) => {
    setResult("sending");
    setReason("");
    try {
      if (repair) setResult(await onEnable() ? "sent" : "setup-failed");
      else setResult(await testDevicePush());
    } catch (error) {
      if (error instanceof ApiError && error.code === "subscription_not_found") { setResult("missing"); return; }
      setReason(pushFailureReason(error));
      setResult(repair ? "setup-failed" : "failed");
    }
  };
  const turn = async (on: boolean) => {
    if (on) { await send(true); return; }
    setResult("sending");
    try { await onDisable?.(); } finally { setResult(null); setReason(""); }
  };

  const failed = reason
    ? t("Could not send the test notification ({reason}). Set up alerts again below, then send another test.", { reason })
    : t("Could not send the test notification. Set up alerts again below, then send another test.");
  const status = !supported || result === "unsupported" ? t("Push alerts need HTTPS or localhost, and on iPhone the home-screen app.")
    : denied ? t("Allow notifications in your browser settings, then try again.")
    : result === "sent" ? t("Test notification sent. Check this device for the alert.")
    : result === "missing" ? t("This device's push subscription is missing. Turn alerts on again.")
    : result === "permission" ? t("Allow notifications to test alerts on this device.")
    : result === "failed" ? failed
    : result === "setup-failed" ? t("Could not set up alerts on this device. Allow notifications for this site, then set up alerts again.")
    : !settings.alertsOn ? t("Alerts off") : null;
  const repairLabel = result === "failed" || result === "setup-failed" ? t("Set up alerts again") : !settings.alertsOn && result === null ? t("Turn alerts on") : t("Turn alerts on again");

  return (
    <>
      {onDisable && (
        <div className="settings-row">
          <div>
            <span className="settings-label">{t("Alerts on this device")}</span>
            <span className="settings-description">{settings.alertsOn && permission === "granted" ? t("Sent to this device, even with the app closed when the browser supports it.") : t("Off: no alerts come to this device.")}</span>
          </div>
          <button
            type="button"
            className="settings-toggle"
            role="switch"
            aria-checked={settings.alertsOn && permission === "granted"}
            aria-label={t("Alerts on this device")}
            disabled={busy || denied || globalThis.Notification === undefined}
            onClick={() => void turn(!(settings.alertsOn && permission === "granted"))}
          >
            <span className="settings-toggle-thumb" />
          </button>
        </div>
      )}
      {children}
      <div className="settings-row">
        <div><span className="settings-label">{t("Test notification")}</span><span className="settings-description">{t("Check whether this device can receive push alerts")}</span></div>
        <button type="button" className="btn" disabled={busy || !settings.alertsOn || !supported || denied} onClick={() => void send(false)}>{busy ? t("Sending…") : t("Send test")}</button>
      </div>
      <p className="settings-hint" role="status">{status}</p>
      {enable && supported && !denied && <div className="phone-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void send(true)}>{repairLabel}</button>
      </div>}
    </>
  );
}
