// Dev-only sample data for review screenshots (SPEC 5.0). Synthetic text; no real session.
import type { ConversationTurn } from "../../../../shared/protocol.ts";
import { turnsToMessages } from "../adapter/turns-to-messages.ts";
import type { ChatFeed, ChatTurnState } from "../shared/index.ts";

const turns: ConversationTurn[] = [
  { role: "user", ts: "2026-11-26T09:00:00.000Z", parts: [{ kind: "text", text: "README의 설치 절차를 정리해 주세요." }] },
  {
    role: "assistant", ts: "2026-11-26T09:00:02.000Z", end_ts: "2026-11-26T09:00:41.000Z", parts: [
      { kind: "thinking", text: "Read the README first, then list the steps." },
      { kind: "text", text: "README를 먼저 읽겠습니다." },
      { kind: "tool", name: "Read", summary: "README.md", input: "{\n  \"file_path\": \"README.md\"\n}", output: "# Demo\n\nInstall with bun." },
      { kind: "tool", name: "Bash", summary: "bun install", input: "{\n  \"command\": \"bun install\"\n}", output: "error: lockfile", error: true },
      { kind: "text", text: "설치 절차는 **두 단계**입니다.\n\n1. `bun install`\n2. `bun run dev`" },
    ],
  },
  { role: "user", ts: "2026-11-26T09:02:00.000Z", parts: [{ kind: "compact", text: "Summary of the earlier work." }] },
  { role: "user", ts: "2026-11-26T09:03:00.000Z", parts: [{ kind: "text", text: "[Request interrupted by user]" }] },
  { role: "user", ts: "2026-11-26T09:04:00.000Z", parts: [{ kind: "text", text: "테스트도 돌려 주세요." }] },
  { role: "assistant", ts: "2026-11-26T09:04:01.000Z", parts: [{ kind: "thinking", text: "Run the unit lane." }] },
];

const context = { paneId: "fixture:1", machineId: "local", firstTurnIndex: 0 };

export const fixtureFeed: ChatFeed = {
  status: "ready",
  messages: turnsToMessages(turns, context),
  scrollback: null,
  error: null,
  older: "idle",
  loadOlder: () => undefined,
  metadata: null,
  historyId: "fixture",
};

export const fixtureWorkingTurn: ChatTurnState = { working: true, startedAt: Date.parse("2026-11-26T09:04:00.000Z"), agentStatus: "working" };
export const fixtureIdleTurn: ChatTurnState = { working: false, startedAt: null, agentStatus: "idle" };
export const fixtureEmptyFeed: ChatFeed = { ...fixtureFeed, status: "empty", messages: [] };
export const fixtureScrollbackFeed: ChatFeed = { ...fixtureFeed, status: "scrollback", messages: [], scrollback: { text: "$ claude\n> hello", truncated: true } };
