// Where each Needs-you card sits, and since when. When an answered card leaves, the next one moves into
// its place; a quick second click there would answer a card the owner has not read (an approval types
// into a terminal). A card that just appeared or moved ignores answers for a moment; one in place does not.

/** How long a card that appeared or moved ignores an answer. */
export const SETTLE_MS = 500;

export interface Placement { index: number; since: number }

/**
 * The placements after a render. A card keeps its time while its place holds; a new or moved card gets
 * `now`. The first render has no earlier list to move from: its cards count as settled (`since` 0).
 */
export function nextPlacements(previous: ReadonlyMap<string, Placement> | null, keys: readonly string[], now: number): Map<string, Placement> {
  return new Map(keys.map((key, index) => {
    const before = previous?.get(key);
    if (previous === null) return [key, { index, since: 0 }];
    return [key, before && before.index === index ? before : { index, since: now }];
  }));
}

/** True when the card has held its place long enough to take an answer. */
export function settled(placement: Placement | undefined, now: number, ms = SETTLE_MS): boolean {
  return placement === undefined || now - placement.since >= ms;
}
