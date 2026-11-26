// The hook over card-placement.ts, shared by the Home panel's Needs-you cards and the chat's dock
// (src/orca/chat/bot/WorkerApprovals.tsx), so a card that just appeared or moved ignores a fast
// second click or key press the same way in both places.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { nextPlacements, SETTLE_MS, settled, type Placement } from "./card-placement.ts";

/**
 * Asks whether a card has held its place long enough to take an answer. The placements are taken
 * after each commit and before paint, so no click can land on a card that moved before it is timed.
 * A key must not contain a space. Call it before any early return, so timing goes on while the list is empty.
 */
export function useSettledCards(keys: readonly string[]): (key: string) => boolean {
  const placed = useRef<Map<string, Placement> | null>(null);
  const signature = keys.join(" ");
  useLayoutEffect(() => {
    placed.current = nextPlacements(placed.current, signature === "" ? [] : signature.split(" "), Date.now());
  }, [signature]);
  return useCallback((key: string) => settled(placed.current?.get(key), Date.now()), []);
}

/**
 * The same timing for the look of a card (BOT-22): Approve is filled only once its card has settled.
 * Unlike the answer guard, a card counts as new on the first render too (it has just appeared to the
 * eye), and the result is known during render, so the very first paint already shows the quiet look.
 * It renders again when the last unsettled card settles.
 */
export function useSettledLook(keys: readonly string[]): (key: string) => boolean {
  const committed = useRef<Map<string, Placement>>(new Map());
  const signature = keys.join(" ");
  const placements = useMemo(
    () => nextPlacements(committed.current, signature === "" ? [] : signature.split(" "), Date.now()),
    [signature],
  );
  const [, setTick] = useState(0);
  useLayoutEffect(() => {
    committed.current = placements;
  }, [placements]);
  useEffect(() => {
    const waits = [...placements.values()].map((placement) => placement.since + SETTLE_MS - Date.now()).filter((ms) => ms > 0);
    if (waits.length === 0) return undefined;
    const timer = setTimeout(() => setTick((tick) => tick + 1), Math.max(...waits));
    return () => clearTimeout(timer);
  }, [placements]);
  return (key: string) => settled(placements.get(key), Date.now());
}

/** For a card outside a list (an item's own view): settled once it has been on screen SETTLE_MS. */
export function useMountedSettled(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  return done;
}
