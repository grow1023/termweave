// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/ui/portal-container-context.ts; adapted for React 18 and TermWeave.
import { cn } from "../cn.ts";

/**
 * Radix portals render outside the page's `.orca` element, so the design tokens would be missing.
 * Every portaled surface (dialog, menus, tooltip, hover card, popover) passes its class through
 * this helper: it puts `orca` first, then the caller's classes. Orca's container context and
 * overlay focus bookkeeping are not copied.
 */
export function OrcaPortalScope(...classes: Parameters<typeof cn>): string {
  return cn("orca", ...classes);
}
