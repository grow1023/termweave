import { describe, expect, it } from "bun:test";
import { createBionic } from "./bionic.ts";

const B = "\x1b[1m", N = "\x1b[22m", D = "\x1b[2m", M = "\x1b[53m", U = "\x1b[55m";
/** a word as the filter draws it: bold start, then the rest marked for the fade; a dim program stays dim */
const w = (head: string, tail: string, dim = false) => `${B}${head}${N}${dim ? D : ""}${M}${tail}${U}`;
describe("bionic reading stream", () => {
  it("bolds the start of Korean and Latin words", () => {
    const run = createBionic();
    expect(run("안녕하세요 reading 가", true)).toBe(`${w("안녕", "하세요")} ${w("rea", "ding")} 가`);
    expect(run("한글 OK", true)).toBe(`${w("한", "글")} ${w("O", "K")}`);
  });
  it("never touches escape sequences, even split across chunks", () => {
    const run = createBionic();
    expect(run("\x1b[38;5;196mhello\x1b]0;title text\x07", true)).toBe(`\x1b[38;5;196m${w("he", "llo")}\x1b]0;title text\x07`);
    expect(run("\x1b[3", true) + run("1mworld", true)).toBe(`\x1b[31m${w("wo", "rld")}`);
  });
  it("leaves already bold text alone and keeps dim text dim", () => {
    const run = createBionic();
    expect(run("\x1b[1mbold words\x1b[0m plain", true)).toBe(`\x1b[1mbold words\x1b[0m ${w("pl", "ain")}`);
    expect(run("\x1b[2mfaint", true)).toBe(`\x1b[2m${w("fa", "int", true)}`);
  });
  it("bolds the share chosen in Settings and leaves a program's own overline alone", () => {
    const run = createBionic();
    expect(run("reading", true, 0.3)).toBe(w("rea", "ding"));
    expect(run(" reading", true, 0.5)).toBe(` ${w("read", "ing")}`);
    expect(run("\x1b[53mlined\x1b[55m plain", true)).toBe(`\x1b[53mlined\x1b[55m ${w("pl", "ain")}`);
  });
  it("passes text through when off but keeps tracking state", () => {
    const run = createBionic();
    expect(run("\x1b[1mhello", false)).toBe("\x1b[1mhello");
    expect(run(" world", true)).toBe(" world");
  });
});
