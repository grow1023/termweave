// The hook over answered-line.ts, shared by the Home panel's Needs-you cards and the chat's dock
// (src/orca/chat/bot/WorkerApprovals.tsx): answered cards stay as a line for a moment, then leave.
import { useCallback, useEffect, useState } from "react";

import {
  ANSWERED_SHOWN_MS,
  type AnsweredRecord,
  isHidden,
  liveLines,
  nextAnsweredChange,
  pruneAnswered,
} from "./answered-line.ts";

export interface AnsweredLines {
  /** The lines on screen now. */
  lines: AnsweredRecord[];
  /** True while the item answered as `key` with `stamp` must not show as a card. */
  hides: (key: string, stamp: string) => boolean;
  /** Records an answer that went through. */
  add: (answered: Omit<AnsweredRecord, "until">) => void;
}

/** `present`: the cards the server lists now, so a record ends once its item has left or changed. */
export function useAnsweredLines(present: readonly { key: string; stamp: string }[]): AnsweredLines {
  const [records, setRecords] = useState<readonly AnsweredRecord[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const presentSignature = present.map((each) => `${each.key}\u0000${each.stamp}`).join("\u0001");
  useEffect(() => {
    // the signature stands for `present`, so the effect runs when the list changes, not on every render
    const kept = pruneAnswered(records, present, now);
    if (kept.length !== records.length) setRecords(kept);
  }, [records, presentSignature, now]);
  useEffect(() => {
    const at = nextAnsweredChange(records, Date.now());
    if (at === null) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  }, [records, now]);
  const add = useCallback((answered: Omit<AnsweredRecord, "until">) => {
    const at = Date.now();
    setNow(at);
    setRecords((previous) => [...previous.filter((record) => record.key !== answered.key), { ...answered, until: at + ANSWERED_SHOWN_MS }]);
  }, []);
  const hides = useCallback((key: string, stamp: string) => isHidden(records, key, stamp), [records]);
  return { lines: liveLines(records, now), hides, add };
}
