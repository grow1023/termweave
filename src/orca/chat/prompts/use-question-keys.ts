// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/prompts/use-native-chat-question-keys.ts; adapted for TermWeave.
// Decision: TermWeave's card asks one question at a time (its server steps a form), so ←/→ stepping is left out.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

import { isEditableTarget, isImeKey, isInChatOf } from "./use-prompt-card-focus.ts";

function moveFocus(card: HTMLElement | null, target: Element | null, up: boolean): boolean {
  const rows = Array.from(card?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? []);
  const field = card?.querySelector<HTMLTextAreaElement>("[data-native-chat-answer-field]") ?? null;
  const inField = field !== null && target === field;
  if (rows.length === 0) return false;
  // Inside the field, the arrows move the caret until it sits at the field's edge.
  if (inField && (field.selectionStart !== field.selectionEnd || field.selectionStart !== (up ? 0 : field.value.length))) return false;
  const stops: HTMLElement[] = field ? [...rows, field] : rows;
  const current = inField ? stops.length - 1 : rows.findIndex((row) => row.contains(target));
  const next = current === -1 ? (up ? stops.length - 1 : 0) : (current + (up ? -1 : 1) + stops.length) % stops.length;
  stops[next]?.focus();
  if (field && stops[next] === field) field.setSelectionRange(field.value.length, field.value.length);
  return true;
}

/** Digits 1-9 pick an option; ↑/↓ move between the options and the answer field. Scoped to the card's chat. */
export function useQuestionKeys(cardRef: RefObject<HTMLElement | null>, enabled: boolean, optionCount: number, onPick: (index: number) => void): void {
  const latest = useRef({ optionCount, onPick });
  useLayoutEffect(() => {
    latest.current = { optionCount, onPick };
  });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const card = cardRef.current;
      const isDigit = /^[1-9]$/.test(event.key);
      const isArrow = event.key === "ArrowDown" || event.key === "ArrowUp";
      const field = card?.querySelector("[data-native-chat-answer-field]") ?? null;
      const inField = field !== null && target === field;
      if (event.defaultPrevented || (isEditableTarget(target) && !(inField && isArrow)) || !isInChatOf(card, target)) return;
      if (!isDigit && !card?.contains(target)) return;
      if (event.repeat || isImeKey(event) || event.metaKey || event.ctrlKey || event.altKey || (event.shiftKey && !isDigit)) return;
      if (isDigit) {
        const index = Number(event.key) - 1;
        if (index >= latest.current.optionCount) return;
        event.preventDefault();
        latest.current.onPick(index);
      } else if (isArrow && moveFocus(card, target, event.key === "ArrowUp")) {
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cardRef, enabled]);
}
