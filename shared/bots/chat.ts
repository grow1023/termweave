/**
 * A bot's structured chat: the journal rows the server writes from Claude Agent SDK frames and the
 * client reads. The shapes follow Orca's agent-session journal (stablyai/orca, MIT), reduced: no
 * fences, leases, aliases or subagent rosters. Every string in a row is data the model or a tool
 * produced; the client shows it as text, never as markup.
 */

/** A string cut to fit the journal: the first and last parts, and how much of the middle is gone. */
export interface BoundedText {
  /** the kept text; when `cut` > 0 it holds a marker line where the middle was */
  text: string;
  /** the original's size in UTF-8 bytes */
  bytes: number;
  /** how many bytes of the original were left out (0: whole) */
  cut: number;
}

/**
 * Who put a user-seat message into the chat. `termweave` is system mail: a worker's report, a
 * schedule firing, an item answer. The screen draws it apart from the owner's own words.
 */
export type MessageFrom =
  | { kind: "owner" }
  | { kind: "termweave"; label: string | null };

export type ChatRole = "user" | "assistant" | "reasoning";

export interface JournalMessage {
  kind: "message";
  role: ChatRole;
  text: string;
  /** user rows: who sent it */
  from?: MessageFrom;
  /** images sent with a user message; the bytes stay in Claude's transcript */
  images?: { mediaType: string }[];
  /** assistant and reasoning rows: `running` while the text still streams */
  state?: "running" | "completed";
  completedAt?: number;
  /** the stored text was cut to the journal's limit */
  truncated?: true;
}

export interface JournalToolCall {
  kind: "tool-call";
  name: string;
  callId: string;
  /** the one-line summary a collapsed chip shows */
  summary: string;
  /** the call's input as pretty JSON */
  input: BoundedText;
  state: "running" | "completed" | "failed";
  /** why a call that never answered stopped: the turn was stopped, or the process died */
  endedAs?: "interrupted" | "unverifiable";
  output?: BoundedText;
  isError?: boolean;
  /** set for a call a subagent made: the Task call it ran under */
  parentCallId?: string;
}

export interface PromptOption {
  id: string;
  label: string;
  description?: string;
  intent?: "allow_once" | "allow_always" | "reject_once";
}

export interface QuestionAnswer { questionId: string; optionIds: string[]; other?: string }

/** The owner's answer to an approval or question row. `dismiss` declines without choosing. */
export type PromptAnswer =
  | { kind: "option"; optionId: string }
  | { kind: "answers"; answers: QuestionAnswer[] }
  | { kind: "dismiss" };

export interface PromptResolution {
  state: "pending" | "resolved" | "cancelled";
  answer: PromptAnswer | null;
  resolvedBy: string | null;
  resolvedAt: number | null;
}

export interface JournalApproval {
  kind: "approval";
  promptKey: string;
  title: string;
  toolName: string;
  displayName?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  /** the tool call this asks about */
  callId?: string;
  /** ExitPlanMode: the plan to review */
  plan?: string;
  /** the formatted tool input */
  detail: string | null;
  options: PromptOption[];
  resolution: PromptResolution;
}

export interface PromptQuestion {
  /** q1, q2, ... */
  id: string;
  question: string;
  header?: string;
  multiSelect: boolean;
  options: PromptOption[];
}

export interface JournalQuestion {
  kind: "question";
  promptKey: string;
  callId?: string;
  /** the first question's text, for a one-line view */
  question: string;
  questions: PromptQuestion[];
  resolution: PromptResolution;
}

export interface JournalStatus {
  kind: "status";
  text: string;
  tone: "info" | "warning" | "error";
  /** a machine word for the cause: usage_limit, rate_limit, api_error, api_retry, crashed, ... */
  code?: string;
  /** the provider's own words, when they add something to the plain text */
  detail?: BoundedText;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface JournalTurn {
  kind: "turn";
  turnId: string;
  /** `failed`: the turn ended with an error; `unverifiable`: the process died, the outcome is unknown */
  state: "running" | "completed" | "interrupted" | "failed" | "unverifiable";
  /** the result subtype Claude gave (success, error_during_execution, ...) */
  outcome?: string;
  userItemId?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  usage?: TurnUsage;
  costUsd?: number;
  model?: string;
}

export type JournalBody = JournalMessage | JournalToolCall | JournalApproval | JournalQuestion | JournalStatus | JournalTurn;

/** One row as stored: the current revision of an item. */
export interface JournalRow {
  itemId: string;
  revision: number;
  /** bumped on every revision: what `after` catches up from */
  sequence: number;
  /** the sequence the row was first written at, never changed: the order the chat draws rows in */
  ordinal: number;
  observedAt: number;
  turnId: string | null;
  body: JournalBody;
}

export type SubmissionState = "pending" | "accepted" | "rejected" | "unknown";

/** One message sent into the chat, and whether Claude took it in. */
export interface Submission {
  clientMessageId: string;
  /** the uuid the message was sent with; Claude's replay of it carries the same uuid */
  uuid: string;
  state: SubmissionState;
  from: MessageFrom;
  text: string;
  submittedAt: number;
  resolvedAt: number | null;
}

/** A message held while a turn runs, sent when it ends. */
export interface QueuedMessage {
  clientMessageId: string;
  text: string;
  from: MessageFrom;
  position: number;
}

export type JournalDirection = "tail" | "before" | "after";

/**
 * A page of rows. `tail` and `before` page through history in drawing order: their cursor is an
 * `ordinal`. `after` catches up on changes: its cursor is a `sequence`, and it returns every row
 * revised since, including old ones. `head` is the newest sequence, where a live client resumes.
 */
export interface JournalPage {
  epoch: string;
  direction: JournalDirection;
  items: JournalRow[];
  submissions: Submission[];
  hasOlder: boolean;
  hasNewer: boolean;
  /** the cursor for the next page in the same direction; null when there is none */
  nextCursor: number | null;
  head: number;
}

export type BotChatStatus = "working" | "waiting" | "blocked" | "done" | "offline";

/** A session bot's permission setting. Full access is left out on purpose for the first version (spec 9.3). */
export type BotPermissionMode = "ask" | "accept-edits" | "auto" | "own";
export const BOT_PERMISSION_MODES: readonly BotPermissionMode[] = ["ask", "accept-edits", "auto", "own"];

/** What the SDK's permission callback asks, as the journal records it. */
export interface PromptRequest {
  /** the SDK's requestId; unique per prompt */
  promptKey: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId?: string;
  title?: string;
  displayName?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
}
