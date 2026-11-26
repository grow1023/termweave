// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/tasks/NativeChatTaskList.tsx; adapted for TermWeave.
// Cut: the `composer` presentation (Orca's docked task list; not part of the tool rows).
// Change: the "Full task list" disclosure uses the shared Expandable instead of Orca's Collapsible kit file.
import { ChevronRight, Circle, CircleCheck, CircleDot, ListChecks } from "lucide-react";

import { useT, type Translate } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Expandable, useDisclosure } from "../shared/index.ts";
import {
  diffNativeChatTaskLists,
  nativeChatCompletedTaskCount,
  nativeChatTaskChangeWords,
  nativeChatTaskLabel,
  type NativeChatTask,
  type NativeChatTaskChange,
  type NativeChatTaskList as TaskListModel,
} from "./lib/task-list.ts";

function statusLabel(task: NativeChatTask, t: Translate): string {
  if (task.status === "completed") return t("Completed");
  if (task.status === "in_progress") return t("In progress");
  return t("Pending");
}

function changeLabel(change: NativeChatTaskChange, t: Translate): string {
  const { key, task } = nativeChatTaskChangeWords(change);
  switch (key) {
    case "added": return t("Added {task}", { task });
    case "removed": return t("Removed {task}", { task });
    case "started": return t("Started {task}", { task });
    case "finished": return t("Completed {task}", { task });
    case "reset": return t("Marked pending: {task}", { task });
    case "updated": return t("Updated {task}", { task });
  }
}

function TaskRow({ task, label }: { task: NativeChatTask; label?: string }) {
  const t = useT();
  const Icon = task.status === "completed" ? CircleCheck : task.status === "in_progress" ? CircleDot : Circle;
  return (
    <li className={cn("flex items-start gap-1.5", task.status === "in_progress" && "font-medium text-chat-foreground-strong")}>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="sr-only">{statusLabel(task, t)}: </span>
      <span className={cn("min-w-0 whitespace-pre-wrap break-words", !label && task.status === "completed" && "line-through")}>
        {label ?? nativeChatTaskLabel(task)}
      </span>
    </li>
  );
}

function Checklist({ list }: { list: TaskListModel }) {
  const t = useT();
  return list.tasks.length === 0 ? (
    <p className="text-xs">{t("No tasks")}</p>
  ) : (
    <ul aria-label={t("Tasks")} className="space-y-1 py-1">
      {list.tasks.map((task, index) => <TaskRow key={`${task.content}:${index}`} task={task} />)}
    </ul>
  );
}

function taskProgressLabel(completed: number, total: number, t: Translate): string {
  return total === 1
    ? t("{completed} of {count} task completed", { completed, count: total })
    : t("{completed} of {count} tasks completed", { completed, count: total });
}

function TaskChanges({ list, changes, disclosureKey }: { list: TaskListModel; changes: NativeChatTaskChange[]; disclosureKey?: string }) {
  const t = useT();
  const fullList = useDisclosure(disclosureKey, false);
  return (
    <>
      {changes.length > 0 ? (
        <ul className="space-y-1 py-1">
          {changes.map((change, index) => <TaskRow key={`${change.kind}:${index}`} task={change.task} label={changeLabel(change, t)} />)}
        </ul>
      ) : (
        <p className="text-xs text-chat-foreground-faint">{t("Tasks unchanged")}</p>
      )}
      <button
        type="button"
        aria-expanded={fullList.open}
        onClick={() => fullList.setOpen(!fullList.open)}
        className="group flex items-center gap-1 rounded py-0.5 text-xs text-chat-foreground-faint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <ChevronRight aria-hidden className={cn("size-3.5", fullList.open && "rotate-90")} />
        {t("Full task list")}
      </button>
      <Expandable open={fullList.open}>
        <Checklist list={list} />
      </Expandable>
    </>
  );
}

/** The list model, under the name SPEC 5.4 exports (a type beside the component of the same name). */
export type TaskList = TaskListModel;

/** A TodoWrite / update_plan list; with `previous`, only what changed, the full list one click away. */
export function TaskList({ list, previous, disclosureKey }: { list: TaskListModel; previous?: TaskListModel; disclosureKey?: string }) {
  const t = useT();
  const completed = nativeChatCompletedTaskCount(list);
  const changes = previous ? diffNativeChatTaskLists(previous, list) : null;
  return (
    <div className="space-y-1 py-1 text-sm text-chat-foreground-faint">
      <div className="flex items-center gap-1.5 text-xs text-chat-foreground-faint">
        <ListChecks aria-hidden className="size-4 shrink-0" />
        <span className="font-medium">{t("Tasks")}</span>
        <span className="tabular-nums" aria-label={taskProgressLabel(completed, list.tasks.length, t)}>
          {completed}/{list.tasks.length}
        </span>
      </div>
      {changes ? <TaskChanges list={list} changes={changes} disclosureKey={disclosureKey} /> : <Checklist list={list} />}
      {list.explanation ? <p className="whitespace-pre-wrap break-words text-xs text-chat-foreground-faint">{list.explanation}</p> : null}
    </div>
  );
}
