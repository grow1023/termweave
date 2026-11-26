// Dev-only sample data for WP4 review screenshots (SPEC 5.0); shapes after stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.).
import type { CommandMenuGroup } from "./CommandMenu.tsx";
import type { QueuedMessagesProps } from "./QueuedMessages.tsx";

const noop = (): void => {};

export const queueFixture: QueuedMessagesProps = {
  messages: [
    { id: "q1", text: "테스트를 다시 돌리고 실패한 것만 알려 주세요." },
    { id: "q2", text: "Then update the changelog.\nKeep the release notes short." },
    { id: "q3", text: "아주긴한국어문장이띄어쓰기없이이어질때도줄이넘치지않아야합니다아주긴한국어문장이띄어쓰기없이" },
  ],
  sendingId: null,
  error: { id: "q2", text: "Not sent. Reconnect and try again." },
  unsaved: false,
  blockedReason: null,
  heading: "Held messages (3)",
  onEdit: noop,
  onSend: noop,
  onDiscard: noop,
};

export const queueSendingFixture: QueuedMessagesProps = { ...queueFixture, sendingId: "q1", error: null, unsaved: true };

export const commandMenuFixture: CommandMenuGroup[] = [
  { key: "builtin", heading: "Built in", options: [{ key: "compact", main: "/compact", hint: "Summarize the conversation" }, { key: "clear", main: "/clear" }] },
  { key: "skill", heading: "Skills", options: [{ key: "review", main: "/review", hint: "Review the current diff" }] },
];

export const attachmentFixtures = [
  { name: "screenshot.png", previewUrl: "", state: "uploading" as const },
  { name: "build-log.txt", previewUrl: "", state: "ready" as const },
  { name: "broken.pdf", previewUrl: "", state: "error" as const },
];

export const contextFixtures = [
  { used: 42_000, window: 200_000 },
  { used: 185_000, window: 200_000 },
  { used: 10_000, window: null },
];
