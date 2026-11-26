// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotRow.tsx (menuItems, menuFooter) and
// BotSidebarRow.tsx (Rename); adapted for TermWeave. The same items fill the right-click menu and the "…" menu.
import type { ReactNode } from "react";
import { Copy, Pause, Pencil, Play, Settings, Trash2 } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { ContextMenuItem, ContextMenuSeparator } from "../../ui/context-menu.tsx";
import { DropdownMenuItem, DropdownMenuSeparator } from "../../ui/dropdown-menu.tsx";

interface MenuItemProps { onSelect?: (event: Event) => void; disabled?: boolean; variant?: "default" | "destructive"; children?: ReactNode }

/** The two menus draw the same rows with their own parts. */
export interface MenuKit { Item: (props: MenuItemProps) => ReactNode; Separator: (props: Record<string, never>) => ReactNode }

export const CONTEXT_KIT: MenuKit = { Item: ContextMenuItem, Separator: ContextMenuSeparator };
export const DROPDOWN_KIT: MenuKit = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator };

export interface BotMenuActions {
  /** the viewer can only watch: what changes something is off */
  readOnly: boolean;
  paused: boolean;
  onRename: () => void;
  onSettings: () => void;
  onTogglePause: () => void;
  onCopyPath: () => void;
  onDelete: () => void;
}

export function BotMenuItems({ kit, actions }: { kit: MenuKit; actions: BotMenuActions }): JSX.Element {
  const t = useT();
  const { Item, Separator } = kit;
  return (
    <>
      <Item disabled={actions.readOnly} onSelect={actions.onRename}>
        <Pencil className="size-3.5" />
        {t("Rename")}
      </Item>
      <Item onSelect={actions.onSettings}>
        <Settings className="size-3.5" />
        {t("Bot settings…")}
      </Item>
      <Item disabled={actions.readOnly} onSelect={actions.onTogglePause}>
        {actions.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        {actions.paused ? t("Resume bot") : t("Pause bot")}
      </Item>
      <Separator />
      <Item onSelect={actions.onCopyPath}>
        <Copy className="size-3.5" />
        {t("Copy Path")}
      </Item>
      <Separator />
      <Item variant="destructive" disabled={actions.readOnly} onSelect={actions.onDelete}>
        <Trash2 className="size-3.5" />
        {t("Delete bot")}
      </Item>
    </>
  );
}
