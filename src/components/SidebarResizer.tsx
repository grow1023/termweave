// The sidebar's right edge as a handle: drag it to make the sidebar wider or narrower, or use the
// arrow keys; a double click goes back to the stylesheet's width. Desktop only: on a phone the
// sidebar is a drawer (styles.css hides this).
import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";

import { useT } from "../lib/i18n.ts";
import { clampSidebarWidth, SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_STEP } from "../lib/sidebarWidth.ts";

export function SidebarResizer({ width, onChange, onCommit }: {
  /** the width in use now, in px */
  width: number;
  /** while dragging: null goes back to the stylesheet's width */
  onChange: (width: number | null) => void;
  /** the drag or key press ended: keep this width */
  onCommit: (width: number | null) => void;
}) {
  const t = useT();
  const drag = useRef<{ startX: number; startWidth: number; last: number } | null>(null);
  const move = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (held === null) return;
    const next = clampSidebarWidth(held.startWidth + event.clientX - held.startX, window.innerWidth);
    if (next === held.last) return;
    held.last = next;
    onChange(next);
  }, [onChange]);
  const end = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (held === null) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    document.documentElement.removeAttribute("data-sidebar-resizing");
    onCommit(held.last);
  }, [onCommit]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = (event.shiftKey ? 4 : 1) * SIDEBAR_STEP;
    const next = event.key === "ArrowLeft" ? width - step : event.key === "ArrowRight" ? width + step
      : event.key === "Home" ? SIDEBAR_MIN : event.key === "End" ? SIDEBAR_MAX : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = clampSidebarWidth(next, window.innerWidth);
    onChange(clamped);
    onCommit(clamped);
  };
  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Sidebar width")}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={Math.round(width)}
      title={t("Drag to resize the sidebar. Double-click to reset.")}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width, last: Math.round(width) };
        // the whole page shows the resize cursor and selects no text while the edge moves
        document.documentElement.setAttribute("data-sidebar-resizing", "");
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => { onChange(null); onCommit(null); }}
      onKeyDown={onKeyDown}
    />
  );
}
