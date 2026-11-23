import { useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { ZOOM_MAX, ZOOM_MIN, nextZoom, readZoom, setZoom } from "../lib/pageZoom.ts";
import { useT } from "../lib/i18n.ts";

/** Phone-only zoom buttons in the header's more menu: Cmd+= / Cmd+- for a touch screen. */
export function ZoomControls() {
  const t = useT();
  const [zoom, setLocal] = useState(readZoom);
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return null;
  const apply = (next: number) => { setZoom(next); setLocal(next); };
  return (
    <span className="zoom-controls" role="group" aria-label={t("Page zoom")}>
      <button type="button" className="icon-button" aria-label={t("Zoom out")} title={t("Zoom out")} disabled={zoom <= ZOOM_MIN} onClick={() => apply(nextZoom(zoom, -1))}><ZoomOut aria-hidden="true" /></button>
      <button type="button" className="btn zoom-level" aria-label={t("Reset zoom")} title={t("Reset zoom")} onClick={() => apply(1)}>{Math.round(zoom * 100)}%</button>
      <button type="button" className="icon-button" aria-label={t("Zoom in")} title={t("Zoom in")} disabled={zoom >= ZOOM_MAX} onClick={() => apply(nextZoom(zoom, 1))}><ZoomIn aria-hidden="true" /></button>
    </span>
  );
}
