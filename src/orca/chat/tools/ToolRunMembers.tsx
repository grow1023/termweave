// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/runs/NativeChatToolRunMemberList.tsx and NativeChatToolRunMembers.tsx; adapted for TermWeave.
// Cut: row windowing and pins (Orca virtualizes long runs; TermWeave pages its transcript), asides, diff reveal.
import { useMemo } from "react";

import { disclosureKey, type NativeChatBlock, type NativeChatToolCallBlock } from "../shared/index.ts";
import { DiffCard } from "./DiffCard.tsx";
import { buildNativeChatToolRunRows, type NativeChatToolRunRow } from "./lib/run-rows.ts";
import { TaskList } from "./TaskList.tsx";
import { ToolLine } from "./ToolLine.tsx";

function MemberRow({ row, disclosureId, runningCall }: { row: NativeChatToolRunRow; disclosureId: string; runningCall: NativeChatToolCallBlock | null }) {
  switch (row.kind) {
    case "tasks":
      return <TaskList {...row.taskList} disclosureKey={disclosureKey(disclosureId, "tasks", row.key)} />;
    case "edit":
      return (
        <>
          {row.files.map((file, fileIndex) => (
            <DiffCard key={`${row.editKey}:${fileIndex}`} file={file} disclosureKey={disclosureKey(disclosureId, "diff", row.editKey, fileIndex)} />
          ))}
        </>
      );
    case "line":
      return (
        <ToolLine
          block={row.block}
          result={row.result}
          running={runningCall !== null && row.block === runningCall}
          disclosureKey={disclosureKey(disclosureId, "line", row.lineIdentity)}
        />
      );
  }
}

/** Mounted only while the run is open, so collapsed runs avoid pairing and diff work. */
export function ToolRunMembers({ blocks, previousTodoWrite, disclosureId, runningCall }: {
  blocks: NativeChatBlock[];
  previousTodoWrite?: NativeChatToolCallBlock;
  disclosureId: string;
  runningCall: NativeChatToolCallBlock | null;
}) {
  const rows = useMemo(() => buildNativeChatToolRunRows(blocks, previousTodoWrite), [blocks, previousTodoWrite]);
  return (
    // A neutral 1px hairline (PORT-BRIEF rule 11), Orca's member rail.
    <div className="relative ml-1.75 mt-0.5 min-w-0 border-l border-chat-code-border pl-3.25" data-native-chat-tool-run-members>
      {rows.map((row) => (
        <div key={row.key} className="min-w-0" data-native-chat-tool-run-row={row.key}>
          <MemberRow row={row} disclosureId={disclosureId} runningCall={runningCall} />
        </div>
      ))}
    </div>
  );
}
