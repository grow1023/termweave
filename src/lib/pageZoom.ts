/*
 * Page zoom on a phone, the way Cmd+= / Cmd+- zoom the Mac app (tools/mac-app/main.swift, same steps).
 * A phone browser has no zoom command a page can call, so the zoom rewrites the viewport meta tag:
 * width = screen width / zoom gives the layout the room a zoomed browser would, and initial-scale
 * fits that layout to the screen. Header, terminal and key bar all scale together; the terminal
 * refits to the new width as on any resize. Desktop browsers ignore the tag and keep their own zoom.
 */

export const ZOOM_STEPS: readonly number[] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const ZOOM_MIN = 0.5, ZOOM_MAX = 2;
const KEY = "termweave.pageZoom";
const BASE = "viewport-fit=cover, interactive-widget=resizes-content";

export function nextZoom(current: number, direction: 1 | -1): number {
  const up = ZOOM_STEPS.find(s => s > current + 0.001);
  const down = [...ZOOM_STEPS].reverse().find(s => s < current - 0.001);
  return (direction > 0 ? up : down) ?? current;
}

export function readZoom(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    return ZOOM_STEPS.some(s => s === value) ? value : 1;
  } catch { return 1; }
}

/** the screen's width in the current orientation, in CSS px at zoom 1 (screen.* does not follow the page's zoom) */
function screenWidth(): number {
  const landscape = window.matchMedia("(orientation: landscape)").matches;
  return landscape ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
}

export function applyZoom(zoom: number): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  meta.content = zoom === 1
    ? `width=device-width, initial-scale=1, ${BASE}`
    : `width=${Math.round(screenWidth() / zoom)}, initial-scale=${zoom}, ${BASE}`;
}

export function setZoom(zoom: number): void {
  try { localStorage.setItem(KEY, String(zoom)); } catch {}
  applyZoom(zoom);
}

/** reapply the saved zoom at startup and after a rotation, which changes the screen width */
export function startZoom(): void {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  applyZoom(readZoom());
  window.matchMedia("(orientation: landscape)").addEventListener("change", () => applyZoom(readZoom()));
}
