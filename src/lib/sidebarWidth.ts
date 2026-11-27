// The sidebar's width as the viewer set it by dragging its edge: a per-viewer convenience kept in
// this browser. Pure rules here; the handle is src/components/SidebarResizer.tsx.

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 640;
export const SIDEBAR_KEY = "termweave:sidebar-width";
/** how far one arrow key moves the edge; with Shift, four times as far */
export const SIDEBAR_STEP = 16;

/** The width kept inside its limits; the sidebar never takes more than 60% of the window. */
export function clampSidebarWidth(width: number, viewport: number): number {
  const most = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(viewport * 0.6)));
  return Math.round(Math.min(most, Math.max(SIDEBAR_MIN, width)));
}

/** The stored width, or null when nothing usable is stored (the stylesheet's own width then applies). */
export function parseStoredWidth(raw: string | null): number | null {
  if (raw === null) return null;
  const width = Number(raw);
  return Number.isFinite(width) && width >= SIDEBAR_MIN && width <= SIDEBAR_MAX ? Math.round(width) : null;
}

export function readSidebarWidth(): number | null {
  try { return parseStoredWidth(window.localStorage.getItem(SIDEBAR_KEY)); } catch { return null; }
}

export function storeSidebarWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(SIDEBAR_KEY);
    else window.localStorage.setItem(SIDEBAR_KEY, String(width));
  } catch { /* the width then lasts until the page reloads */ }
}
