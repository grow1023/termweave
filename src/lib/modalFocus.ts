/**
 * Focus for a dialog drawn as a `div role="dialog" aria-modal`: Tab and Shift+Tab stay inside
 * it, Escape closes it, and on close the focus goes back to the control that opened it. The
 * native `<dialog>` does all of this itself; these dialogs stay divs so the toasts and menus
 * they open keep their stacking order.
 *
 * Escape that ends a Korean or Japanese IME composition belongs to the IME: it cancels the
 * syllable being typed, and must not also close the dialog.
 */
import { useEffect, useRef, type RefObject } from "react";

/** True for a key event that an IME is still composing (WebKit reports some as key code 229). */
export function isComposingKey(event: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean {
  return event.isComposing || event.keyCode === 229;
}

/** True when this key event should close the dialog. */
export function isCloseKey(event: Pick<KeyboardEvent, "key" | "isComposing" | "keyCode" | "defaultPrevented">): boolean {
  return event.key === "Escape" && !event.defaultPrevented && !isComposingKey(event);
}

/**
 * Where Tab moves the focus among `count` focusable controls, from the one at `index` (-1 when
 * the focus is outside them): the first or last wraps around, otherwise null lets the browser
 * move it as usual.
 */
export function trapIndex(count: number, index: number, backwards: boolean): number | null {
  if (count === 0) return null;
  if (index < 0) return backwards ? count - 1 : 0;
  if (backwards && index === 0) return count - 1;
  if (!backwards && index === count - 1) return 0;
  return null;
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [tabindex]:not([tabindex='-1'])";

function focusables(container: HTMLElement): HTMLElement[] {
  // a hidden control (a closed <details>, a search-hidden row) has no box and takes no focus
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));
}

/** The focus sits in another modal (a confirmation opened from this one): that one owns the keys. */
function inOtherModal(container: HTMLElement): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && !container.contains(active) && active.closest("[aria-modal='true'], dialog[open]") !== null;
}

export interface ModalFocusOptions {
  /** the dialog is shown */
  readonly open: boolean;
  /** false while a dialog stacked above this one owns the keys */
  readonly active?: boolean;
  readonly onClose: () => void;
}

/** Traps Tab in `container`, closes on Escape, and returns the focus to the opener on close. */
export function useModalFocus(container: RefObject<HTMLElement | null>, { open, active = true, onClose }: ModalFocusOptions): void {
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surface = container.current;
    return () => {
      // only when the focus went down with the dialog: a control that took it on purpose keeps it
      const target = opener.current;
      const lost = document.activeElement === null || document.activeElement === document.body || (surface?.contains(document.activeElement) ?? false);
      if (lost && target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, container]);

  useEffect(() => {
    if (!open || !active) return;
    const onKey = (event: KeyboardEvent): void => {
      const surface = container.current;
      if (!surface) return;
      if (isCloseKey(event)) { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || event.defaultPrevented || inOtherModal(surface)) return;
      const list = focusables(surface);
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = trapIndex(list.length, index, event.shiftKey);
      if (next === null) return;
      event.preventDefault();
      list[next]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, active, container]);
}
