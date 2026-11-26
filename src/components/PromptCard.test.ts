import { expect, it } from "bun:test";
import { coversLater } from "./PromptCard.tsx";

it("asks to confirm a tapped approval that also answers later requests, and only that", () => {
  const approval = { kind: "approval" } as const;
  for (const label of ["Yes, and don't ask again for this command", "Yes, and don’t ask again", "Always allow", "Allow all edits during this session"]) {
    expect(coversLater(approval, label)).toBe(true);
  }
  for (const label of ["Yes", "No, and tell Claude what to do differently", "Allow once", "Install"]) {
    expect(coversLater(approval, label)).toBe(false);
  }
  // a question's option "All of them" grants nothing
  expect(coversLater({ kind: "question" }, "All of them")).toBe(false);
});
