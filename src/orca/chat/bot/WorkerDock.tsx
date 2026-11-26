// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/tasks/dock/
// WorkerDockRoster.tsx, WorkerDockPill.tsx and worker-dock-summary.ts; adapted for TermWeave.
// The bot's workers as one floating pill over the end of the transcript; pressing it opens a card of
// every worker above it, and a row opens that worker's terminal (openLocalPane).
// Left out: row virtualization and detail reads (TermWeave sends every worker at once), the card height
// budget (a fixed six rows), scroll anchoring and fades, Stop all and Clear failed (no such calls).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { useT, type Translate } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { openLocalPane, type BotWorker } from "../../bots/data.ts";
import type { ChatBotContext } from "../shared/index.ts";
import { WorkerDockGlyph, WorkerDockRow, compareWorkers, workerGlyph, workerTitle } from "./WorkerDockRow.tsx";

const PILL_ROOM = "36px";
const JUMP_LIFT = "--native-chat-worker-jump-lift";
const ROW = 30;
const MAX_ROWS = 6;

const FLOAT_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-full z-20 h-0 [[data-native-chat-dock-fit~=dock]_&]:static [[data-native-chat-dock-fit~=dock]_&]:flex [[data-native-chat-dock-fit~=dock]_&]:h-auto [[data-native-chat-dock-fit~=dock]_&]:flex-col [[data-native-chat-dock-fit~=dock]_&]:items-center [[data-native-chat-dock-fit~=dock]_&]:gap-2 [[data-native-chat-dock-fit~=dock]_&]:pt-2";
// Raised over the transcript, opaque even when the chat's message-box surface is translucent.
const SURFACE_CLASS =
  "pointer-events-auto border border-border bg-chat-canvas bg-[linear-gradient(var(--color-chat-composer-surface),var(--color-chat-composer-surface))] text-foreground [[data-native-chat-dock-fit~=dock]_&]:static";

function summary(workers: readonly BotWorker[], t: Translate): string {
  const total = workers.length;
  const failed = workers.filter((w) => w.status === "failed").length;
  const needsYou = workers.filter((w) => w.status === "blocked").length;
  const running = workers.filter((w) => w.status === "starting" || w.status === "working").length;
  const count = total === 1 ? t("1 worker") : t("{count} workers", { count: total });
  const status = failed
    ? t("{count} failed", { count: failed })
    : needsYou
      ? t("{count} needs you", { count: needsYou })
      : running ? t("{count} running", { count: running }) : "";
  return [count, status].filter(Boolean).join(" · ");
}

/** Only while the pill shows does the transcript reserve its room and Jump to latest lift over it. */
function usePillRoom(pill: RefObject<HTMLButtonElement>): void {
  useLayoutEffect(() => {
    const pane = pill.current?.closest<HTMLElement>("[data-native-chat-root]");
    if (!pane) return;
    pane.style.setProperty("--native-chat-worker-pill-room", PILL_ROOM);
    pane.style.setProperty(JUMP_LIFT, PILL_ROOM);
    return () => {
      pane.style.removeProperty("--native-chat-worker-pill-room");
      pane.style.removeProperty(JUMP_LIFT);
    };
  }, [pill]);
}

/** While the card is open, a press anywhere outside the pill and the card folds it, as Escape does. */
function useOutsidePress(root: RefObject<HTMLElement>, open: boolean, onOutside: () => void): void {
  const latest = useRef(onOutside);
  latest.current = onOutside;
  useEffect(() => {
    if (!open) return;
    const press = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || root.current?.contains(target)) return;
      if (target.closest('[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper]')) return;
      if (target.closest("[data-native-chat-jump-latest]")) return;
      latest.current();
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  }, [root, open]);
}

/** While the card is open, Jump to latest rides 8px above it instead of hiding behind it. */
function useJumpLift(card: RefObject<HTMLElement>, open: boolean): void {
  useLayoutEffect(() => {
    const element = card.current;
    const pane = element?.closest<HTMLElement>("[data-native-chat-root]");
    if (!open || !element || !pane || typeof ResizeObserver === "undefined") return;
    const lift = () => pane.style.setProperty(JUMP_LIFT, `calc(${PILL_ROOM} + ${element.offsetHeight + 8}px)`);
    const observer = new ResizeObserver(lift);
    observer.observe(element);
    lift();
    return () => {
      observer.disconnect();
      if (pane.style.getPropertyValue("--native-chat-worker-pill-room")) pane.style.setProperty(JUMP_LIFT, PILL_ROOM);
    };
  }, [card, open]);
}

function focusRow(viewport: HTMLElement | null, index: number): void {
  const buttons = viewport?.querySelectorAll<HTMLButtonElement>("[data-worker-dock-open]");
  buttons?.[Math.max(0, Math.min(index, buttons.length - 1))]?.focus();
}

function Pill({ pill, workers, expanded, listId, onToggle, onKeyDown }: {
  pill: RefObject<HTMLButtonElement>;
  workers: readonly BotWorker[];
  expanded: boolean;
  listId: string;
  onToggle: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const t = useT();
  usePillRoom(pill);
  const top = workers[0];
  const title = top ? workerTitle(top) : "";
  const total = workers.length;
  const more = total - 1;
  return (
    <button
      ref={pill}
      type="button"
      data-worker-dock-pill=""
      aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-label={total === 1 ? t("1 worker, latest: {title}", { title }) : t("{count} workers, latest: {title}", { count: total, title })}
      className={cn(SURFACE_CLASS, "absolute inset-x-0 bottom-0 mx-auto flex h-7 w-fit max-w-[min(320px,calc(100%-40px))] items-center gap-1.5 rounded-[14px] pr-2.5 pl-2.5 text-xs shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      {top ? <WorkerDockGlyph glyph={workerGlyph(top.status)} /> : null}
      <span key={title} data-worker-dock-pill-title="" className="min-w-0 truncate animate-in fade-in-0 duration-150 motion-reduce:animate-none">{title}</span>
      {more > 0 ? <span className="shrink-0 tabular-nums text-muted-foreground">+{more}</span> : null}
    </button>
  );
}

export function WorkerDock({ context }: { context: ChatBotContext }) {
  const t = useT();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const workers = useMemo(() => [...context.workers].sort(compareWorkers), [context.workers]);
  const close = (refocus: boolean): void => {
    setExpanded(false);
    if (refocus) pill.current?.focus();
  };
  useOutsidePress(root, expanded, () => close(false));
  useJumpLift(card, expanded);
  if (workers.length === 0) return null;
  const open = (worker: BotWorker): void => {
    if (!worker.paneId) return;
    openLocalPane(worker.paneId);
    close(false);
  };
  return (
    <div
      ref={root}
      data-native-chat-background-tasks="true"
      data-worker-dock-float=""
      className={FLOAT_CLASS}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      {expanded ? (
        <div
          ref={card}
          data-worker-dock-card=""
          className={cn(SURFACE_CLASS, "absolute inset-x-0 bottom-9 mx-auto flex w-[min(320px,calc(100%-24px))] flex-col rounded-[10px] p-1 shadow-floating animate-in fade-in-0 slide-in-from-bottom-1 duration-120 motion-reduce:animate-none")}
        >
          <div
            ref={viewport}
            id={id}
            role="region"
            aria-label={t("Workers")}
            className="scrollbar-sleek min-h-0 overflow-y-auto overscroll-contain"
            style={{ maxHeight: ROW * MAX_ROWS }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              const buttons = [...(viewport.current?.querySelectorAll<HTMLButtonElement>("[data-worker-dock-open]") ?? [])];
              const index = buttons.findIndex((button) => button === document.activeElement);
              if (index === -1) return;
              event.preventDefault();
              const next = index + (event.key === "ArrowDown" ? 1 : -1);
              // The pill sits just below the card, so moving down past the last row lands on it.
              if (next >= buttons.length) pill.current?.focus();
              else focusRow(viewport.current, next);
            }}
          >
            {workers.map((worker) => <WorkerDockRow key={worker.id} worker={worker} onOpen={open} />)}
          </div>
        </div>
      ) : null}
      <Pill
        pill={pill}
        workers={workers}
        expanded={expanded}
        listId={id}
        onToggle={() => setExpanded(!expanded)}
        onKeyDown={(event) => {
          if (expanded && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            focusRow(viewport.current, event.key === "ArrowUp" ? workers.length - 1 : 0);
          }
        }}
      />
      <span className="sr-only" role="status" aria-live="polite">{summary(workers, t)}</span>
    </div>
  );
}
