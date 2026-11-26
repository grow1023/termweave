// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/tasks/dock/NativeChatWorkerDockFrame.tsx; adapted for TermWeave.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const GestureContext = createContext(false);
function useWorkerDockGestureHeld(): boolean {
  return useContext(GestureContext);
}

function useHeldRelease(held: boolean, release: () => void): void {
  useEffect(() => {
    if (!held) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(timer);
      timer = setTimeout(release, 0);
    };
    const keyEnd = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") end();
    };
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("keyup", keyEnd, true);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("keyup", keyEnd, true);
      window.removeEventListener("blur", end);
      clearTimeout(timer);
    };
  }, [held, release]);
}

/** Defer structural dock updates through pointerup/click and a complete Enter/Space gesture, so a
 *  poll that reorders the cards never moves a button under the pointer. */
export function WorkerDockFrame({ children }: { children: ReactNode }) {
  const [held, setHeld] = useState(false);
  const release = useRef(() => setHeld(false)).current;
  useHeldRelease(held, release);
  const pointer = useRef<number | null>(null);
  return (
    <GestureContext.Provider value={held}>
      <div
        data-native-chat-worker-dock=""
        // The worker pill floats above this box, so it takes no room unless prompts sit in it.
        // TermWeave: it shrinks before the transcript does (the transcript keeps its floor, ChatTranscript)
        // and its cards scroll inside, so a tall card never pushes the conversation out of sight.
        className="relative mx-auto flex min-h-0 w-full max-w-(--chat-content-max-width) shrink flex-col px-3 pt-2 sm:px-4 [&:has([data-worker-dock-float]):not(:has([data-native-chat-worker-approvals]))]:pt-0 [&:not(:has([data-native-chat-background-tasks],[data-native-chat-worker-approvals]))]:hidden"
        onPointerDownCapture={(event) => {
          if (event.button === 0) {
            pointer.current = event.pointerId;
            setHeld(true);
          }
        }}
        onPointerUpCapture={(event) => {
          if (pointer.current === event.pointerId) {
            pointer.current = null;
            setTimeout(release, 0);
          }
        }}
        onPointerCancelCapture={() => {
          pointer.current = null;
          setHeld(false);
        }}
        onKeyDownCapture={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !event.repeat) setHeld(true);
        }}
        onKeyUpCapture={(event) => {
          if (event.key === "Enter" || event.key === " ") setTimeout(release, 0);
        }}
      >
        {children}
      </div>
    </GestureContext.Provider>
  );
}

/** The last value seen before a gesture began, while the gesture is held. */
export function useWorkerDockStructuralValue<T>(value: T): T {
  const held = useWorkerDockGestureHeld();
  const [previous, setPrevious] = useState({ value });
  if (!held && previous.value !== value) setPrevious({ value });
  return held ? previous.value : value;
}
