// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/prompts/use-native-chat-prompt-card-focus.ts; adapted for TermWeave.
import { useLayoutEffect, type RefObject } from "react";

export const PROMPT_CARD_FOCUS_TARGET_SELECTOR = "[data-native-chat-prompt-card-focus-target]:not(:disabled)";

/** A text field, contenteditable, or select: typing there is editing, not a card shortcut. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    || (target instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit", "reset"].includes(target.type));
}

/** An IME's Enter commits a candidate; WebKit can send it after compositionend as key code 229. */
export function isImeKey(event: { isComposing: boolean; keyCode: number }): boolean {
  return event.isComposing || event.keyCode === 229;
}

/** Focus in this card's chat, or nowhere in particular: the card may take it. */
export function isInChatOf(card: HTMLElement | null, element: Element | null): boolean {
  return !element || element === document.body || Boolean(card?.closest("[data-native-chat-root]")?.contains(element));
}

/** A held key's auto-repeat must not press the button focus landed on; only a fresh press activates one. */
function ignoreHeldKeysOnButtons(card: HTMLElement): () => void {
  let spacePressedOn: EventTarget | null = null;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    if (event.key === " " && !event.repeat) spacePressedOn = event.target;
    if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== " ") return;
    if (event.target instanceof HTMLButtonElement && spacePressedOn !== event.target) event.preventDefault();
    spacePressedOn = null;
  };
  card.addEventListener("keydown", onKeyDown, true);
  card.addEventListener("keyup", onKeyUp, true);
  return () => {
    card.removeEventListener("keydown", onKeyDown, true);
    card.removeEventListener("keyup", onKeyUp, true);
  };
}

/**
 * Takes focus when the card replaces the composer. Decision: Orca focuses an approval's default button
 * unless the composer held a draft; TermWeave cannot see the composer's draft from here, so a button is
 * never focused: the card itself takes focus (Tab reaches the default), and only a typed-answer field
 * named as the focus target (a card with no options) is focused directly. A keystroke meant for the
 * composer then never answers the agent.
 */
export function usePromptCardFocus(cardRef: RefObject<HTMLElement | null>, shouldFocus: boolean, focusKey: string): void {
  useLayoutEffect(() => {
    const card = cardRef.current;
    return card ? ignoreHeldKeysOnButtons(card) : undefined;
  }, [cardRef]);
  useLayoutEffect(() => {
    const card = cardRef.current;
    const active = document.activeElement;
    if (!card || !shouldFocus || !isInChatOf(card, active) || (active !== card && card.contains(active))) return;
    const target = card.querySelector<HTMLElement>(PROMPT_CARD_FOCUS_TARGET_SELECTOR);
    if (target && !(target instanceof HTMLButtonElement)) target.focus();
    else card.focus();
  }, [cardRef, shouldFocus, focusKey]);
}
