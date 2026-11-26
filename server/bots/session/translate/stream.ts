import type { JournalMessage } from "../../../../shared/bots/chat.ts";
import { bound, MESSAGE_MAX_BYTES } from "../journal.ts";
import type { TranslatorClock, WriteContext } from "./context.ts";
import { num, obj, type Obj, str } from "./frames.ts";

type Role = "assistant" | "reasoning";

interface Block {
  itemId: string;
  role: Role;
  text: string;
  /** the text last written to the journal; null before the first write */
  written: string | null;
  final: boolean;
  /** order within its message, to match an `assistant` frame's blocks to streamed ones */
  index: number;
}

/** Past this much buffered text a stream stops growing in memory; the final frame replaces it. */
const BUFFER_MAX_CHARS = MESSAGE_MAX_BYTES * 2;

function messageBody(role: Role, text: string, final: boolean, at: number): JournalMessage {
  const kept = bound(text, MESSAGE_MAX_BYTES);
  return {
    kind: "message", role, text: kept.text, state: final ? "completed" : "running",
    ...(final ? { completedAt: at } : {}), ...(kept.cut > 0 ? { truncated: true as const } : {}),
  };
}

/**
 * Assistant and reasoning text: one row per content block, revised as deltas arrive, at most
 * one revision per `intervalMs` (a reply streams hundreds of deltas; a revision each would flood
 * the disk and the socket). The `assistant` frame carries the block's final text.
 */
export class Streams {
  private messageId: string | null = null;
  private readonly blocks = new Map<string, Block>();
  private timer: unknown = null;
  private lastWriteAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly ctx: WriteContext, private readonly clock: TranslatorClock, private readonly intervalMs: number) {}

  /** One `stream_event` frame's `event`. */
  event(event: Obj, at: number): void {
    const type = str(event.type);
    if (type === "message_start") {
      this.messageId = str(obj(event.message).id) ?? this.messageId;
      return;
    }
    const index = num(event.index);
    if (index === undefined || this.messageId === null) return;
    if (type === "content_block_start") {
      const block = obj(event.content_block);
      const role: Role | null = block.type === "text" ? "assistant" : block.type === "thinking" ? "reasoning" : null;
      if (role !== null) this.open(this.messageId, index, role, str(block.text) ?? str(block.thinking) ?? "");
      return;
    }
    if (type === "content_block_delta") {
      const delta = obj(event.delta);
      const piece = delta.type === "text_delta" ? str(delta.text) : delta.type === "thinking_delta" ? str(delta.thinking) : undefined;
      if (piece === undefined) return;
      const role: Role = delta.type === "text_delta" ? "assistant" : "reasoning";
      const block = this.blocks.get(this.key(this.messageId, index)) ?? this.open(this.messageId, index, role, "");
      if (block.text.length < BUFFER_MAX_CHARS) block.text += piece;
      this.schedule(at);
      return;
    }
    if (type === "content_block_stop") this.writeDirty(at);
  }

  /** One text or thinking block of an `assistant` frame: the block's final text. */
  final(messageId: string, role: Role, text: string, at: number): void {
    const streamed = [...this.blocks.values()]
      .filter((block) => block.itemId.startsWith(`msg:${messageId}:`) && block.role === role && !block.final)
      .sort((a, b) => a.index - b.index)[0];
    const block = streamed ?? this.open(messageId, this.nextIndex(messageId), role, "");
    block.text = text;
    block.final = true;
    if (text.length === 0 && block.written === null) return;
    block.written = text;
    this.ctx.write(block.itemId, messageBody(role, text, true, at), at);
  }

  /** Writes what has streamed and not been written yet (the turn or the process ended). */
  finishAll(at: number): void {
    this.cancelTimer();
    for (const block of this.blocks.values()) {
      if (block.final) continue;
      block.final = true;
      if (block.text.length === 0 && block.written === null) continue;
      block.written = block.text;
      this.ctx.write(block.itemId, messageBody(block.role, block.text, true, at), at);
    }
    this.blocks.clear();
    this.messageId = null;
  }

  private key(messageId: string, index: number): string { return `${messageId}:${index}`; }

  private nextIndex(messageId: string): number {
    const used = [...this.blocks.values()].filter((block) => block.itemId.startsWith(`msg:${messageId}:`)).map((block) => block.index);
    return used.length === 0 ? 0 : Math.max(...used) + 1;
  }

  private open(messageId: string, index: number, role: Role, text: string): Block {
    const block: Block = { itemId: `msg:${messageId}:${index}`, role, text, written: null, final: false, index };
    this.blocks.set(this.key(messageId, index), block);
    return block;
  }

  private schedule(at: number): void {
    const since = this.clock.now() - this.lastWriteAt;
    if (since >= this.intervalMs) { this.writeDirty(at); return; }
    if (this.timer !== null) return;
    this.timer = this.clock.setTimer(() => {
      this.timer = null;
      this.writeDirty(this.clock.now());
      this.ctx.flush();
    }, this.intervalMs - since);
  }

  private writeDirty(at: number): void {
    this.cancelTimer();
    for (const block of this.blocks.values()) {
      if (block.final || block.text === block.written || block.text.length === 0) continue;
      block.written = block.text;
      this.ctx.write(block.itemId, messageBody(block.role, block.text, false, at), at);
      this.lastWriteAt = this.clock.now();
    }
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clock.clearTimer(this.timer);
    this.timer = null;
  }
}
