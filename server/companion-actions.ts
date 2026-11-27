/**
 * What the project companion may do besides reading (SPEC F14 to F17): send text to a terminal of its
 * project, open a terminal in its project, add a line to a terminal's note. Each is a tool of an
 * in-process MCP server the companion's session gets. A tool call is only a proposal: the session host
 * asks the gate below before every call, the gate turns it into an approval card with no lasting
 * option, and the tool's handler runs nothing that the owner did not approve on that card.
 * The companion still has no tool that writes a file or runs a command of its own.
 */
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

import { secretPrompt } from "../shared/secret-prompt.ts";
import type { PromptGate } from "./bots/session/host-types.ts";
import { loadClaudeAgentSdk } from "./bots/session/sdk.ts";

export const ACTION_SERVER = "termweave";
const PREFIX = `mcp__${ACTION_SERVER}__`;
export const ACTION_TOOLS = ["send_to_terminal", "open_terminal", "add_note_line"] as const;
export type ActionTool = (typeof ACTION_TOOLS)[number];

const TEXT_MAX = 4_000;
const LABEL_MAX = 60;
const NOTE_MAX = 1_000;

export interface ActionPane { pane_id: string; label?: string | null; number?: number | null; agent?: string | null }
export interface ActionDeps {
  /** the open terminals of this companion's project */
  panes(): Promise<readonly ActionPane[]>;
  /** the last lines the terminal shows, unmasked: read only to see a password prompt */
  readScreen(paneId: string, lines: number): Promise<string>;
  /** types the text into the terminal and presses Enter */
  sendText(paneId: string, text: string): Promise<void>;
  /** opens a terminal in the project folder; answers its name */
  openTerminal(label: string | null): Promise<string>;
  /** adds one line, marked as the companion's, to the terminal's note */
  appendNote(paneId: string, text: string): Promise<void>;
}

export type Action =
  | { tool: "send_to_terminal"; pane_id: string; text: string }
  | { tool: "open_terminal"; label: string | null }
  | { tool: "add_note_line"; pane_id: string; text: string };

/** Anything but printable text, a tab or a line break: an escape sequence would type what the card cannot show. */
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() !== "" && value.length <= max && !HIDDEN.test(value) ? value : null;

/** The action a tool call asks for, or why it is not one. Pure. */
export function parseAction(toolName: string, input: Record<string, unknown>): Action | string {
  const tool = toolName.startsWith(PREFIX) ? toolName.slice(PREFIX.length) : toolName;
  const paneId = typeof input.pane_id === "string" && input.pane_id.length > 0 && input.pane_id.length <= 200 ? input.pane_id : null;
  if (tool === "send_to_terminal") {
    const body = text(input.text, TEXT_MAX);
    if (paneId === null) return "pane_id is required: use an id from the context block";
    return body === null ? `text is required, at most ${TEXT_MAX} characters, with no control characters` : { tool, pane_id: paneId, text: body };
  }
  if (tool === "open_terminal") {
    if (input.label === undefined || input.label === null || input.label === "") return { tool, label: null };
    const label = text(input.label, LABEL_MAX);
    return label === null || label.includes("\n") ? `label is one line of at most ${LABEL_MAX} characters` : { tool, label: label.trim() };
  }
  if (tool === "add_note_line") {
    const line = text(input.text, NOTE_MAX);
    if (paneId === null) return "pane_id is required: use an id from the context block";
    return line === null || line.includes("\n") ? `text is one line of at most ${NOTE_MAX} characters` : { tool, pane_id: paneId, text: line.trim() };
  }
  return "no such action";
}

const paneName = (pane: ActionPane): string => `${pane.number ? `P${pane.number} ` : ""}${pane.label ?? pane.pane_id}`;
/** One key per action whatever the order of its fields. */
const keyOf = (action: Action): string => JSON.stringify(Object.entries(action).sort(([a], [b]) => (a < b ? -1 : 1)));

/** The approvals and the running of one companion's actions. */
export class CompanionActions {
  /** approved and not yet run: an action runs once per approval */
  private approved: readonly string[] = [];

  constructor(private readonly deps: ActionDeps, private readonly project: string) {}

  /** The say over one permission request of the companion's session. */
  async gate(toolName: string, input: Record<string, unknown>): Promise<PromptGate> {
    if (!toolName.startsWith("mcp__")) return { card: { once: true } };
    // an MCP tool that is not the companion's own never runs, whatever server it came from
    if (!toolName.startsWith(PREFIX)) return { deny: "The companion cannot use this tool." };
    const action = parseAction(toolName, input);
    if (typeof action === "string") return { deny: `This action was not shown to the owner: ${action}.` };
    const allowed = (): void => { this.approved = [...this.approved, keyOf(action)]; };
    if (action.tool === "open_terminal") {
      return { card: { once: true, detail: action.label ?? "", action: { kind: "open", target: this.project } }, allowed };
    }
    const pane = (await this.deps.panes()).find((each) => each.pane_id === action.pane_id);
    if (!pane) return { deny: "That terminal is not open in this project. Use a pane id from the latest context block." };
    if (action.tool === "add_note_line") return { card: { once: true, detail: action.text, action: { kind: "note", target: paneName(pane) } }, allowed };
    // the card shows the text only: what an agent there does with it is that agent's, and the card says so
    return { card: { once: true, detail: action.text, action: { kind: "send", target: paneName(pane), ...(pane.agent ? { agent: pane.agent } : {}) } }, allowed };
  }

  /** Runs an approved action once; the text it answers goes back to the model. */
  async run(toolName: string, input: Record<string, unknown>): Promise<string> {
    const action = parseAction(toolName, input);
    if (typeof action === "string") return `Not done: ${action}.`;
    const key = keyOf(action);
    const at = this.approved.indexOf(key);
    if (at < 0) return "Not done: the owner did not approve this on its card.";
    this.approved = this.approved.filter((_each, index) => index !== at);
    if (action.tool === "open_terminal") return `Done: opened the terminal "${await this.deps.openTerminal(action.label)}".`;
    // the terminal can have closed, or started asking for a password, while the card waited
    const pane = (await this.deps.panes()).find((each) => each.pane_id === action.pane_id);
    if (!pane) return "Not done: that terminal closed before the owner approved.";
    if (action.tool === "add_note_line") {
      await this.deps.appendNote(pane.pane_id, action.text);
      return `Done: added the line to the note of ${paneName(pane)}.`;
    }
    if (secretPrompt(await this.deps.readScreen(pane.pane_id, 30)) !== null) return "Not done: that terminal is asking for a password now.";
    await this.deps.sendText(pane.pane_id, action.text);
    return `Done: sent to ${paneName(pane)}. Its answer is not in this result; the next context block shows the terminal.`;
  }

  /** The MCP server of these actions, for one launch of the companion's session. */
  async server(): Promise<McpSdkServerConfigWithInstance> {
    const [{ createSdkMcpServer, tool }, { z }] = await Promise.all([loadClaudeAgentSdk(), import("zod")]);
    const answer = (name: ActionTool) => async (args: Record<string, unknown>) => {
      let said: string;
      try { said = await this.run(name, args); } catch (error) {
        said = `Not done: TermWeave could not do it (${error instanceof Error ? error.name : "error"}).`;
      }
      return { content: [{ type: "text" as const, text: said }], isError: said.startsWith("Not done") };
    };
    const paneId = z.string().describe("the pane id of a terminal of this project, as the context block gives it");
    const server = createSdkMcpServer({
      name: ACTION_SERVER,
      alwaysLoad: true,
      tools: [
        tool("send_to_terminal", "Propose to type text into a terminal of this project and press Enter, for example an instruction for the agent that works there. The owner sees the exact text on a card and it is sent only if they press Allow.",
          { pane_id: paneId, text: z.string().describe("the exact text to send") }, answer("send_to_terminal")),
        tool("open_terminal", "Propose to open a new terminal in the project folder. It opens only if the owner presses Allow on the card.",
          { label: z.string().optional().describe("a short name for the terminal") }, answer("open_terminal")),
        tool("add_note_line", "Propose to add one line to a terminal's note, under its agent log, marked as yours. It is added only if the owner presses Allow on the card.",
          { pane_id: paneId, text: z.string().describe("the line to add") }, answer("add_note_line")),
      ],
    });
    // asked before every call, whatever rule or mode would allow it
    return { ...server, tools: ACTION_TOOLS.map((name) => ({ name, permission_policy: "always_ask" as const })) };
  }
}
