// TermWeave's own: what the Bots section remembers between visits, in localStorage (a failed access only
// means the fold lasts this visit).
import { useCallback, useState } from "react";

const BOT_FOLD_KEY = "termweave.bots.folded";
const SECTION_FOLD_KEY = "termweave.bots.sectionFolded";

function readFoldedBots(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(BOT_FOLD_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

function readSectionFolded(): boolean {
  try { return localStorage.getItem(SECTION_FOLD_KEY) === "1"; } catch { return false; }
}

/** The bots whose workers are folded away, and a toggle that remembers it. */
export function useFoldedBots(): { folded: readonly string[]; toggle: (botId: string) => void } {
  const [folded, setFolded] = useState<string[]>(readFoldedBots);
  const toggle = useCallback((botId: string) => {
    setFolded((current) => {
      const next = current.includes(botId) ? current.filter((id) => id !== botId) : [...current, botId];
      try { localStorage.setItem(BOT_FOLD_KEY, JSON.stringify(next)); } catch { /* lasts this visit */ }
      return next;
    });
  }, []);
  return { folded, toggle };
}

/** Whether the whole Bots section is folded to its small faces. */
export function useSectionFolded(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState<boolean>(readSectionFolded);
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem(SECTION_FOLD_KEY, next ? "1" : "0"); } catch { /* lasts this visit */ }
      return next;
    });
  }, []);
  return { collapsed, toggle };
}
