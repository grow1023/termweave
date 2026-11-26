// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/viewport/scroll/NativeChatJumpToLatest.tsx; adapted for TermWeave.
// Keep mounted for fading; hidden state is inert and excluded from assistive technology.
// No rim: a raised fill and the shadow separate the pill; the transparent border keeps a forced-colors edge.
import { useEffect, useRef } from "react";
import { ArrowDown } from "lucide-react";

import { useT } from "../../../lib/i18n.ts";

/** Keeps focus where the reader was typing: a pointer press never moves it here. */
function keepFocus(event: React.MouseEvent): void {
  event.preventDefault();
}

/**
 * Decision: React 18.3 does not know the `inert` prop, so it is set on the element directly.
 */
export function JumpToLatest({ visible, onJump, label }: { visible: boolean; onJump: () => void; label?: string }) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (node) node.inert = !visible;
  }, [visible]);
  return (
    <button
      ref={ref}
      type="button"
      data-shown={visible}
      data-native-chat-jump-latest=""
      aria-hidden={!visible || undefined}
      tabIndex={visible ? undefined : -1}
      onMouseDown={keepFocus}
      onClick={onJump}
      className="absolute bottom-[max(calc(var(--spacing)*3),var(--native-chat-worker-jump-lift,0px))] left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-transparent bg-[color-mix(in_srgb,var(--secondary-foreground)_5%,var(--secondary))] px-3 text-xs font-medium text-[color-mix(in_srgb,var(--secondary-foreground)_75%,black)] shadow-floating transition-[opacity,translate,background-color,color] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--secondary-foreground)_10%,var(--secondary))] dark:bg-accent dark:text-[color-mix(in_srgb,var(--accent-foreground)_75%,white)] dark:hover:bg-[color-mix(in_srgb,var(--accent-foreground)_8%,var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [[data-worker-dock-cramped]_&]:invisible data-[shown=false]:pointer-events-none data-[shown=false]:translate-y-1 data-[shown=false]:opacity-0 pointer-coarse:h-11"
    >
      <ArrowDown className="size-3.5" />
      <span>{label ?? t("Jump to latest")}</span>
    </button>
  );
}
