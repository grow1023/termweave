/**
 * Bionic reading for live terminal output (Settings › Terminal). The start of each word, Korean
 * included, is drawn bold (ESC[1m) and the rest faded before xterm draws it. Only the drawing
 * changes: the bytes the program sent, the buffer text, copy and search stay the same.
 *
 * The rest of a word is marked with overline (ESC[53m), an attribute programs all but never use.
 * PaneTerminal.css draws that mark as a fade, not a line, so one rule fades every kind of cell
 * (default, palette and RGB colors, both themes) by the amount chosen in Settings. Dim (ESC[2m)
 * could not do that: xterm's DOM renderer dims each kind its own way, or not at all.
 *
 * The transformer is stateful per pane: escape sequences split across chunks pass through
 * untouched, and text the program already made bold is left alone. A word cut by a chunk
 * boundary is treated as two words (ponytail: rare, and only the bold split moves).
 * text-vide (MIT) computes the same fixation but knows nothing of escape sequences, which it
 * would break; the formula below is the one line it would have given us.
 */
const WORD = /[\p{L}\p{M}\p{N}]/u;
const BOLD = "\x1b[1m", NORMAL = "\x1b[22m", DIM = "\x1b[2m", MARK = "\x1b[53m", UNMARK = "\x1b[55m";

/** the share of a longer word that is bold, by Settings › Bold part */
export const BIONIC_RATIO = { short: 0.3, medium: 0.4, long: 0.5 } as const;
export type BionicBold = keyof typeof BIONIC_RATIO;

/** how many leading characters to bold: 1 for short words, a share of longer ones */
export function fixation(length: number, ratio = 0.4): number {
  return length <= 1 ? 0 : length <= 3 ? 1 : Math.ceil(length * ratio);
}

type State = "text" | "esc" | "inter" | "csi" | "str" | "strEsc";

export function createBionic(): (chunk: string, enabled: boolean, ratio?: number) => string {
  let state: State = "text", params = "", bold = false, dim = false, over = false;
  const sgr = (list: string) => {
    const codes = list === "" ? [0] : list.split(";").map((token) => Number.parseInt(token, 10) || 0);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      if (code === 0) bold = dim = over = false;
      else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 22) bold = dim = false;
      else if (code === 53) over = true;
      else if (code === 55) over = false;
      else if ((code === 38 || code === 48 || code === 58) && !list.includes(":")) i += codes[i + 1] === 5 ? 2 : codes[i + 1] === 2 ? 4 : 0;
    }
  };
  return (chunk, enabled, ratio) => {
    let out = "", word = "";
    const flush = () => {
      // a program's own overline (rare) is not marked again; the CSS draws it as the same fade, without the line
      const chars = [...word], head = enabled && !bold && !over ? fixation(chars.length, ratio) : 0;
      // the rest is faded too: Hangul fonts draw bold barely heavier, so bold alone hardly shows
      out += head === 0 ? word : BOLD + chars.slice(0, head).join("") + NORMAL + (dim ? DIM : "") + MARK + chars.slice(head).join("") + UNMARK;
      word = "";
    };
    for (const ch of chunk) {
      if (state === "text") {
        if (WORD.test(ch)) { word += ch; continue; }
        flush();
        if (ch === "\x1b") state = "esc";
        out += ch;
        continue;
      }
      out += ch;
      if (state === "esc") state = ch === "[" ? (params = "", "csi") : "]P^_X".includes(ch) ? "str" : ch >= " " && ch <= "/" ? "inter" : "text";
      else if (state === "inter") { if (!(ch >= " " && ch <= "/")) state = "text"; }
      else if (state === "csi") {
        if (ch >= "@" && ch <= "~") { if (ch === "m") sgr(params); state = "text"; } else params += ch;
      } else if (state === "str") { if (ch === "\x07") state = "text"; else if (ch === "\x1b") state = "strEsc"; }
      else state = ch === "\\" ? "text" : "str";
    }
    flush();
    return out;
  };
}
