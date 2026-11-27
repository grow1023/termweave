// What the companion says aloud of an answer: its sentences without Markdown marks, a few at most, so a
// spoken reply stays short. Sentences are spoken as they arrive, before the answer is whole. Pure, so
// companionVoice.test.ts covers it.
const SPOKEN_MAX = 320;
/** a spoken answer is short by instruction; a long written one is read only this far */
export const SPOKEN_SENTENCES = 4;

/** The answer's sentences as they are said. `whole` false: the answer still grows, so its last, unfinished sentence is left out. */
export function spokenSentences(answer: string, whole = true): string[] {
  const plain = answer
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>|]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  // a sentence ends at . ! ? (or a full-width form) followed by a space or the end: "v0.3.68" and "cart.ts" do not end one
  const sentences = plain.split(/(?<=[.!?。！？])\s+/).filter((part) => part !== "");
  const ended = whole || /[.!?。！？]$/.test(plain) ? sentences : sentences.slice(0, -1);
  return ended.slice(0, SPOKEN_SENTENCES);
}

/** The first two sentences, for a place that says an answer in one go. */
export function spokenPart(answer: string): string {
  const two = spokenSentences(answer).slice(0, 2).join(" ").trim();
  return two.length > SPOKEN_MAX ? `${two.slice(0, SPOKEN_MAX).trimEnd()}…` : two;
}
