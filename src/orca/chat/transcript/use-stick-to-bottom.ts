// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/viewport/scroll/native-chat-autoscroll.ts
// (the 48px bottom rule) and TermWeave's ChatView.tsx scroll handling (lines 714-751 before the 2026-11-27 hook move, 501-538 after it);
// adapted for TermWeave. Orca's reader-gesture tracking is left out: a scroll event check is enough (SPEC 1.3).
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { dismissKeyboardOn } from "../../../lib/keyboard.ts";
import type { ChatScrollBinding } from "../adapter/use-conversation-feed.ts";
import type { ChatFeed } from "../shared/index.ts";
import { BOTTOM_THRESHOLD_PX, LOAD_OLDER_PX, jumpToLatestShown } from "./transcript-model.ts";

export interface StickToBottom {
  onScroll: () => void;
  /** The reader left the end and more than a screen lies below (jumpToLatestShown). */
  showJump: boolean;
  jump: () => void;
}

function atBottom(node: HTMLElement): boolean {
  return node.scrollTop + node.clientHeight >= node.scrollHeight - BOTTOM_THRESHOLD_PX;
}

/**
 * Keeps a reader at the end there as rows arrive; offers Jump when they scrolled up; asks for the
 * older page near the top. `content` is anything whose change can grow the transcript.
 */
export function useStickToBottom(scroll: ChatScrollBinding, feed: Pick<ChatFeed, "older" | "loadOlder">, content: unknown): StickToBottom {
  const { scroller, stickToBottom } = scroll;
  const [away, setAway] = useState(false);
  const { older, loadOlder } = feed;

  const maybeLoadOlder = useCallback((node: HTMLElement) => {
    if (node.scrollTop < LOAD_OLDER_PX && older === "idle") loadOlder();
  }, [older, loadOlder]);

  // Before paint and without animation: an opened conversation starts at its end.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node === null) return;
    if (stickToBottom.current) node.scrollTop = node.scrollHeight;
    setAway(jumpToLatestShown(stickToBottom.current, node));
  }, [content, scroller, stickToBottom]);

  // A transcript too short to scroll never fires a scroll event: ask for the older page here too.
  // Decision: a passive effect, so it reads the place after the feed (a parent) restored it above
  // a prepended page; a layout effect here would run first and load page after page.
  useEffect(() => {
    const node = scroller.current;
    if (node !== null) maybeLoadOlder(node);
  }, [content, scroller, maybeLoadOlder]);

  // A resized composer, a raised keyboard or a narrower window shrinks the view without a scroll
  // event; a reader at the end stays at the end, at once.
  useEffect(() => {
    const node = scroller.current;
    if (node === null) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) node.scrollTo({ top: node.scrollHeight, behavior: "instant" });
      // the screen that measures "far from the end" changed with it
      else setAway(jumpToLatestShown(false, node));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [scroller, stickToBottom]);

  // a tap or a drag down the transcript puts a phone's keyboard away to read (lib/keyboard.ts)
  useEffect(() => {
    const node = scroller.current;
    return node === null ? undefined : dismissKeyboardOn(node);
  }, [scroller]);

  const onScroll = useCallback(() => {
    const node = scroller.current;
    if (node === null) return;
    stickToBottom.current = atBottom(node);
    setAway(jumpToLatestShown(stickToBottom.current, node));
    maybeLoadOlder(node);
  }, [scroller, stickToBottom, maybeLoadOlder]);

  const jump = useCallback(() => {
    const node = scroller.current;
    if (node === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    stickToBottom.current = true;
    setAway(false);
  }, [scroller, stickToBottom]);

  return { onScroll, showJump: away, jump };
}
