import { describe, expect, it } from "bun:test";
import { createBionic } from "./bionic.ts";

const B = "\x1b[1m", N = "\x1b[22m";
describe("bionic reading stream", () => {
  it("bolds the start of Korean and Latin words", () => {
    const run = createBionic();
    expect(run("안녕하세요 reading 가", true)).toBe(`${B}안녕${N}하세요 ${B}rea${N}ding 가`);
    expect(run("한글 OK", true)).toBe(`${B}한${N}글 ${B}O${N}K`);
  });
  it("never touches escape sequences, even split across chunks", () => {
    const run = createBionic();
    expect(run("\x1b[38;5;196mhello\x1b]0;title text\x07", true)).toBe(`\x1b[38;5;196m${B}he${N}llo\x1b]0;title text\x07`);
    expect(run("\x1b[3", true) + run("1mworld", true)).toBe(`\x1b[31m${B}wo${N}rld`);
  });
  it("leaves already bold text alone and keeps dim text dim", () => {
    const run = createBionic();
    expect(run("\x1b[1mbold words\x1b[0m plain", true)).toBe(`\x1b[1mbold words\x1b[0m ${B}pl${N}ain`);
    expect(run("\x1b[2mfaint", true)).toBe(`\x1b[2m${B}fa${N}\x1b[2mint`);
  });
  it("passes text through when off but keeps tracking state", () => {
    const run = createBionic();
    expect(run("\x1b[1mhello", false)).toBe("\x1b[1mhello");
    expect(run(" world", true)).toBe(" world");
  });
});
