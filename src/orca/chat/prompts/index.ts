// WP2 prompts: stablyai/orca's (MIT, Copyright (c) 2026 Lovecast Inc.) approval and question cards over TermWeave's prompts (SPEC 5.3).
export { ChatPromptCard } from "./ChatPromptCard.tsx";
export { ApprovalCard, type ApprovalCardProps } from "./ApprovalCard.tsx";
export {
  choiceIndices,
  PANE_ACTION_APPROVE,
  PANE_ACTION_DENY,
  paneActionApproval,
  toChatPrompt,
  toPromptAnswer,
} from "./prompt-mapping.ts";
