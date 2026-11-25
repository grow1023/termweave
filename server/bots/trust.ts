/**
 * Folder trust for the agents a bot starts, as Orca does it (src/main/claude/configuration/
 * claude-folder-trust-file.ts and src/main/codex/trust, MIT): a fresh bot home or worker worktree
 * otherwise opens on the agent's "do you trust this folder?" question and the bot never starts.
 * Only folders TermWeave made itself are marked. A missing, unreadable or locked config is left as it is.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { BotAgent } from "../../shared/bots/types.ts";

export type TrustOutcome = "granted" | "unchanged" | "missing-config" | "locked" | "unreadable";

/** Claude: `projects[<path>].hasTrustDialogAccepted` in .claude.json (legacy ~/.claude/.config.json first). */
export function claudeConfigFile(env = process.env, home = homedir()): string {
  const legacy = join(env.CLAUDE_CONFIG_DIR ?? join(home, ".claude"), ".config.json");
  if (existsSync(legacy)) return legacy;
  return join(env.CLAUDE_CONFIG_DIR || home, `.claude${env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? "-custom-oauth" : ""}.json`);
}

export function codexConfigFile(env = process.env, home = homedir()): string {
  return join(env.CODEX_HOME || join(home, ".codex"), "config.toml");
}

/** Claude Code takes the same `<file>.lock` directory (proper-lockfile); a held lock is waited on briefly, then skipped. */
async function withLock(file: string, write: () => TrustOutcome): Promise<TrustOutcome> {
  const lock = `${file}.lock`;
  for (let attempt = 0; ; attempt++) {
    try { mkdirSync(lock); break; } catch {
      if (attempt === 4) return "locked";
      await Bun.sleep(50 * 2 ** attempt);
    }
  }
  try { return write(); } finally { try { rmdirSync(lock); } catch { /* gone already */ } }
}

function replace(file: string, text: string): void {
  const target = (() => { try { return realpathSync(file); } catch { return file; } })(); // keep a symlinked config a symlink
  const temp = `${target}.termweave-trust-${process.pid}.tmp`;
  writeFileSync(temp, text, { mode: 0o600 });
  renameSync(temp, target);
}

export async function trustClaudeFolder(folder: string, file = claudeConfigFile()): Promise<TrustOutcome> {
  if (!existsSync(file)) return "missing-config";
  const key = resolve(folder.normalize("NFC"));
  return withLock(file, () => {
    let config: Record<string, any>;
    try { config = JSON.parse(readFileSync(file, "utf8")); } catch { return "unreadable"; }
    if (typeof config !== "object" || config === null || Array.isArray(config)) return "unreadable";
    const projects = config.projects ?? {};
    if (typeof projects !== "object" || Array.isArray(projects)) return "unreadable";
    if (projects[key]?.hasTrustDialogAccepted === true) return "unchanged";
    replace(file, JSON.stringify({ ...config, projects: { ...projects, [key]: { ...projects[key], hasTrustDialogAccepted: true } } }, null, 2));
    return "granted";
  });
}

/** Codex: a `[projects."<path>"]` table with `trust_level = "trusted"`, added at the end when the table is not there yet. */
export async function trustCodexFolder(folder: string, file = codexConfigFile()): Promise<TrustOutcome> {
  if (!existsSync(file)) return "missing-config";
  const key = resolve(folder.normalize("NFC"));
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return "unreadable"; }
  // ponytail: an existing table for this path (trusted or not) is left alone; Orca's TOML editor repairs those, add it if a bot folder ever has one
  const header = `[projects.${JSON.stringify(key)}]`;
  if (text.split("\n").some((line) => line.trim() === header || line.trim() === `[projects.'${key}']`)) return "unchanged";
  replace(file, `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}\n${header}\ntrust_level = "trusted"\n`);
  return "granted";
}

export function trustFolder(agent: BotAgent, folder: string): Promise<TrustOutcome> {
  return agent === "claude" ? trustClaudeFolder(folder) : trustCodexFolder(folder);
}
