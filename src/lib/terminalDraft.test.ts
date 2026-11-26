import { expect, it } from "bun:test";
import { acknowledgeTerminalDraft, readTerminalDraft, setTerminalDraftSending, terminalDraftSending, writeTerminalDraft } from "./terminalDraft.ts";

it("preserves edits across remounts and confines acknowledgements to the submitting PC/pane", () => {
  const owner = "remote-a:w1:p1";
  const other = "remote-b:w1:p1";
  writeTerminalDraft(owner, "sent");
  writeTerminalDraft(other, "other");
  setTerminalDraftSending(owner, true);
  expect(terminalDraftSending(owner)).toBe(true);
  writeTerminalDraft(owner, "sent plus 한글");
  acknowledgeTerminalDraft(owner);
  setTerminalDraftSending(owner, false);
  expect(readTerminalDraft(owner)).toBe(" plus 한글");
  expect(readTerminalDraft(other)).toBe("other");
});

it("does not erase a replacement even when the user retypes the same text before acknowledgement", () => {
  const owner = "edited:w1:p1";
  writeTerminalDraft(owner, "same text");
  setTerminalDraftSending(owner, true);
  writeTerminalDraft(owner, "");
  writeTerminalDraft(owner, "same text");
  acknowledgeTerminalDraft(owner);
  setTerminalDraftSending(owner, false);
  expect(readTerminalDraft(owner)).toBe("same text");
});

it("keeps a line typed under a password prompt off disk, until the line is emptied", () => {
  const stored = new Map<string, string>();
  const fake = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } };
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: fake });
  try {
    const owner = "local:w1:secret";
    writeTerminalDraft(owner, "ls -la");
    expect([...stored.values()]).toEqual(["ls -la"]);
    // the screen asks for a passphrase: the line (and its earlier stored copy) leaves the disk
    writeTerminalDraft(owner, "ls -lafixture-not-a-secret", false);
    expect(stored.size).toBe(0);
    expect(readTerminalDraft(owner)).toBe("ls -lafixture-not-a-secret");
    // the prompt is gone, but the text typed under it is still in the line: still memory only
    writeTerminalDraft(owner, "ls -lafixture-not-a-secret!");
    expect(stored.size).toBe(0);
    // an emptied line starts over and is stored again
    writeTerminalDraft(owner, "");
    writeTerminalDraft(owner, "pwd");
    expect([...stored.values()]).toEqual(["pwd"]);
  } finally {
    if (saved) Object.defineProperty(globalThis, "localStorage", saved);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
