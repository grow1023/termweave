import { describe, expect, test } from "bun:test";

import type { JournalApproval, JournalQuestion } from "../../../../shared/bots/chat.ts";
import type { Translate } from "../../../lib/i18n.ts";
import { approvalOptionId, questionAnswer, sessionApproval, sessionQuestionStep } from "./session-prompts.ts";

const t: Translate = (key, vars) => (vars === undefined ? key : key.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)));
const pending = { state: "pending" as const, answer: null, resolvedBy: null, resolvedAt: null };

const tool: JournalApproval = {
  kind: "approval", promptKey: "p1", title: "Allow Bash?", toolName: "Bash", decisionReason: "outside the project", detail: '{\n  "command": "rm /srv/x"\n}',
  options: [{ id: "allow", label: "Allow" }, { id: "allowForSession", label: "Allow for this session" }, { id: "deny", label: "Deny" }], resolution: pending,
};
const plan: JournalApproval = {
  kind: "approval", promptKey: "p2", title: "Review proposed plan", toolName: "ExitPlanMode", plan: "1. do it", detail: null,
  options: [{ id: "allow", label: "Approve plan" }, { id: "deny", label: "Keep planning" }], resolution: pending,
};
const questions: JournalQuestion = {
  kind: "question", promptKey: "q", question: "Which db?", resolution: pending,
  questions: [
    { id: "q1", question: "Which db?", header: "Database", multiSelect: false, options: [{ id: "q1:choice-1", label: "Postgres" }, { id: "q1:choice-2", label: "SQLite" }] },
    { id: "q2", question: "Which extras?", multiSelect: true, options: [{ id: "q2:choice-1", label: "Cache" }, { id: "q2:choice-2", label: "Queue" }] },
  ],
};

describe("sessionApproval", () => {
  test("Allow, Allow for this session, Deny, in the server's order, with the tool's input as detail", () => {
    const card = sessionApproval(tool, false, t);
    expect(card.title).toBe("Allow Bash?");
    expect(card.options.map((option) => option.label)).toEqual(["Allow", "Allow for this session", "Deny"]);
    expect(card.description).toBe("outside the project");
    expect(card.detail).toContain("rm /srv/x");
    expect(card.options.map((option) => approvalOptionId(tool, option.index))).toEqual(["allow", "allowForSession", "deny"]);
  });

  test("a plan shows the plan and its own two answers", () => {
    const card = sessionApproval(plan, false, t);
    expect(card).toMatchObject({ title: "Review proposed plan", detail: "1. do it" });
    expect(card.options.map((option) => option.label)).toEqual(["Approve plan", "Keep planning"]);
  });

  test("read-only: no options, so no buttons", () => {
    expect(sessionApproval(tool, true, t).options).toEqual([]);
  });

  test("an index past the options is refused", () => {
    expect(() => approvalOptionId(tool, 5)).toThrow();
  });
});

describe("sessionQuestionStep and questionAnswer", () => {
  test("each step is one question with steps and a typed-answer field", () => {
    const first = sessionQuestionStep("prompt:q", questions, 0, t)!;
    expect(first.id).toBe("prompt:q#q1");
    expect(first.ask.questions[0]).toMatchObject({ question: "Which db?", header: "Database", multiSelect: false });
    expect(first.ask.otherIndex).toBe(2);
    expect(first.ask.steps).toEqual([{ label: "Database", answered: false, current: true }, { label: "Question 2", answered: false, current: false }]);
    expect(sessionQuestionStep("prompt:q", questions, 1, t)?.ask.steps?.[0]?.answered).toBe(true);
    expect(sessionQuestionStep("prompt:q", questions, 2, t)).toBeNull();
  });

  test("picks map to the server's option ids; typed text goes as other", () => {
    expect(questionAnswer(questions, 0, { kind: "option", index: 1 })).toEqual({ questionId: "q1", optionIds: ["q1:choice-2"] });
    expect(questionAnswer(questions, 1, { kind: "options", indices: [0, 1] })).toEqual({ questionId: "q2", optionIds: ["q2:choice-1", "q2:choice-2"] });
    expect(questionAnswer(questions, 0, { kind: "text", text: "MySQL" })).toEqual({ questionId: "q1", optionIds: [], other: "MySQL" });
  });
});
