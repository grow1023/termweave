// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/tools/native-chat-tool-pairs.ts and native-chat-tool-pairing.ts; adapted for TermWeave.
// Change: types come from the chat contract; unpairedToolResultIndices is cut (unused).

import type {
  NativeChatBlock,
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../shared/index.ts'

export type NativeChatToolPair = {
  call?: NativeChatToolCallBlock
  result?: NativeChatToolResultBlock
}

type PendingCall = {
  slot: number
  callId: string | undefined
  previous?: PendingCall
  next?: PendingCall
  nextWithId?: PendingCall
}

type CallIdQueue = { first: PendingCall; last: PendingCall }

class PendingToolCalls {
  private first: PendingCall | undefined
  private last: PendingCall | undefined
  private byId: Map<string, CallIdQueue> | undefined

  get empty(): boolean {
    return this.first === undefined
  }

  add(slot: number, callId: string | undefined): void {
    const call: PendingCall = { slot, callId, previous: this.last }
    if (this.last) {
      this.last.next = call
    } else {
      this.first = call
    }
    this.last = call
    if (this.byId) {
      this.indexCall(call, this.byId)
    }
  }

  private indexCall(call: PendingCall, byId: Map<string, CallIdQueue>): void {
    if (call.callId === undefined) {
      return
    }
    const queue = byId.get(call.callId)
    if (queue) {
      queue.last.nextWithId = call
      queue.last = call
    } else {
      byId.set(call.callId, { first: call, last: call })
    }
  }

  take(callId: string | undefined): number | undefined {
    let call = this.first
    if (call && callId !== undefined && call.callId !== callId) {
      if (!this.byId) {
        const byId = new Map<string, CallIdQueue>()
        // Ordered results need only the FIFO; build the index when a named result misses its head.
        for (let pending: PendingCall | undefined = call; pending; pending = pending.next) {
          this.indexCall(pending, byId)
        }
        this.byId = byId
      }
      call = this.byId.get(callId)?.first
    }
    if (!call) {
      return undefined
    }
    if (call.previous) {
      call.previous.next = call.next
    } else {
      this.first = call.next
    }
    if (call.next) {
      call.next.previous = call.previous
    } else {
      this.last = call.previous
    }
    // The global oldest call is also the oldest of its ID, so both answers pop an ID head.
    if (this.byId && call.callId !== undefined) {
      const queue = this.byId.get(call.callId)
      if (queue && call.nextWithId) {
        queue.first = call.nextWithId
      } else {
        this.byId.delete(call.callId)
      }
    }
    if (!this.first) {
      this.byId = undefined
    }
    return call.slot
  }
}

/** Named results answer the oldest call with that ID; unnamed results answer the oldest call. */
export function pairToolBlocks(
  blocks: readonly NativeChatBlock[],
  limit = Infinity
): NativeChatToolPair[] {
  const pairs: NativeChatToolPair[] = []
  pairToolBlocksInto(blocks, limit, pairs)
  return pairs
}

function pairToolBlocksInto(
  blocks: readonly NativeChatBlock[],
  limit: number,
  pairs: NativeChatToolPair[]
): void {
  let pairCount = 0
  const pending = new PendingToolCalls()
  for (let index = 0; index < blocks.length; index += 1) {
    if (pairCount >= limit && pending.empty) {
      break
    }
    const block = blocks[index]
    if (block?.type === 'tool-call') {
      if (pairCount < limit) {
        pending.add(pairCount, block.callId)
        pairs.push({ call: block })
        pairCount += 1
      }
      continue
    }
    if (block?.type !== 'tool-result') {
      continue
    }
    const slot = pending.take(block.callId)
    if (slot === undefined) {
      if (pairCount < limit) {
        pairs.push({ result: block })
        pairCount += 1
      }
    } else {
      pairs[slot]!.result = block
    }
  }
}

export type NativeChatToolPairing = {
  /** The result each call owns. A call still running has none. */
  resultByCall: ReadonlyMap<NativeChatToolCallBlock, NativeChatToolResultBlock>
  /** Results a call now owns, so the run does not also draw them as rows. */
  pairedResults: ReadonlySet<NativeChatBlock>
}

/** The desktop run's view of `pairToolBlocks`, so every reader of a run pairs with one loop. */
export function pairNativeChatToolResults(
  blocks: readonly NativeChatBlock[]
): NativeChatToolPairing {
  const resultByCall = new Map<NativeChatToolCallBlock, NativeChatToolResultBlock>()
  const pairedResults = new Set<NativeChatBlock>()
  for (const { call, result } of pairToolBlocks(blocks)) {
    if (call && result) {
      resultByCall.set(call, result)
      pairedResults.add(result)
    }
  }
  return { resultByCall, pairedResults }
}
