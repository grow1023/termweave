// The t() words of words.ts read, in English, exactly as Orca's English record (stablyai/orca, MIT).
import { describe, expect, test } from "bun:test";

import { translate, type Translate } from "../../../lib/i18n.ts";
import { NATIVE_CHAT_TOOL_ROW_VERB_COPY, type NativeChatToolRowVerb } from "./lib/tool-line-label.ts";
import { NATIVE_CHAT_TOOL_RUN_SENTENCE_ENGLISH, nativeChatToolRunSentence } from "./lib/tool-run-sentence.ts";
import { FIXTURE_RUNS } from "./fixtures.ts";
import { toolRowVerb, toolRunSentenceWords } from "./words.ts";

const en: Translate = (key, vars) => translate("en", key, vars);

describe("tool words", () => {
  test("every row verb matches Orca's English", () => {
    for (const [verb, english] of Object.entries(NATIVE_CHAT_TOOL_ROW_VERB_COPY)) {
      expect(toolRowVerb(verb as NativeChatToolRowVerb, en)).toBe(english);
    }
  });
  test("run sentences match Orca's English for every fixture, settled and live", () => {
    for (const blocks of Object.values(FIXTURE_RUNS)) {
      for (const live of [false, true]) {
        expect(nativeChatToolRunSentence(blocks, { live }, toolRunSentenceWords(en, "en-US"))).toBe(
          nativeChatToolRunSentence(blocks, { live }, NATIVE_CHAT_TOOL_RUN_SENTENCE_ENGLISH),
        );
      }
    }
  });
});
