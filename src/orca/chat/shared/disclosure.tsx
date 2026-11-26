// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/disclosure/native-chat-disclosure-store.ts; adapted for TermWeave.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface DisclosureStore {
  read: (key: string) => boolean | undefined;
  /** Opening with `group` (a key prefix) closes that group's other open keys: one open at a time. */
  write: (key: string, open: boolean, group?: string) => void;
}

const DisclosureContext = createContext<DisclosureStore | null>(null);

/** Bound disclosure memory across long-lived sessions. */
export const MAX_CHAT_DISCLOSURES = 512;

type OpenMap = ReadonlyMap<string, boolean>;
const EMPTY: OpenMap = new Map();

function nextMap(current: OpenMap, key: string, next: boolean, group: string | undefined): OpenMap {
  const others = next && group !== undefined
    ? [...current].filter(([other, open]) => open && other !== key && other.startsWith(group))
    : [];
  if (current.get(key) === next && others.length === 0) return current;
  const entries: [string, boolean][] = [...current].map(([k, v]) => [k, others.some(([o]) => o === k) ? false : v]);
  const updated = new Map([...entries.filter(([k]) => k !== key), [key, next] as [string, boolean]]);
  if (updated.size <= MAX_CHAT_DISCLOSURES) return updated;
  const oldest = updated.keys().next().value;
  return oldest === undefined || oldest === key ? updated : new Map([...updated].filter(([k]) => k !== oldest));
}

/**
 * Holds every row's open state, so a poll that replaces message objects keeps what the reader opened.
 * Decision: `resetKey` (the feed's `historyId`) clears the memory when it changes; the old map is
 * dropped on the first write after the change, and reads ignore it until then.
 */
export function ChatDisclosureProvider({ resetKey, children }: { resetKey: string | null; children: ReactNode }) {
  const [state, setState] = useState<{ resetKey: string | null; open: OpenMap }>(() => ({ resetKey, open: EMPTY }));
  const open = state.resetKey === resetKey ? state.open : EMPTY;
  const write = useCallback((key: string, next: boolean, group?: string) => {
    setState((current) => {
      const base = current.resetKey === resetKey ? current.open : EMPTY;
      const updated = nextMap(base, key, next, group);
      return updated === current.open && current.resetKey === resetKey ? current : { resetKey, open: updated };
    });
  }, [resetKey]);
  const store = useMemo<DisclosureStore>(() => ({ read: (key) => open.get(key), write }), [open, write]);
  return <DisclosureContext.Provider value={store}>{children}</DisclosureContext.Provider>;
}

export interface ChatDisclosure {
  open: boolean;
  /** A reader's choice: remembered past this row's lifetime when keyed. */
  setOpen: (open: boolean) => void;
}

/** Open state for one disclosure. Without a key or a provider it is local state only. */
export function useDisclosure(
  key: string | undefined,
  initial: boolean,
  /** A key prefix whose disclosures open one at a time. */
  group?: string,
): ChatDisclosure {
  const store = useContext(DisclosureContext);
  const [local, setLocal] = useState({ key, initial, open: initial });
  const write = store?.write;
  const localOpen = local.key === key && local.initial === initial ? local.open : initial;
  const open = key !== undefined && store !== null ? (store.read(key) ?? localOpen) : localOpen;
  const setOpen = useCallback((next: boolean) => {
    setLocal({ key, initial, open: next });
    if (key !== undefined && write) write(key, next, group);
  }, [group, initial, key, write]);
  return { open, setOpen };
}
