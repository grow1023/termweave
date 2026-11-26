// The hook over card-placement.ts, shared by the Home panel's Needs-you cards and the chat's dock
// (src/orca/chat/bot/WorkerApprovals.tsx), so a card that just appeared or moved ignores a fast
// second click or key press the same way in both places.
import { useCallback, useLayoutEffect, useRef } from "react";

import { nextPlacements, settled, type Placement } from "./card-placement.ts";

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
