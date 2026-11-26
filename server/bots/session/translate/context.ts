import type { JournalBody, JournalRow } from "../../../../shared/bots/chat.ts";
import type { BotJournal } from "../journal.ts";

/** The clock and timer the translator coalesces with; tests pass fakes so runs are deterministic. */
export interface TranslatorClock {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export const systemClock: TranslatorClock = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** What the translator's parts share: one place that writes rows and collects them for `emit`. */
export interface WriteContext {
  readonly sessionId: string;
  readonly journal: BotJournal;
  write(itemId: string, body: JournalBody, at: number, turnId?: string | null): JournalRow;
  /** sends the rows written since the last flush, if any */
  flush(): void;
  turnId(): string | null;
}

export function createWriteContext(sessionId: string, journal: BotJournal, emit: (rows: JournalRow[]) => void, turnId: () => string | null): WriteContext {
  let batch: JournalRow[] = [];
  return {
    sessionId, journal, turnId,
    write(itemId, body, at, turn) {
      const row = journal.upsert(sessionId, itemId, body, at, turn === undefined ? undefined : turn);
      // a row revised twice in one batch is sent once, as its newest revision
      batch = [...batch.filter((other) => other.itemId !== itemId), row];
      return row;
    },
    flush() {
      if (batch.length === 0) return;
      const rows = batch;
      batch = [];
      emit(rows);
    },
  };
}
