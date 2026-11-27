import { expect, test } from "bun:test";

import { newestModelsOnly } from "../../../../shared/bots/chat.ts";
import type { Translate } from "../../../lib/i18n.ts";
import { modelChipText, modelRows } from "./BotModelPicker.tsx";

const t: Translate = (key) => key;
const models = [{ value: "opus", label: "Opus 5.5" }];

test("the chip shows the bot's own choice, then what the chat reports, then a plain word", () => {
  expect(modelChipText({ model: "opus", effort: "high" }, models, { model: "claude-x", effort: "low" }, t)).toBe("Opus 5.5 · High");
  expect(modelChipText({ model: "custom-id", effort: null }, models, { model: null, effort: null }, t)).toBe("custom-id");
  expect(modelChipText({ model: null, effort: null }, models, { model: "claude-x", effort: "medium" }, t)).toBe("claude-x · medium");
  expect(modelChipText({}, models, { model: null, effort: null }, t)).toBe("Model");
});


const list = [
  { value: "default", label: "Default (recommended)" },
  { value: "opus", label: "Opus 5.5", description: "For complex work" },
  { value: "claude-sonnet-5", label: "Sonnet 5", description: "Efficient for routine tasks" },
];
const dflt = { value: null, label: "Default" };

test("the model list: the default first, the host's own default row left out, the host's order kept", () => {
  expect(modelRows(list, "", dflt).map((row) => row.value)).toEqual([null, "opus", "claude-sonnet-5"]);
});

test("a search matches every word in the name, the id or the description, without reordering", () => {
  expect(modelRows(list, "sonnet", dflt).map((row) => row.value)).toEqual(["claude-sonnet-5"]);
  expect(modelRows(list, "routine efficient", dflt).map((row) => row.value)).toEqual(["claude-sonnet-5"]);
  expect(modelRows(list, "5", dflt).map((row) => row.value).slice(0, 2)).toEqual(["opus", "claude-sonnet-5"]);
});

test("only each family's newest model is offered: a row with a full versioned id is left out", () => {
  const listed = [
    { value: "default", label: "Default" }, { value: "opus", label: "Opus 5.5" }, { value: "sonnet", label: "Sonnet 5.5" },
    { value: "claude-sonnet-5", label: "Sonnet 5" }, { value: "claude-opus-4-8", label: "Opus 4.8" }, { value: "claude-fable-5-1", label: "Fable 5.1" },
  ];
  expect(newestModelsOnly(listed).map((model) => model.value)).toEqual(["default", "opus", "sonnet"]);
});
