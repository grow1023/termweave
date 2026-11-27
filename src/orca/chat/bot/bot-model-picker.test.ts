import { expect, test } from "bun:test";

import type { Translate } from "../../../lib/i18n.ts";
import { modelChipText } from "./BotModelPicker.tsx";

const t: Translate = (key) => key;
const models = [{ value: "opus", label: "Opus 5.5" }];

test("the chip shows the bot's own choice, then what the chat reports, then a plain word", () => {
  expect(modelChipText({ model: "opus", effort: "high", runtime: "session" }, models, { model: "claude-x", effort: "low" }, t)).toBe("Opus 5.5 · High");
  expect(modelChipText({ model: "custom-id", effort: null }, models, { model: null, effort: null }, t)).toBe("custom-id");
  expect(modelChipText({ model: null, effort: null }, models, { model: "claude-x", effort: "medium" }, t)).toBe("claude-x · medium");
  expect(modelChipText({}, models, { model: null, effort: null }, t)).toBe("Model");
});

