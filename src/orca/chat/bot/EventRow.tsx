// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/messages/events/NativeChatEventRow.tsx; adapted for TermWeave.
// Left out: find (TermWeave's chat has none) and the row-window context; `children` is named `lead` (SPEC 5.6).
import { Children, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { AgentWorkingSpinner } from "../../ui/AgentWorkingSpinner.tsx";
import { useDisclosure } from "../shared/index.ts";
import { ChatTime, useChatTimeLabel } from "./ChatTime.tsx";

/** Hidden until the row is hovered or holds keyboard focus; kept on touch, where nothing hovers. */
const REVEAL_OPACITY =
  "transition-opacity can-hover:opacity-0 group-hover/event-row:opacity-100 group-has-[:focus-visible]/event-row:opacity-100";
const REVEAL_POINTER =
  "can-hover:pointer-events-none group-hover/event-row:pointer-events-auto group-has-[:focus-visible]/event-row:pointer-events-auto";
const EVENT_ROW_REVEAL = `${REVEAL_OPACITY} ${REVEAL_POINTER}`;

export type EventBadge = "running" | "failed";

/** The row's 14px mark with its state in a badge at the bottom right. */
export function EventIcon({ children, badge }: { children: ReactNode; badge?: EventBadge | null }) {
  return (
    <span className="relative flex size-3.5 items-center justify-center">
      {children}
      {badge ? (
        <span className="absolute -right-1 -bottom-1 flex size-2.5 items-center justify-center rounded-full bg-chat-pane">
          {badge === "running" ? (
            <AgentWorkingSpinner className="size-[7px] border-[1.5px]" />
          ) : (
            <span className="flex size-2 items-center justify-center rounded-full bg-destructive text-chat-pane">
              <X className="size-1.5" strokeWidth={4} aria-hidden />
            </span>
          )}
        </span>
      ) : null}
    </span>
  );
}

/** Details cut at about four lines, with Show more, in the quiet fill comments use. */
function EventDetails({ id, clamp, children }: { id: string; clamp: boolean; children: ReactNode }) {
  const t = useT();
  const body = useRef<HTMLDivElement | null>(null);
  const [cut, setCut] = useState(false);
  const [full, setFull] = useState(!clamp);
  useLayoutEffect(() => {
    const node = body.current;
    if (!node || full) return;
    const measure = () => setCut(node.scrollHeight > node.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, full]);
  return (
    <div id={id} className="mt-0.5 mb-1 ml-5 rounded-[10px] bg-foreground/[0.035] px-2 pt-1.5 pb-2 dark:bg-foreground/[0.045]">
      <div
        ref={body}
        className={cn(
          "flex flex-col gap-1.5 text-sm leading-5 text-chat-foreground [overflow-wrap:anywhere]",
          !full && "max-h-[86px] overflow-hidden",
          !full && cut && "[mask-image:linear-gradient(to_bottom,#000_calc(100%-44px),transparent)]",
        )}
      >
        {children}
      </div>
      {clamp && (cut || full) ? (
        <button
          type="button"
          aria-expanded={full}
          className="mt-1.5 rounded-sm text-xs font-medium text-chat-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          onClick={() => setFull(!full)}
        >
          {full ? t("Show less") : t("Show more")}
        </button>
      ) : null}
    </div>
  );
}

/** The row's words as pieces of its one line: a bare text run becomes its own piece, which cuts short. */
function rowParts(children: ReactNode): ReactNode[] {
  const seen = new Map<string, number>();
  return Children.toArray(children).flatMap((child): ReactNode[] => {
    if (typeof child !== "string" && typeof child !== "number") return [child];
    const text = String(child).trim();
    if (!text) return [];
    const repeat = seen.get(text) ?? 0;
    seen.set(text, repeat + 1);
    return [<span key={`text:${text}:${repeat}`} className="min-w-0 truncate" title={text}>{text}</span>];
  });
}

export interface EventRowProps {
  icon: ReactNode;
  /** The row's words; may hold chips. */
  lead: ReactNode;
  /** Opens under the row when its button is pressed. */
  detail?: ReactNode;
  /** Epoch ms. */
  time?: number | null;
  /** Where the transcript remembers whether the details are open. */
  disclosureKey?: string;
  /** The words as plain text: the row button's name, with the time. */
  label?: string;
  badge?: EventBadge | null;
  clampDetails?: boolean;
  className?: string;
}

/** One status line in the transcript: icon · text, then on hover or focus a chevron and the time. */
export function EventRow({ icon, lead, detail, time, disclosureKey, label, badge, clampDetails = true, className }: EventRowProps) {
  const t = useT();
  const disclosure = useDisclosure(disclosureKey, false);
  const timeLabel = useChatTimeLabel(time);
  const state = badge === "running" ? t("Running") : badge === "failed" ? t("Failed") : null;
  const detailsId = useId();
  const toggles = detail !== undefined && detail !== null && detail !== false;
  const open = disclosure.open;
  const hasTime = time !== undefined && time !== null;
  return (
    <div className={className}>
      <div className="group/event-row @container/event-row relative flex min-h-6 items-start gap-1.5 font-sans text-sm leading-relaxed text-chat-foreground-faint">
        {toggles ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? detailsId : undefined}
            aria-label={[label, state, timeLabel].filter(Boolean).join(", ") || undefined}
            title={label}
            className="absolute -inset-x-1 -inset-y-0.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => disclosure.setOpen(!open)}
          />
        ) : null}
        <span className={cn("relative mt-[5px] flex shrink-0", toggles && "pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto")}>
          <EventIcon badge={badge}>{icon}</EventIcon>
        </span>
        <span
          className={cn(
            "relative flex min-w-0 items-center gap-x-1 overflow-x-clip whitespace-nowrap [&>*]:min-w-0 [&>*]:overflow-x-clip [&>*]:text-ellipsis",
            toggles && "pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
          )}
        >
          {state && !toggles ? <span className="sr-only">{state}, </span> : null}
          {rowParts(lead)}
        </span>
        {toggles || hasTime ? (
          <span
            className={cn(
              "relative ml-auto flex h-6 shrink-0 items-center gap-1.5 pl-2",
              "can-hover:absolute can-hover:top-0 can-hover:right-0 can-hover:bg-chat-pane can-hover:before:pointer-events-none can-hover:before:absolute can-hover:before:inset-y-0 can-hover:before:right-full can-hover:before:w-4 can-hover:before:bg-linear-to-r can-hover:before:from-transparent can-hover:before:to-chat-pane can-hover:before:content-['']",
              toggles ? cn("pointer-events-none", !open && REVEAL_OPACITY) : !open && EVENT_ROW_REVEAL,
            )}
          >
            {toggles ? <ChevronRight aria-hidden className={cn("pointer-events-none size-3.5 shrink-0 transition-transform", open && "rotate-90")} /> : null}
            {hasTime ? (
              <span className="hidden @sm/event-row:block">
                <ChatTime timestamp={time} />
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {toggles && open ? <EventDetails id={detailsId} clamp={clampDetails}>{detail}</EventDetails> : null}
    </div>
  );
}
