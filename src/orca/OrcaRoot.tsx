import type { HTMLAttributes } from "react";

import { cn } from "./cn.ts";
import { TooltipProvider } from "./ui/tooltip.tsx";

/**
 * The element every Orca screen sits in: class `orca` turns on Orca's tokens and base styles
 * (orca.css), and the provider is what its tooltips need. Portaled surfaces (dialogs, menus)
 * carry the class themselves (ui/portal.tsx).
 */
export function OrcaRoot({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <TooltipProvider delayDuration={300}><div {...rest} className={cn("orca", className)}>{children}</div></TooltipProvider>;
}
