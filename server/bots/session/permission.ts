/**
 * Permission requests of a structured Claude session, and the answers TermWeave gives back.
 * The mode table and the "allow for this session" rule follow Orca (src/main/claude/structured/
 * launch/claude-structured-permission-options.ts and journal/claude-structured-prompt-replies.ts, MIT).
 * Type imports only: the SDK itself loads lazily (sdk.ts).
 */
import type { CanUseTool, Options, PermissionMode, PermissionResult as SdkPermissionResult, PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";

import type { BotPermissionMode } from "../../../shared/bots/chat.ts";

// the setting lives in shared/ so the bot record can carry it without a server import
export type { BotPermissionMode } from "../../../shared/bots/chat.ts";

/** The SDK modes a running session can switch to. */
export type SessionPermissionMode = Extract<PermissionMode, "default" | "acceptEdits" | "auto">;

export type PermissionResult = SdkPermissionResult;

/** What the SDK asks before a tool runs, in the shape the session host keeps. */
export interface PermissionRequest {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  /** the control request id: the prompt's key */
  readonly requestId: string;
  readonly toolUseID: string;
  readonly agentID: string | undefined;
  readonly suggestions: readonly PermissionUpdate[];
  readonly title: string | undefined;
  readonly displayName: string | undefined;
  readonly description: string | undefined;
  readonly decisionReason: string | undefined;
  readonly blockedPath: string | undefined;
  /** aborted when the CLI withdraws the request (interrupt, end of session) */
  readonly signal: AbortSignal;
}

export const NO_ANSWER_MESSAGE = "TermWeave denied this tool because nobody answered the permission request. Do not retry it; tell the owner what you wanted to do.";
export const DENIED_MESSAGE = "User denied this action.";

const SDK_MODE: Record<BotPermissionMode, SessionPermissionMode | null> = {
  ask: "default",
  "accept-edits": "acceptEdits",
  auto: "auto",
  // the CLI applies the user's own `defaultMode` from settings
  own: null,
};

export function sdkPermissionMode(mode: BotPermissionMode): SessionPermissionMode | null {
  return SDK_MODE[mode];
}

/** `ask` names `default` outright, so a `defaultMode` in the user's settings cannot widen a bot. */
export function permissionModeOptions(mode: BotPermissionMode): Pick<Options, "permissionMode"> {
  const sdk = SDK_MODE[mode];
  return sdk === null ? {} : { permissionMode: sdk };
}

type CanUseToolOptions = Parameters<CanUseTool>[2];

export function toPermissionRequest(toolName: string, input: Record<string, unknown>, options: CanUseToolOptions): PermissionRequest {
  return {
    toolName,
    input,
    requestId: options.requestId,
    toolUseID: options.toolUseID,
    agentID: options.agentID,
    suggestions: options.suggestions ?? [],
    title: options.title,
    displayName: options.displayName,
    description: options.description,
    decisionReason: options.decisionReason,
    blockedPath: options.blockedPath,
    signal: options.signal,
  };
}

export function allowOnce(request: PermissionRequest): PermissionResult {
  return { behavior: "allow", updatedInput: request.input, toolUseID: request.toolUseID };
}

/** Claude suggests rules saved to settings files; "allow for this session" must not persist them. */
export function allowForSession(request: PermissionRequest): PermissionResult {
  return {
    behavior: "allow",
    updatedInput: request.input,
    toolUseID: request.toolUseID,
    updatedPermissions: request.suggestions.map((suggestion) => ({ ...suggestion, destination: "session" as const })),
  };
}

export function denyResult(request: PermissionRequest, message: string = DENIED_MESSAGE): PermissionResult {
  return { behavior: "deny", message, toolUseID: request.toolUseID };
}
