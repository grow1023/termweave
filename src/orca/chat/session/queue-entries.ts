// TermWeave's own list of the owner's messages that are not in the chat yet. Pure, so
// queue-entries.test.ts covers it. Sending is optimistic only as far as the journal allows: a message
// shows in the transcript when its row arrives; until then it is listed here with its state.
import type { JournalRow, QueuedMessage, Submission } from "../../../../shared/bots/chat.ts";

/** sending: the request is out; queued: held until the turn ends; delivering: sent, Claude has not
 *  taken it in yet; undelivered: the process ended before it could tell whether it went. */
export type QueueEntryState = "sending" | "queued" | "delivering" | "undelivered";

export interface QueueEntry { id: string; text: string; state: QueueEntryState }

/** Decision: a message whose fate is unknown is listed for an hour, then it is old news. */
export const UNDELIVERED_SHOWN_MS = 60 * 60 * 1000;

export interface QueueInputs {
  queued: readonly QueuedMessage[];
  submissions: readonly Submission[];
  /** sends whose request has not answered yet, by client message id */
  sending: ReadonlyMap<string, string>;
  rows: ReadonlyMap<string, JournalRow>;
  now: number;
}

/** The host sends a message with its client id as uuid, and its row is `user:<uuid>` (translate.ts). */
const inChat = (rows: ReadonlyMap<string, JournalRow>, id: string): boolean => rows.has(`user:${id}`);

/** The owner's messages not in the transcript yet, oldest first: held ones, then sent ones, then the requests in flight. */
export function queueEntries({ queued, submissions, sending, rows, now }: QueueInputs): QueueEntry[] {
  const held = [...queued]
    .filter((message) => message.from.kind === "owner" && !inChat(rows, message.clientMessageId))
    .sort((a, b) => a.position - b.position)
    .map((message): QueueEntry => ({ id: message.clientMessageId, text: message.text, state: "queued" }));
  const heldIds = new Set(held.map((entry) => entry.id));
  const sent = submissions.flatMap((submission): QueueEntry[] => {
    const id = submission.clientMessageId;
    if (submission.from.kind !== "owner" || heldIds.has(id) || inChat(rows, submission.uuid)) return [];
    if (submission.state === "pending") return [{ id, text: submission.text, state: "delivering" }];
    if (submission.state === "unknown" && now - (submission.resolvedAt ?? submission.submittedAt) < UNDELIVERED_SHOWN_MS) {
      return [{ id, text: submission.text, state: "undelivered" }];
    }
    return [];
  });
  const known = new Set([...heldIds, ...sent.map((entry) => entry.id)]);
  const flying = [...sending]
    .filter(([id]) => !known.has(id) && !inChat(rows, id))
    .map(([id, text]): QueueEntry => ({ id, text, state: "sending" }));
  return [...held, ...sent, ...flying];
}
