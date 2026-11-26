// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/rows/NativeChatTranscriptRow.tsx
// (layout, lines 175-275) and NativeChatMessageRow.tsx (user, reasoning, notice and assistant branches); adapted for TermWeave.
import { memo, type ReactNode } from "react";

import { cn } from "../../cn.ts";
import type { NativeChatToolCallBlock } from "../shared/index.ts";
import { AssistantMessageRow } from "./AssistantMessageRow.tsx";
import { NoticeRow } from "./NoticeRow.tsx";
import { ReasoningRow } from "./ReasoningRow.tsx";
import type { RowSlot } from "./transcript-model.ts";
import { UserMessageRow } from "./UserMessageRow.tsx";
import { WorkingStatus } from "./WorkingStatus.tsx";

export interface TranscriptRowProps {
  slot: RowSlot;
  turnMarkdown: string;
  previousTodoWrite?: NativeChatToolCallBlock;
  loadFullOutput: (ref: string) => Promise<string>;
  /** Rows from outside the transcript drawn after this message (Orca's timedRows). */
  timedRows?: ReactNode[];
}

/** Dispatch by role: notice, user, reasoning, assistant (Orca's order for the rows TermWeave has). */
function MessageRow({ slot, turnMarkdown, previousTodoWrite, loadFullOutput }: TranscriptRowProps) {
  const { message } = slot;
  if (message.role === "system" && message.blocks.some((block) => block.type === "text" && block.presentation !== undefined)) {
    return <div><NoticeRow message={message} /></div>;
  }
  if (message.role === "user") return <UserMessageRow message={message} />;
  if (message.role === "reasoning") return <div><ReasoningRow message={message} /></div>;
  return (
    <AssistantMessageRow
      message={message}
      turnMarkdown={turnMarkdown}
      activeTurnIsWorking={slot.activeTurn}
      trailing={slot.trailing}
      latestResponse={slot.latestResponse}
      previousTodoWrite={previousTodoWrite}
      loadFullOutput={loadFullOutput}
    />
  );
}

// A row whose message object and slot did not change sits out a poll.
export const TranscriptRow = memo(function TranscriptRow(props: TranscriptRowProps) {
  const { slot, timedRows } = props;
  const { bar } = slot;
  return (
    // The negative margin shortens the row, which is what moves the next one up.
    <div
      className={cn("flex flex-col gap-5", slot.continuesTurn && !(slot.message.endsTurn && !slot.activeTurn) && "-mb-3")}
    >
      <MessageRow {...props} />
      {bar ? <WorkingStatus startedAt={bar.kind === "active" ? bar.startedAt : null} workedSeconds={bar.kind === "settled" ? bar.workedSeconds : null} /> : null}
      {timedRows?.map((node, index) => <div key={index}>{node}</div>)}
    </div>
  );
}, (before, after) =>
  before.slot.message === after.slot.message
  && before.slot.bar?.kind === after.slot.bar?.kind
  && (before.slot.bar?.kind !== "active" || after.slot.bar?.kind !== "active" || before.slot.bar.startedAt === after.slot.bar.startedAt)
  && (before.slot.bar?.kind !== "settled" || after.slot.bar?.kind !== "settled" || before.slot.bar.workedSeconds === after.slot.bar.workedSeconds)
  && before.slot.activeTurn === after.slot.activeTurn
  && before.slot.trailing === after.slot.trailing
  && before.slot.latestResponse === after.slot.latestResponse
  && before.slot.continuesTurn === after.slot.continuesTurn
  && before.turnMarkdown === after.turnMarkdown
  && before.previousTodoWrite === after.previousTodoWrite
  && before.loadFullOutput === after.loadFullOutput
  && before.timedRows === after.timedRows);
