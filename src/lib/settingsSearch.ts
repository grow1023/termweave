/**
 * The settings search, as pure text matching. A query is split into words, and a text matches
 * when it holds every word, in any order: "알림 테스트" finds "테스트 알림", "pair qr" finds a
 * section whose keywords hold both. Case and Unicode width are folded, so "QR" finds "qr" and a
 * full-width "ＱＲ" typed on a phone keyboard finds it too.
 */

/** The words of `query`, folded; empty when the query is blank. */
export function queryWords(query: string): string[] {
  return fold(query).split(/\s+/u).filter((word) => word !== "");
}

/** True when `text` holds every one of `words` (an empty list matches nothing). */
export function matchesWords(text: string, words: readonly string[]): boolean {
  if (words.length === 0) return false;
  const haystack = fold(text);
  return words.every((word) => haystack.includes(word));
}

/**
 * What a section offers the search: its title, and the keywords a user would type for what it
 * holds but no row names (a QR code, a pairing code, ADB).
 */
export interface SearchSection {
  readonly title: string;
  readonly keywords: string;
}

/** A section whose title and keywords together hold every word is shown whole. */
export function sectionMatches(section: SearchSection, words: readonly string[]): boolean {
  return matchesWords(`${section.title} ${section.keywords}`, words);
}

/**
 * A row matches on its own text joined with its section's title and keywords, so one word can
 * name the section and another the row ("알림 테스트": the Alerts section, the test row).
 */
export function rowMatches(rowText: string, section: SearchSection, words: readonly string[]): boolean {
  return matchesWords(`${rowText} ${section.title} ${section.keywords}`, words);
}

function fold(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase();
}
