// What is selected in a terminal now. xterm draws on a canvas, so the page's own selection never holds
// terminal text; PaneTerminal reports it here and the companion's "Ask about the selection" reads it.
let held: { owner: object; text: string } | null = null;

export function noteTerminalSelection(owner: object, text: string): void {
  if (text !== "") held = { owner, text };
  else if (held?.owner === owner) held = null;
}

export function terminalSelection(): string { return held?.text ?? ""; }
