// Dev-only sample prompts for review screenshots and tests (SPEC 5.0); TermWeave's own, shaped after the
// prompts its server parses (server/prompt.ts) and stablyai/orca's (MIT, Copyright (c) 2026 Lovecast Inc.) fixtures.
import type { InteractivePrompt } from "../../../../shared/protocol.ts";
import type { BotPaneAction } from "../../../../shared/bots/types.ts";
import type { ChatApproval } from "../shared/index.ts";

function prompt(fields: Partial<InteractivePrompt> & Pick<InteractivePrompt, "id" | "kind" | "options">): InteractivePrompt {
  return { agent: "claude", title: "", question: "", body: null, multi_select: false, custom_option_index: null, ...fields };
}

export const approvalPrompt = prompt({
  id: "a1",
  kind: "approval",
  title: "Bash command",
  question: "Do you want to proceed?",
  body: "rm -rf build && bun run build",
  target_terminal_id: "t9",
  options: [
    { label: "Yes", description: null },
    { label: "Yes, and don't ask again for bun commands", description: null },
    { label: "No", description: null },
  ],
});

export const planPrompt = prompt({
  id: "p1",
  kind: "plan",
  title: "Ready to code?",
  question: "Claude has written up a plan and is ready to execute. Would you like to proceed?",
  body: "## Plan\n1. Read **markdown.ts**\n2. Write the renderer",
  options: [
    { label: "Yes, and auto-accept edits", description: null },
    { label: "Yes, and manually approve edits", description: null },
    { label: "Tell Claude what to change", description: null },
  ],
  custom_option_index: 2,
});

export const singleQuestionPrompt = prompt({
  id: "q1",
  kind: "question",
  title: "Cache",
  question: "Which cache should we use?",
  options: [
    { label: "Redis (Recommended)", description: "Shared across workers" },
    { label: "In memory", description: null },
    { label: "Type something.", description: null },
  ],
  custom_option_index: 2,
});

export const multiSelectPrompt = prompt({
  id: "m1",
  kind: "question",
  title: "Checks",
  question: "Which checks should run?",
  multi_select: true,
  options: [
    { label: "Types", description: null },
    { label: "Unit tests", description: null },
    { label: "Lint", description: "Fast" },
  ],
});

export const steppedPrompt = prompt({
  id: "s1",
  kind: "menu",
  agent: "omp",
  title: "Setup",
  question: "Pick a database",
  options: [{ label: "Postgres", description: null }, { label: "SQLite", description: null }, { label: "Other", description: null }],
  custom_option_index: 2,
  steps: [
    { label: "Language", answered: true, current: false },
    { label: "Database", answered: false, current: true },
    { label: "Hosting", answered: false, current: false },
  ],
});

export const typedOnlyPrompt = prompt({
  id: "t1",
  kind: "question",
  title: "Name",
  question: "What should the branch be called?",
  options: [{ label: "Type your answer", description: null }],
  custom_option_index: 0,
});

export const sendAction: BotPaneAction = { kind: "send", paneId: "p2", where: "the api pane", text: "bun test --watch" };
export const keysAction: BotPaneAction = { kind: "keys", paneId: "p2", where: "the api pane", keys: ["C-c"] };

/** A Claude tool permission, as the session runtime will send it later: three answers as data. */
export const toolPermissionApproval: ChatApproval = {
  title: "Allow Bash?",
  description: "Claude wants to run a command.",
  detail: "git status --short",
  options: [
    { label: "Allow", description: null, index: 0 },
    { label: "Allow for this session", description: null, index: 1 },
    { label: "Deny", description: null, index: 2 },
  ],
};
