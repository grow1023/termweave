// TermWeave's own adapter (no Orca file to copy): ConversationTurn[] → the chat contract shaped after
// stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/shared/native-chat/native-chat-types.ts.
// Pure: no React, no fetch. Rules in SPEC-native-chat 2.3 and 5.2.
import { machinePath } from "../../../../shared/machines.ts";
import type { ConversationPart, ConversationTurn } from "../../../../shared/protocol.ts";
import type {
  NativeChatBlock,
  NativeChatImageRefBlock,
  NativeChatMcpIdentity,
  NativeChatMessage,
  NativeChatRole,
  NativeChatTextPresentation,
} from "../shared/index.ts";

export interface TurnsToMessagesContext {
  paneId: string;
  machineId: string;
  /** turnIndex of `turns[0]`: older pages count down from 0, so the newest page starts at 0. */
  firstTurnIndex: number;
}

type ToolPart = Extract<ConversationPart, { kind: "tool" }>;

/** Claude writes this as user text when the reader stopped a turn (SPEC 2.3, [I]). */
const INTERRUPTED_PREFIX = "[Request interrupted by user";

/** A message being built; `blocks` is replaced, never pushed to. */
interface Draft {
  role: NativeChatRole;
  firstPart: number;
  blocks: NativeChatBlock[];
}

export function imageUrl(ctx: TurnsToMessagesContext, ref: string): string {
  return machinePath(ctx.machineId, `pane/conversation/image?${new URLSearchParams({ pane_id: ctx.paneId, ref }).toString()}`);
}

function imageBlock(ctx: TurnsToMessagesContext, mediaType: string, ref: string): NativeChatImageRefBlock {
  return { type: "image-ref", url: imageUrl(ctx, ref), mediaType };
}

/** `mcp__server__tool` → `{ server, tool }`; other names have none. */
export function mcpIdentity(name: string): NativeChatMcpIdentity | undefined {
  const match = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name);
  return match ? { server: match[1]!, tool: match[2]! } : undefined;
}

/** The server sends `JSON.stringify(input, null, 2)`; a string that does not parse becomes `{}`. */
export function parseToolInput(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function toolBlocks(ctx: TurnsToMessagesContext, part: ToolPart, callId: string): NativeChatBlock[] {
  const identity = mcpIdentity(part.name);
  const images = (part.images ?? []).map((image) => imageBlock(ctx, image.media_type, image.ref));
  return [
    {
      type: "tool-call",
      name: part.name,
      input: parseToolInput(part.input),
      callId,
      summary: part.summary,
      ...(identity ? { mcpIdentity: identity } : {}),
      ...(part.skill ? { skill: part.skill } : {}),
    },
    {
      type: "tool-result",
      callId,
      output: part.output,
      ...(part.error ? { isError: true } : {}),
      ...(part.output_ref !== undefined ? { fullOutputRef: part.output_ref } : {}),
      ...(part.output_size !== undefined ? { outputSize: part.output_size } : {}),
      ...(images.length > 0 ? { images } : {}),
    },
  ];
}

/** A skill the agent used: a tool line with verb "Skill" and the skill's name as target (SPEC 2.3). */
function skillBlocks(part: Extract<ConversationPart, { kind: "skill" }>, callId: string): NativeChatBlock[] {
  return [
    { type: "tool-call", name: "Skill", input: { skill: part.skill.name }, callId, summary: part.skill.name, skill: part.skill },
    { type: "tool-result", callId, output: "", ...(part.skill.status === "failed" ? { isError: true } : {}) },
  ];
}

function systemDraft(firstPart: number, text: string, presentation: NativeChatTextPresentation): Draft {
  return { role: "system", firstPart, blocks: [{ type: "text", text, presentation }] };
}

/** A user turn: its words and images in one bubble; interruptions, compactions, notices and skills apart. */
function userDrafts(ctx: TurnsToMessagesContext, parts: ConversationPart[]): Draft[] {
  return parts.reduce<Draft[]>((drafts, part, index) => {
    const last = drafts.at(-1);
    const append = (block: NativeChatBlock): Draft[] =>
      last?.role === "user"
        ? [...drafts.slice(0, -1), { ...last, blocks: [...last.blocks, block] }]
        : [...drafts, { role: "user", firstPart: index, blocks: [block] }];
    switch (part.kind) {
      case "text":
        if (part.text.trim() === "") return drafts;
        if (part.text.startsWith(INTERRUPTED_PREFIX)) return [...drafts, systemDraft(index, part.text, "interrupted")];
        return append({ type: "text", text: part.text });
      case "image":
        return append(imageBlock(ctx, part.media_type, part.ref));
      case "compact":
        return [...drafts, systemDraft(index, part.text, "compact")];
      case "notice":
        return [...drafts, systemDraft(index, part.text, "notice")];
      case "skill":
        return [...drafts, systemDraft(index, part.skill.name, "skill")];
      default:
        return drafts;
    }
  }, []);
}

/** The last draft, when it is an assistant message that may still take this kind of block. */
function openAssistant(drafts: Draft[], kind: "text" | "tool" | "image"): Draft | null {
  const last = drafts.at(-1);
  if (last?.role !== "assistant") return null;
  // words after a tool start a new message: a row draws its prose above its tool run
  if (kind === "text" && last.blocks.some((block) => block.type === "tool-call")) return null;
  return last;
}

function appendAssistant(drafts: Draft[], kind: "text" | "tool" | "image", index: number, blocks: NativeChatBlock[]): Draft[] {
  const open = openAssistant(drafts, kind);
  return open
    ? [...drafts.slice(0, -1), { ...open, blocks: [...open.blocks, ...blocks] }]
    : [...drafts, { role: "assistant", firstPart: index, blocks }];
}

/** An assistant turn, in order: runs of words, each reasoning block apart, tools on the message before them. */
function assistantDrafts(ctx: TurnsToMessagesContext, parts: ConversationPart[]): Draft[] {
  return parts.reduce<Draft[]>((drafts, part, index) => {
    // the part index for now; turnMessages puts the message id in front
    const callId = `t${index}`;
    switch (part.kind) {
      case "text":
        if (part.text.trim() === "") return drafts;
        return appendAssistant(drafts, "text", index, [{ type: "text", text: part.text, ...(part.phase ? { phase: part.phase } : {}) }]);
      case "thinking":
        return part.text.trim() === "" ? drafts : [...drafts, { role: "reasoning", firstPart: index, blocks: [{ type: "text", text: part.text }] }];
      case "tool":
        return appendAssistant(drafts, "tool", index, toolBlocks(ctx, part, callId));
      case "skill":
        return appendAssistant(drafts, "tool", index, skillBlocks(part, callId));
      case "image":
        return appendAssistant(drafts, "image", index, [imageBlock(ctx, part.media_type, part.ref)]);
      case "compact":
        return [...drafts, systemDraft(index, part.text, "compact")];
      case "notice":
        return [...drafts, systemDraft(index, part.text, "notice")];
      default:
        return drafts;
    }
  }, []);
}

/** The blocks with each tool call id rewritten; the call and its result keep the same id. */
function withCallIds(blocks: NativeChatBlock[], rename: (callId: string) => string): NativeChatBlock[] {
  return blocks.map((block) => (block.type === "tool-call" || block.type === "tool-result" ? { ...block, callId: rename(block.callId) } : block));
}

function epoch(ts: string | null | undefined): number | null {
  if (ts === null || ts === undefined) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * One turn's messages. Ids are `${ts}:${role}:${n}` (n = index of the message's first part), so
 * they hold while the turn grows at its end. A turn without `ts` uses `x<turnIndex>`.
 */
function turnMessages(ctx: TurnsToMessagesContext, turn: ConversationTurn, turnIndex: number): NativeChatMessage[] {
  const stamp = turn.ts ?? `x${turnIndex}`;
  const drafts = turn.role === "user" ? userDrafts(ctx, turn.parts) : assistantDrafts(ctx, turn.parts);
  const lastAssistant = drafts.map((draft) => draft.role).lastIndexOf("assistant");
  const start = epoch(turn.ts);
  const end = epoch(turn.end_ts) ?? start;
  return drafts.map((draft, index) => {
    const id = `${stamp}:${draft.role}:${draft.firstPart}`;
    const endsTurn = turn.role === "assistant" && index === lastAssistant;
    return {
      id,
      role: draft.role,
      blocks: withCallIds(draft.blocks, (callId) => `${id}:${callId}`),
      timestamp: endsTurn ? end : start,
      source: "transcript",
      turnIndex,
      endsTurn,
    };
  });
}

/** Two turns with the same `ts` and role would share ids: later ones get `#k`, on their call ids too. */
function uniqueIds(messages: NativeChatMessage[]): NativeChatMessage[] {
  const seen = new Map<string, number>();
  return messages.map((message) => {
    const count = seen.get(message.id) ?? 0;
    seen.set(message.id, count + 1);
    if (count === 0) return message;
    const id = `${message.id}#${count}`;
    return { ...message, id, blocks: withCallIds(message.blocks, (callId) => `${id}${callId.slice(message.id.length)}`) };
  });
}

/** Every loaded turn as chat messages, in order. Empty turns give none. */
export function turnsToMessages(turns: ConversationTurn[], ctx: TurnsToMessagesContext): NativeChatMessage[] {
  return uniqueIds(turns.flatMap((turn, index) => turnMessages(ctx, turn, ctx.firstTurnIndex + index)));
}
