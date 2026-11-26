// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/lines/native-chat-tool-line-label.ts
// and runs/native-chat-tool-run-label.ts; adapted for TermWeave: every word is a literal t() key.
import type { Translate } from "../../../lib/i18n.ts";
import type { NativeChatToolCategory } from "./lib/tool-icon.ts";
import type { NativeChatToolRowVerb } from "./lib/tool-line-label.ts";
import { continueNativeChatToolRunClause, type NativeChatToolRunSentenceWords } from "./lib/tool-run-sentence.ts";

export function toolRowVerb(verb: NativeChatToolRowVerb, t: Translate): string {
  switch (verb) {
    case "running": return t("Running");
    case "ran": return t("Ran");
    case "reading": return t("Reading");
    case "read": return t("Read");
    case "triedRead": return t("Tried to read");
    case "editing": return t("Editing");
    case "edited": return t("Edited");
    case "triedEdit": return t("Tried to edit");
    case "added": return t("Added");
    case "deleted": return t("Deleted");
    case "renamed": return t("Renamed");
    case "subagent": return t("Subagent");
    case "searching": return t("Searching");
    case "searched": return t("Searched");
    case "triedSearch": return t("Tried to search");
    case "listing": return t("Listing");
    case "listed": return t("Listed");
    case "triedList": return t("Tried to list");
    case "fetching": return t("Fetching");
    case "fetched": return t("Fetched");
    case "triedFetch": return t("Tried to fetch");
    case "searchingWeb": return t("Searching the web");
    case "searchedWeb": return t("Searched the web");
    case "triedSearchWeb": return t("Tried to search the web");
  }
}

function settledClause(category: NativeChatToolCategory, count: number, t: Translate): string {
  const one = count === 1;
  switch (category) {
    case "read": return one ? t("Read 1 file") : t("Read {count} files", { count });
    case "search": return one ? t("Searched 1 time") : t("Searched {count} times", { count });
    case "listFiles": return one ? t("Listed 1 directory") : t("Listed {count} directories", { count });
    case "unknown": return one ? t("Ran 1 command") : t("Ran {count} commands", { count });
    case "fileChange": return one ? t("Edited 1 file") : t("Edited {count} files", { count });
    case "webSearch": return one ? t("Searched the web 1 time") : t("Searched the web {count} times", { count });
    case "mcpToolCall": return one ? t("Used 1 integration") : t("Used {count} integrations", { count });
    case "subAgentActivity": return one ? t("Ran 1 agent") : t("Ran {count} agents", { count });
    case "todoList": return one ? t("Updated the plan") : t("Updated the plan {count} times", { count });
    case "other": return one ? t("Used 1 tool") : t("Used {count} tools", { count });
  }
}

function liveClause(category: NativeChatToolCategory, count: number, t: Translate): string {
  const one = count === 1;
  switch (category) {
    case "read": return one ? t("Reading 1 file") : t("Reading {count} files", { count });
    case "search": return one ? t("Searching 1 time") : t("Searching {count} times", { count });
    case "listFiles": return one ? t("Listing 1 directory") : t("Listing {count} directories", { count });
    case "unknown": return one ? t("Running 1 command") : t("Running {count} commands", { count });
    case "fileChange": return one ? t("Editing 1 file") : t("Editing {count} files", { count });
    case "webSearch": return one ? t("Searching the web 1 time") : t("Searching the web {count} times", { count });
    case "mcpToolCall": return one ? t("Using 1 integration") : t("Using {count} integrations", { count });
    case "subAgentActivity": return one ? t("Running 1 agent") : t("Running {count} agents", { count });
    case "todoList": return one ? t("Updating the plan") : t("Updating the plan {count} times", { count });
    case "other": return one ? t("Using 1 tool") : t("Using {count} tools", { count });
  }
}

/** The run sentence's words in the reader's language; `locale` decides lowercase continuation. */
export function toolRunSentenceWords(t: Translate, locale: string): NativeChatToolRunSentenceWords {
  return {
    continuation: (clause) => continueNativeChatToolRunClause(clause, locale),
    clause: (category, count, live) => (live ? liveClause(category, count, t) : settledClause(category, count, t)),
    pair: (first, second) => t("{first} and {second}", { first, second }),
    list: (leading, last) => t("{leading}, and {last}", { leading: leading.join(", "), last }),
  };
}
