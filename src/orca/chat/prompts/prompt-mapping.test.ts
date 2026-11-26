// TermWeave's own round-trip checks of the prompt mapping (SPEC 5.3 acceptance).
import { describe, expect, test } from "bun:test";

import { translate } from "../../../lib/i18n.ts";
import { approvalPrompt, keysAction, multiSelectPrompt, planPrompt, sendAction, singleQuestionPrompt, steppedPrompt, typedOnlyPrompt } from "./fixtures.ts";
import { paneActionApproval, toChatPrompt, toPromptAnswer } from "./prompt-mapping.ts";

const t = (key: string, vars?: Record<string, string | number>) => translate("en", key, vars);

describe("toChatPrompt + toPromptAnswer", () => {
  test("approval: options keep their source index; the body is the detail", () => {
    const chat = toChatPrompt(approvalPrompt);
    if (chat.kind !== "approval") throw new Error("expected approval");
    expect(chat.id).toBe("a1");
    expect(chat.approval).toEqual({
      title: "Bash command",
      description: "Do you want to proceed?",
      detail: "rm -rf build && bun run build",
      options: [
        { label: "Yes", description: null, index: 0 },
        { label: "Yes, and don't ask again for bun commands", description: null, index: 1 },
        { label: "No", description: null, index: 2 },
      ],
    });
    expect(toPromptAnswer(chat, { kind: "option", index: 0 }, "pane1")).toEqual({ pane_id: "pane1", prompt_id: "a1", expected_terminal_id: "t9", option_index: 0 });
    expect(toPromptAnswer(chat, { kind: "option", index: 2 }, "pane1").option_index).toBe(2);
  });

  test("plan: the typed-answer row is not an option, and typed text goes as custom_text", () => {
    const chat = toChatPrompt(planPrompt);
    if (chat.kind !== "approval") throw new Error("expected approval");
    expect(chat.approval.options.map((option) => option.index)).toEqual([0, 1]);
    expect(chat.approval.detail).toContain("## Plan");
    expect(toPromptAnswer(chat, { kind: "option", index: 1 }, "p")).toEqual({ pane_id: "p", prompt_id: "p1", option_index: 1 });
    expect(toPromptAnswer(chat, { kind: "text", text: "Use SQLite" }, "p")).toEqual({ pane_id: "p", prompt_id: "p1", custom_text: "Use SQLite" });
  });

  test("single question: recommended pill, typed row left out, index mapped back", () => {
    const chat = toChatPrompt(singleQuestionPrompt);
    if (chat.kind !== "question") throw new Error("expected question");
    expect(chat.ask).toEqual({
      questions: [{
        question: "Which cache should we use?",
        header: "Cache",
        multiSelect: false,
        options: [{ label: "Redis", description: "Shared across workers", recommended: true }, { label: "In memory" }],
      }],
      otherIndex: 2,
    });
    expect(toPromptAnswer(chat, { kind: "option", index: 1 }, "p").option_index).toBe(1);
    expect(toPromptAnswer(chat, { kind: "text", text: "Memcached" }, "p").custom_text).toBe("Memcached");
  });

  test("multi select: indices sorted and mapped", () => {
    const chat = toChatPrompt(multiSelectPrompt);
    if (chat.kind !== "question") throw new Error("expected question");
    expect(chat.ask.questions[0]?.multiSelect).toBe(true);
    expect(chat.ask.otherIndex).toBeNull();
    expect(toPromptAnswer(chat, { kind: "options", indices: [2, 0] }, "p").option_indices).toEqual([0, 2]);
  });

  test("an index past the shown options is refused, not misfired", () => {
    const chat = toChatPrompt(singleQuestionPrompt);
    expect(() => toPromptAnswer(chat, { kind: "option", index: 2 }, "p")).toThrow();
  });

  test("steps pass through as header steps", () => {
    const chat = toChatPrompt(steppedPrompt);
    if (chat.kind !== "question") throw new Error("expected question");
    expect(chat.ask.steps).toEqual(steppedPrompt.steps);
    expect(chat.ask.questions[0]?.options.map((option) => option.label)).toEqual(["Postgres", "SQLite"]);
    expect(toPromptAnswer(chat, { kind: "option", index: 1 }, "p").option_index).toBe(1);
  });

  test("typed-only question: no options, otherIndex 0", () => {
    const chat = toChatPrompt(typedOnlyPrompt);
    if (chat.kind !== "question") throw new Error("expected question");
    expect(chat.ask.questions[0]?.options).toEqual([]);
    expect(chat.ask.otherIndex).toBe(0);
  });

  test("a multi-select approval becomes a question card", () => {
    expect(toChatPrompt({ ...approvalPrompt, multi_select: true }).kind).toBe("question");
  });
});

describe("paneActionApproval", () => {
  test("send: worded from the action, text as detail, Approve then Deny", () => {
    expect(paneActionApproval(sendAction, t)).toEqual({
      title: "Type this into the api pane and press Enter?",
      detail: "bun test --watch",
      options: [{ label: "Approve", description: null, index: 0 }, { label: "Deny", description: null, index: 1 }],
    });
  });

  test("keys: no detail", () => {
    const approval = paneActionApproval(keysAction, t);
    expect(approval.title).toBe("Press C-c in the api pane?");
    expect(approval.detail).toBeUndefined();
  });
});
