// TermWeave's chat contract, shaped after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
// src/shared/native-chat/native-chat-types.ts; trimmed to the fields TermWeave can fill.
import type { ComponentType } from "react";
import type { AgentStatus, ConversationMetadata, InteractivePrompt, SkillActivity } from "../../../../shared/protocol.ts";
import type { Bot, BotItem, BotWorker } from "../../../../shared/bots/types.ts";

// ---- messages ----
export type NativeChatRole = "user" | "assistant" | "tool" | "reasoning" | "system";
export type NativeChatSource = "transcript" | "scrollback";
/** compact: a compaction summary; notice: the runtime spoke in the user's seat;
 *  interrupted: the user stopped the turn; skill: a skill the user's message invoked. */
export type NativeChatTextPresentation = "compact" | "notice" | "interrupted" | "skill";

export interface NativeChatTextBlock {
  type: "text";
  text: string;
  presentation?: NativeChatTextPresentation;
  /** Codex: commentary is mid-turn talk, final_answer the answer. */
  phase?: "commentary" | "final_answer";
}

export interface NativeChatMcpIdentity { server: string; tool: string }

export interface NativeChatToolCallBlock {
  type: "tool-call";
  name: string;
  /** The parsed input object; `{}` when the server's JSON did not parse. */
  input: unknown;
  /** Synthesized by the adapter: unique in the conversation, pairs the result. */
  callId: string;
  /** The server's one-line summary (TW/server/transcript-records.ts:93). */
  summary: string;
  mcpIdentity?: NativeChatMcpIdentity;
  /** Absent today; reserved for the runtime change. */
  exitCode?: number;
  durationMs?: number;
  skill?: SkillActivity;
}

export interface NativeChatImageRefBlock {
  type: "image-ref";
  /** Ready-to-use URL (machinePath + pane/conversation/image?…). */
  url: string;
  mediaType: string;
  alt?: string;
}

export interface NativeChatToolResultBlock {
  type: "tool-result";
  callId: string;
  output: string;
  isError?: boolean;
  /** Set when `output` was cut: pass to `loadFullOutput`. */
  fullOutputRef?: string;
  /** Length of the whole output, when cut. */
  outputSize?: number;
  images?: NativeChatImageRefBlock[];
}

export type NativeChatBlock =
  | NativeChatTextBlock
  | NativeChatToolCallBlock
  | NativeChatToolResultBlock
  | NativeChatImageRefBlock;

export interface NativeChatMessage {
  /** Synthesized, see SPEC 2.3. React key and disclosure key. */
  id: string;
  role: NativeChatRole;
  blocks: NativeChatBlock[];
  /** Epoch ms; null when the transcript had none. */
  timestamp: number | null;
  source: NativeChatSource;
  /** Index of the ConversationTurn it came from, across loaded pages (older pages negative). */
  turnIndex: number;
  /** The last message of an assistant turn: holds Copy and time for the turn. */
  endsTurn: boolean;
}

// ---- feed and turn state ----
export type ChatFeedStatus = "loading" | "ready" | "empty" | "error" | "scrollback";

export interface ChatFeed {
  status: ChatFeedStatus;
  messages: NativeChatMessage[];
  /** With status "scrollback": the terminal text and whether it was cut. */
  scrollback: { text: string; truncated: boolean } | null;
  /** The last read failed; shown under the transcript, the old messages stay. */
  error: string | null;
  older: "none" | "idle" | "loading" | "failed";
  loadOlder: () => void;
  metadata: ConversationMetadata | null;
  /** Changes when the transcript is replaced or cleared: reset disclosures and scroll. */
  historyId: string | null;
  /** Integration addition: older pages were loaded back to the conversation's first turn. */
  beginning?: boolean;
  /** Integration addition: turns a `/tree` walked away from (pi), which no page reaches. */
  abandoned?: { count: number; branches: number; summary: string | null } | null;
}

export interface ChatTurnState {
  working: boolean;
  /** Epoch ms of the newest user message while working; else null. */
  startedAt: number | null;
  agentStatus: AgentStatus | undefined;
}

// ---- prompts ----
export interface ChatApprovalOption { label: string; description: string | null; index: number }

export interface ChatApproval {
  title: string;
  description?: string;
  /** Shown in a <pre> (a command, a plan). */
  detail?: string;
  options: ChatApprovalOption[];
}

export interface AskOption { label: string; description?: string; recommended?: true }
export interface AskQuestion { question: string; header?: string; multiSelect: boolean; options: AskOption[] }
export interface AskStep { label: string; answered: boolean; current: boolean }

export interface AskPrompt {
  questions: AskQuestion[];
  /** Index of the "type your own answer" option, when the menu has one. */
  otherIndex: number | null;
  steps?: AskStep[];
}

export type ChatPrompt =
  | { kind: "approval"; id: string; source: InteractivePrompt; approval: ChatApproval }
  | { kind: "question"; id: string; source: InteractivePrompt; ask: AskPrompt };

export type ChatPromptAnswer =
  | { kind: "option"; index: number }
  | { kind: "options"; indices: number[] }
  | { kind: "text"; text: string };

// ---- bots ----
export interface ChatBotContext {
  bot: Bot;
  /** The bot's items with `action` set and status needs_you. */
  approvals: BotItem[];
  workers: BotWorker[];
  readOnly: boolean;
}

/** A row from outside the transcript, drawn after the message with this id (Orca's timedRows). */
export interface ChatTimedRow { afterMessageId: string; key: string; at: number; item: BotItem; commentIndex: number }

// ---- slot props (one owner each) ----
export interface ChatMarkdownProps {           // owner WP2
  content: string;
  className?: string;
  /** faint: system rows and reasoning. */
  tone?: "normal" | "faint";
}

export interface ChatImagesProps {             // owner WP2
  images: NativeChatImageRefBlock[];
  className?: string;
}

export interface ToolRunProps {                // owner WP3
  /** tool-call and tool-result blocks of one message, in order. */
  blocks: NativeChatBlock[];
  /** The turn is working and this is its trailing run. */
  live: boolean;
  /** Prose is drawn above: the run takes `mt-2`. */
  followsProse: boolean;
  /** The message id: disclosure keys. */
  disclosureId: string;
  /** The previous TodoWrite call in the conversation, for the task diff. */
  previousTodoWrite?: NativeChatToolCallBlock;
  loadFullOutput: (ref: string) => Promise<string>;
}

export interface PromptCardProps {             // owner WP2
  prompt: ChatPrompt;
  submitting: boolean;
  error: string | null;
  shouldFocus: boolean;
  onAnswer: (answer: ChatPromptAnswer) => void;
  /** Opens the terminal lens (approval "Open terminal"). */
  onOpenTerminal?: () => void;
}

export interface ChatSlots {
  Markdown: ComponentType<ChatMarkdownProps>;
  Images: ComponentType<ChatImagesProps>;
  ToolRun: ComponentType<ToolRunProps>;
}
